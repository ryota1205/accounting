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
    """既存DB向けの簡易マイグレーション（不足カラムを追加）。"""
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(client)"))]
        if cols and "agency" not in cols:
            conn.execute(text("ALTER TABLE client ADD COLUMN agency VARCHAR"))
            conn.commit()


def get_session():
    with Session(engine) as session:
        yield session
