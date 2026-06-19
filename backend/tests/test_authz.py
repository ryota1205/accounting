"""ロール別アクセス制御の検証。
client=admin認証済み / staff_client=staff認証済み / anon_client=未認証。"""


def test_unauthenticated_is_blocked(anon_client):
    assert anon_client.get("/api/deals").status_code == 401
    assert anon_client.get("/api/summary/monthly?fiscal_year=2026").status_code == 401
    assert anon_client.get("/api/masters/clients").status_code == 401


def test_staff_can_use_deals_and_payments(staff_client):
    assert staff_client.get("/api/deals").status_code == 200
    assert staff_client.get("/api/payments").status_code == 200
    # 案件作成も可
    r = staff_client.post("/api/deals", json={
        "held_on": "2026-04-10", "client": "STAFFCO", "fee": 100000, "instructor_fee": 30000,
    })
    assert r.status_code == 201


def test_staff_can_read_masters_and_rates(staff_client):
    assert staff_client.get("/api/masters/clients").status_code == 200
    assert staff_client.get("/api/confidence-rates").status_code == 200


def test_staff_blocked_from_admin_areas(staff_client):
    assert staff_client.get("/api/summary/pl?fiscal_year=2026").status_code == 403
    assert staff_client.get("/api/summary/monthly?fiscal_year=2026").status_code == 403
    assert staff_client.get("/api/settings/2026").status_code == 403
    # マスタ書き込みは admin のみ
    assert staff_client.post("/api/masters/clients", json={"name": "X", "active": True}).status_code == 403
    assert staff_client.put("/api/confidence-rates/A", json={"rate": 0.9}).status_code == 403


def test_admin_can_access_everything(client):
    assert client.get("/api/deals").status_code == 200
    assert client.get("/api/summary/pl?fiscal_year=2026").status_code == 200
    assert client.get("/api/settings/2026").status_code == 200
    assert client.get("/api/masters/clients").status_code == 200
    assert client.post("/api/masters/clients", json={"name": "AdminCo", "active": True}).status_code == 201
