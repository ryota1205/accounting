import os
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("ACCOUNTING_DB", "sqlite:///./accounting.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db() -> None:
    # models をインポートしてメタデータへ登録してから作成する
    from app import models  # noqa: F401
    SQLModel.metadata.create_all(engine)
    _run_migrations()


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
        conn.commit()

    # 受注確度の初期掛け率を投入（無ければ）
    from app.models import ConfidenceRate
    defaults = {"A": 0.8, "B": 0.5, "C": 0.2}
    with Session(engine) as session:
        for rank, rate in defaults.items():
            if session.get(ConfidenceRate, rank) is None:
                session.add(ConfidenceRate(rank=rank, rate=rate))
        session.commit()


def get_session():
    with Session(engine) as session:
        yield session
