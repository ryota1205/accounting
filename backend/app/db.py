import os
from sqlmodel import SQLModel, Session, create_engine

DATABASE_URL = os.getenv("ACCOUNTING_DB", "sqlite:///./accounting.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db() -> None:
    # models をインポートしてメタデータへ登録してから作成する
    from app import models  # noqa: F401
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
