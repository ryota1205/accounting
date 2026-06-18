import pytest


@pytest.mark.parametrize("kind", ["clients", "instructors", "agencies"])
def test_master_crud(client, kind):
    res = client.post(f"/api/masters/{kind}", json={"name": "テスト名"})
    assert res.status_code == 201
    mid = res.json()["id"]
    lst = client.get(f"/api/masters/{kind}").json()
    assert any(m["name"] == "テスト名" for m in lst)
    upd = client.put(f"/api/masters/{kind}/{mid}", json={"name": "変更後", "active": False})
    assert upd.status_code == 200
    assert upd.json()["name"] == "変更後"
    assert upd.json()["active"] is False
    dele = client.delete(f"/api/masters/{kind}/{mid}")
    assert dele.status_code == 204


def test_master_duplicate_name_rejected(client):
    client.post("/api/masters/clients", json={"name": "重複"})
    res = client.post("/api/masters/clients", json={"name": "重複"})
    assert res.status_code == 409


def test_unknown_kind_returns_404(client):
    assert client.get("/api/masters/unknown").status_code == 404


def test_update_master_duplicate_rejected(client):
    client.post("/api/masters/clients", json={"name": "A社"})
    b = client.post("/api/masters/clients", json={"name": "B社"}).json()
    res = client.put(f"/api/masters/clients/{b['id']}", json={"name": "A社", "active": True})
    assert res.status_code == 409


def test_client_can_link_agency(client):
    created = client.post("/api/masters/clients",
                          json={"name": "紐づけ企業", "agency": "TAC"}).json()
    assert created["agency"] == "TAC"
    # 一覧でも代理店が返る
    listed = client.get("/api/masters/clients").json()
    row = next(m for m in listed if m["name"] == "紐づけ企業")
    assert row["agency"] == "TAC"
    # 更新で代理店を変更
    upd = client.put(f"/api/masters/clients/{created['id']}",
                     json={"name": "紐づけ企業", "active": True, "agency": "パーソル総研"}).json()
    assert upd["agency"] == "パーソル総研"
