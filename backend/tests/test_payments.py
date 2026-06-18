def _post(tc, **over):
    base = dict(held_on="2026-06-19", client="A社", fee=400000,
                payment_due="2026-07-31")
    base.update(over)
    return tc.post("/api/deals", json=base).json()


def test_payments_list_unpaid_only(client):
    _post(client, client="未A")
    paid = _post(client, client="済B")
    client.post(f"/api/deals/{paid['id']}/pay", json={"paid_on": "2026-07-20"})
    res = client.get("/api/payments", params={"status": "unpaid", "fiscal_year": 2026})
    names = [r["client"] for r in res.json()]
    assert "未A" in names
    assert "済B" not in names


def test_mark_paid_sets_status_and_date(client):
    d = _post(client)
    res = client.post(f"/api/deals/{d['id']}/pay", json={"paid_on": "2026-07-25"})
    assert res.status_code == 200
    assert res.json()["payment_status"] == "paid"
    assert res.json()["paid_on"] == "2026-07-25"


def test_mark_paid_without_date_uses_today(client):
    d = _post(client)
    res = client.post(f"/api/deals/{d['id']}/pay", json={})
    assert res.status_code == 200
    assert res.json()["payment_status"] == "paid"
    assert res.json()["paid_on"] is not None
