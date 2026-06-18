from app.calc import fiscal_months, monthly_buckets, pl_metrics


def test_fiscal_months_returns_apr_to_mar_year_month_pairs():
    months = fiscal_months(2026)
    assert months[0] == (2026, 4)
    assert months[8] == (2026, 12)
    assert months[9] == (2027, 1)
    assert months[11] == (2027, 3)
    assert len(months) == 12


def test_monthly_buckets_sums_amounts_into_12_slots():
    items = [(2026, 4, 100), (2026, 4, 50), (2027, 1, 200)]
    buckets = monthly_buckets(2026, items)
    assert buckets[0] == 150
    assert buckets[9] == 200
    assert sum(buckets) == 350


def test_pl_metrics_computes_bep_and_profit():
    m = pl_metrics(net_sales=20000000, variable=4000000, annual_fixed=12000000)
    assert abs(m["cm_ratio"] - 0.8) < 1e-9
    assert m["bep"] == 15000000
    assert m["operating_profit"] == 4000000


def test_pl_metrics_handles_zero_sales():
    m = pl_metrics(net_sales=0, variable=0, annual_fixed=1000000)
    assert m["cm_ratio"] == 0
    assert m["bep"] == 0
    assert m["operating_profit"] == -1000000


def _post(tc, **over):
    base = dict(held_on="2026-06-19", client="A社", instructor="高橋",
                agency="TAC", fee=400000)
    base.update(over)
    return tc.post("/api/deals", json=base)


def test_summary_monthly_returns_12_billing_buckets(client):
    _post(client, held_on="2026-04-10", client="A社", fee=400000)
    _post(client, held_on="2026-05-10", client="B社", fee=200000)
    res = client.get("/api/summary/monthly", params={"fiscal_year": 2026})
    assert res.status_code == 200
    body = res.json()
    assert body["labels"][0] == "4月"
    assert body["current"][0] == 440000
    assert body["current"][1] == 220000
    assert body["total"] == 660000
    assert all(v is None for v in body["prev"])


def test_summary_annual_matrix_by_client(client):
    _post(client, held_on="2026-04-10", client="A社", fee=400000)
    _post(client, held_on="2026-08-10", client="A社", fee=400000)
    _post(client, held_on="2026-05-10", client="B社", fee=200000)
    res = client.get("/api/summary/annual", params={"fiscal_year": 2026})
    body = res.json()
    a_row = next(r for r in body["rows"] if r["client"] == "A社")
    assert a_row["months"][0] == 440000
    assert a_row["months"][4] == 440000
    assert a_row["total"] == 880000
    assert body["month_totals"][0] == 440000
    assert body["grand_total"] == 1100000


def test_summary_by_instructor_share(client):
    _post(client, held_on="2026-04-10", instructor="高橋", fee=400000)
    _post(client, held_on="2026-04-10", instructor="窪田", fee=600000)
    res = client.get("/api/summary/by", params={"dim": "instructor",
                     "frm": "2026-04-01", "to": "2027-03-31"})
    body = res.json()
    total = sum(r["amount"] for r in body)
    assert total == 1100000
    takahashi = next(r for r in body if r["name"] == "高橋")
    assert takahashi["amount"] == 440000
    assert abs(takahashi["share"] - 440000 / 1100000) < 1e-9
