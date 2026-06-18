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
