import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlmodel.pool import StaticPool

from app.main import app
from app.db import get_session
from app.models import User
from app import auth


def _seed_users(session: Session) -> None:
    for username, name, role, pw in [
        ("admin", "管理者", "admin", "admin1234"),
        ("staff", "担当者", "staff", "staff1234"),
    ]:
        h, salt = auth.hash_password(pw)
        session.add(User(username=username, name=name, role=role,
                         password_hash=h, salt=salt))
    session.commit()


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        _seed_users(session)
        yield session


def _make_client(session, token: str | None) -> TestClient:
    app.dependency_overrides[get_session] = lambda: session
    test_client = TestClient(app)
    if token:
        test_client.headers.update({"Authorization": f"Bearer {token}"})
    return test_client


@pytest.fixture(name="client")
def client_fixture(session):
    # 既定は admin 認証済み（既存テストはこれで全てのAPIにアクセス可能）
    test_client = _make_client(session, auth.make_token("admin", "admin"))
    yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(name="staff_client")
def staff_client_fixture(session):
    test_client = _make_client(session, auth.make_token("staff", "staff"))
    yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(name="anon_client")
def anon_client_fixture(session):
    test_client = _make_client(session, None)
    yield test_client
    app.dependency_overrides.clear()
