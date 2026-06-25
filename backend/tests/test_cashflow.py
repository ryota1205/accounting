def test_items_seeded_empty_then_create_and_list(client):
    # テストDBは未シード（conftestは create_all のみ）→ 初期は空
    assert client.get("/api/cashflow/items").json() == []
    # 追加
    res = client.post("/api/cashflow/items", json={"name": "消費税"})
    assert res.status_code == 200
    assert res.json()["name"] == "消費税"
    assert res.json()["sort_order"] == 0
    client.post("/api/cashflow/items", json={"name": "社会保険料"})
    items = client.get("/api/cashflow/items").json()
    assert [i["name"] for i in items] == ["消費税", "社会保険料"]


def test_item_rename(client):
    item = client.post("/api/cashflow/items", json={"name": "仮"}).json()
    res = client.patch(f"/api/cashflow/items/{item['id']}", json={"name": "法人税等"})
    assert res.status_code == 200
    assert res.json()["name"] == "法人税等"


def test_item_logical_delete_hides_from_list(client):
    item = client.post("/api/cashflow/items", json={"name": "消す予定"}).json()
    res = client.delete(f"/api/cashflow/items/{item['id']}")
    assert res.status_code == 200
    names = [i["name"] for i in client.get("/api/cashflow/items").json()]
    assert "消す予定" not in names
