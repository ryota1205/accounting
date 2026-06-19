def test_login_success(anon_client):
    r = anon_client.post("/api/auth/login", json={"username": "admin", "password": "admin1234"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"] == {"username": "admin", "name": "管理者", "role": "admin"}
    assert isinstance(body["token"], str) and body["token"]


def test_login_wrong_password(anon_client):
    r = anon_client.post("/api/auth/login", json={"username": "admin", "password": "bad"})
    assert r.status_code == 401


def test_login_unknown_user(anon_client):
    r = anon_client.post("/api/auth/login", json={"username": "ghost", "password": "x"})
    assert r.status_code == 401


def test_me_with_token(anon_client):
    token = anon_client.post("/api/auth/login",
                             json={"username": "staff", "password": "staff1234"}).json()["token"]
    r = anon_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["role"] == "staff"


def test_me_without_token(anon_client):
    assert anon_client.get("/api/auth/me").status_code == 401


def test_change_password_flow(anon_client):
    login = anon_client.post("/api/auth/login", json={"username": "staff", "password": "staff1234"})
    token = login.json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    # 現在のPWが違う → 400
    assert anon_client.post("/api/auth/change-password", headers=h,
                            json={"current_password": "wrong", "new_password": "newpass1"}).status_code == 400
    # 正常変更
    assert anon_client.post("/api/auth/change-password", headers=h,
                            json={"current_password": "staff1234", "new_password": "newpass1"}).status_code == 200
    # 新PWでログイン可・旧PWは不可
    assert anon_client.post("/api/auth/login",
                            json={"username": "staff", "password": "newpass1"}).status_code == 200
    assert anon_client.post("/api/auth/login",
                            json={"username": "staff", "password": "staff1234"}).status_code == 401
