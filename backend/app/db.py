import os
from sqlmodel import SQLModel, Session, create_engine, select
from sqlalchemy import text

DATABASE_URL = os.getenv("ACCOUNTING_DB", "sqlite:///./accounting.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db() -> None:
    # models をインポートしてメタデータへ登録してから作成する
    from app import models  # noqa: F401
    SQLModel.metadata.create_all(engine)
    _run_migrations()
    _seed_users()


def _seed_users() -> None:
    """初期2アカウント（存在しなければ作成）。初期PWは README 記載・変更前提。"""
    from app.models import User
    from app import auth
    seeds = [
        # (username, name, role, 初期パスワード)
        ("admin", "管理者", "admin", "admin1234"),
        ("staff", "担当者", "staff", "staff1234"),
    ]
    with Session(engine) as session:
        for username, name, role, pw in seeds:
            if session.exec(select(User).where(User.username == username)).first() is None:
                h, salt = auth.hash_password(pw)
                session.add(User(username=username, name=name, role=role,
                                 password_hash=h, salt=salt))
        session.commit()


def _run_migrations() -> None:
    """既存DB向けの簡易マイグレーション（不足カラム追加・値移行・初期データ投入）。"""
    # deal に追加した拡張カラム（カラム名 -> SQL型）
    deal_columns = {
        "project_name": "VARCHAR",
        "training_theme": "VARCHAR",
        "direct_cost": "INTEGER",
        "allocated_fixed_cost": "INTEGER DEFAULT 0",
        "expected_sales_amount": "INTEGER DEFAULT 0",
        "confidence_rank": "VARCHAR",
        "project_status": "VARCHAR DEFAULT '受注'",
        "customer_type": "VARCHAR",
        "lost_reason": "VARCHAR",
        "invoice_date": "DATE",
        "invoice_amount": "INTEGER",
        "paid_amount": "INTEGER DEFAULT 0",
    }
    with engine.connect() as conn:
        client_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(client)"))]
        if client_cols and "agency" not in client_cols:
            conn.execute(text("ALTER TABLE client ADD COLUMN agency VARCHAR"))
        if client_cols and "address" not in client_cols:
            conn.execute(text("ALTER TABLE client ADD COLUMN address VARCHAR"))
        if client_cols and "url" not in client_cols:
            conn.execute(text("ALTER TABLE client ADD COLUMN url VARCHAR"))
        if client_cols and "industry" not in client_cols:
            conn.execute(text("ALTER TABLE client ADD COLUMN industry VARCHAR"))

        # user テーブルに password_changed 列を追加（既存DB向け）
        user_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(user)"))]
        if user_cols and "password_changed" not in user_cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN password_changed BOOLEAN DEFAULT 0"))

        deal_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(deal)"))]
        if deal_cols:
            for name, ddl in deal_columns.items():
                if name not in deal_cols:
                    conn.execute(text(f"ALTER TABLE deal ADD COLUMN {name} {ddl}"))
            # 入金ステータス2値 → 6状態へ移行（unpaid=請求済扱い）
            conn.execute(text("UPDATE deal SET payment_status='invoiced' WHERE payment_status='unpaid'"))
            # 入金済の入金額を請求額にそろえる（未設定=0 のもののみ）
            conn.execute(text(
                "UPDATE deal SET paid_amount=COALESCE(invoice_amount, billing) "
                "WHERE payment_status='paid' AND (paid_amount IS NULL OR paid_amount=0)"
            ))
        setting_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(setting)"))]
        if setting_cols and "opening_balance" not in setting_cols:
            conn.execute(text("ALTER TABLE setting ADD COLUMN opening_balance INTEGER DEFAULT 0"))
        # 分析画面「人件費の目安」用の経営前提（既存DB向け）
        setting_add = {
            "labor_share": "FLOAT DEFAULT 0.5",
            "headcount": "FLOAT DEFAULT 0",
            "bonus_months": "FLOAT DEFAULT 2.0",
            "exec_comp_annual": "INTEGER DEFAULT 0",
            "benchmarks_json": "VARCHAR",
        }
        if setting_cols:
            for name, ddl in setting_add.items():
                if name not in setting_cols:
                    conn.execute(text(f"ALTER TABLE setting ADD COLUMN {name} {ddl}"))
        conn.commit()

    # 受注確度の初期掛け率を投入（無ければ）
    from app.models import ConfidenceRate
    defaults = {"A": 0.8, "B": 0.5, "C": 0.2}
    with Session(engine) as session:
        for rank, rate in defaults.items():
            if session.get(ConfidenceRate, rank) is None:
                session.add(ConfidenceRate(rank=rank, rate=rate))
        session.commit()

    # 大型支払いの定番項目を初期投入（1件も無ければ）
    from app.models import PaymentItem
    default_items = ["消費税", "社会保険料", "労働保険料", "法人税等", "住民税・事業税", "源泉所得税"]
    with Session(engine) as session:
        if not session.exec(select(PaymentItem)).first():
            for i, name in enumerate(default_items):
                session.add(PaymentItem(name=name, sort_order=i))
            session.commit()


def get_session():
    with Session(engine) as session:
        yield session
