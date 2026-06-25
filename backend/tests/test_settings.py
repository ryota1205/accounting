def test_get_settings_defaults_to_zero(client):
    res = client.get("/api/settings/2026")
    assert res.status_code == 200
    assert res.json()["fiscal_year"] == 2026
    assert res.json()["monthly_fixed_cost"] == 0


def test_put_settings_upserts(client):
    res = client.put("/api/settings/2026", json={"monthly_fixed_cost": 1500000})
    assert res.status_code == 200
    assert res.json()["monthly_fixed_cost"] == 1500000
    assert client.get("/api/settings/2026").json()["monthly_fixed_cost"] == 1500000
    client.put("/api/settings/2026", json={"monthly_fixed_cost": 2000000})
    assert client.get("/api/settings/2026").json()["monthly_fixed_cost"] == 2000000


def test_settings_opening_balance_defaults_to_zero(client):
    res = client.get("/api/settings/2026")
    assert res.status_code == 200
    assert res.json()["opening_balance"] == 0


def test_put_opening_balance_does_not_clear_fixed_cost(client):
    # 固定費を入れてから、期首残高だけを送る → 固定費は維持される（部分更新）
    client.put("/api/settings/2026", json={"monthly_fixed_cost": 1500000})
    res = client.put("/api/settings/2026", json={"opening_balance": 5000000})
    assert res.status_code == 200
    body = client.get("/api/settings/2026").json()
    assert body["opening_balance"] == 5000000
    assert body["monthly_fixed_cost"] == 1500000  # 消えていないこと
