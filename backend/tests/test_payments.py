def _post(tc, **over):
    base = dict(held_on="2026-06-19", client="A社", fee=400000,
                payment_due="2026-07-31")
    base.update(over)
    return tc.post("/api/deals", json=base).json()


def test_payments_list_filters_by_status(client):
    _post(client, client="未A", payment_status="invoiced")
    paid = _post(client, client="済B", payment_status="invoiced")
    client.post(f"/api/deals/{paid['id']}/pay", json={"paid_on": "2026-07-20"})
    res = client.get("/api/payments", params={"status": "invoiced", "fiscal_year": 2026})
    names = [r["client"] for r in res.json()]
    assert "未A" in names
    assert "済B" not in names


def test_mark_paid_sets_status_date_and_amount(client):
    d = _post(client, payment_status="invoiced")
    res = client.post(f"/api/deals/{d['id']}/pay", json={"paid_on": "2026-07-25"})
    # 入金額が請求額(=billing)にそろう
    assert res.json()["paid_amount"] == res.json()["billing"]
    assert res.status_code == 200
    assert res.json()["payment_status"] == "paid"
    assert res.json()["paid_on"] == "2026-07-25"


def test_mark_paid_without_date_uses_today(client):
    d = _post(client)
    res = client.post(f"/api/deals/{d['id']}/pay", json={})
    assert res.status_code == 200
    assert res.json()["payment_status"] == "paid"
    assert res.json()["paid_on"] is not None
