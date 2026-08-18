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


def test_summary_monthly_returns_12_net_buckets(client):
    _post(client, held_on="2026-04-10", client="A社", fee=400000)
    _post(client, held_on="2026-05-10", client="B社", fee=200000)
    res = client.get("/api/summary/monthly", params={"fiscal_year": 2026})
    assert res.status_code == 200
    body = res.json()
    assert body["labels"][0] == "4月"
    assert body["current"][0] == 400000
    assert body["current"][1] == 200000
    assert body["total"] == 600000
    assert all(v is None for v in body["prev"])


def test_summary_annual_matrix_by_client(client):
    _post(client, held_on="2026-04-10", client="A社", fee=400000)
    _post(client, held_on="2026-08-10", client="A社", fee=400000)
    _post(client, held_on="2026-05-10", client="B社", fee=200000)
    res = client.get("/api/summary/annual", params={"fiscal_year": 2026})
    body = res.json()
    a_row = next(r for r in body["rows"] if r["client"] == "A社")
    assert a_row["months"][0] == 400000
    assert a_row["months"][4] == 400000
    assert a_row["total"] == 800000
    assert body["month_totals"][0] == 400000
    assert body["grand_total"] == 1000000


def test_summary_by_instructor_share(client):
    _post(client, held_on="2026-04-10", instructor="高橋", fee=400000)
    _post(client, held_on="2026-04-10", instructor="窪田", fee=600000)
    res = client.get("/api/summary/by", params={"dim": "instructor",
                     "frm": "2026-04-01", "to": "2027-03-31"})
    body = res.json()
    total = sum(r["amount"] for r in body)
    assert total == 1000000
    takahashi = next(r for r in body if r["name"] == "高橋")
    assert takahashi["amount"] == 400000
    assert abs(takahashi["share"] - 400000 / 1000000) < 1e-9


def test_summary_pl_full(client):
    client.put("/api/settings/2026", json={"monthly_fixed_cost": 1000000})
    client.post("/api/deals", json=dict(held_on="2026-04-10", client="A社",
                fee=10000000, transport=0, other=0, instructor_fee=2000000))
    client.post("/api/deals", json=dict(held_on="2026-05-10", client="B社",
                fee=10000000, transport=0, other=0, instructor_fee=2000000))
    res = client.get("/api/summary/pl", params={"fiscal_year": 2026})
    assert res.status_code == 200
    b = res.json()
    assert b["net_sales"] == 20000000
    assert b["variable"] == 4000000
    assert b["annual_fixed"] == 12000000
    assert abs(b["cm_ratio"] - 0.8) < 1e-9
    assert b["bep"] == 15000000
    assert b["operating_profit"] == 4000000
    assert b["monthly_net"][0] == 10000000
    assert b["monthly_net"][1] == 10000000
    assert abs(b["gross_margin_rate"][0] - 0.8) < 1e-9
    assert b["cum_net"][0] == 10000000
    assert b["cum_total_cost"][0] == 3000000
    assert b["cum_total_cost"][1] == 6000000  # (200万+100万)×2ヶ月
    assert abs(b["safety_margin_ratio"] - (20000000 - 15000000) / 20000000) < 1e-9
    assert abs(b["bep_achievement"] - 20000000 / 15000000) < 1e-9
    assert abs(b["top_clients"][0]["share"] - 0.5) < 1e-9
    assert b["top_clients"][0]["name"] in ("A社", "B社")
    assert b["top_clients"][0]["amount"] == 10000000
    assert len(b["top_clients"]) <= 5


# ===== 受注前ステータスは売上合計に含めない =====
PRE_ORDER_STATUSES = ["問い合わせ", "初回相談", "提案中", "失注"]


def test_monthly_excludes_pre_order_statuses(client):
    _post(client, held_on="2026-04-10", client="受注A", fee=400000,
          project_status="受注")
    for i, st in enumerate(PRE_ORDER_STATUSES):
        _post(client, held_on="2026-04-10", client=f"見込{i}", fee=900000,
              project_status=st)
    body = client.get("/api/summary/monthly", params={"fiscal_year": 2026}).json()
    assert body["current"][0] == 400000
    assert body["total"] == 400000


def test_annual_and_by_dimension_exclude_pre_order_statuses(client):
    _post(client, held_on="2026-04-10", client="受注A", instructor="高橋",
          fee=400000, project_status="実施済")
    _post(client, held_on="2026-04-10", client="提案B", instructor="窪田",
          fee=900000, project_status="提案中")
    annual = client.get("/api/summary/annual", params={"fiscal_year": 2026}).json()
    assert [r["client"] for r in annual["rows"]] == ["受注A"]
    assert annual["grand_total"] == 400000

    by = client.get("/api/summary/by", params={"dim": "instructor",
                    "frm": "2026-04-01", "to": "2027-03-31"}).json()
    assert [r["name"] for r in by] == ["高橋"]
    assert by[0]["amount"] == 400000


def test_pl_and_month_metrics_exclude_pre_order_statuses(client):
    _post(client, held_on="2026-04-10", client="受注A", fee=1000000,
          direct_cost=300000, project_status="受注")
    _post(client, held_on="2026-04-10", client="提案B", fee=5000000,
          direct_cost=1000000, project_status="提案中")
    pl = client.get("/api/summary/pl", params={"fiscal_year": 2026}).json()
    assert pl["net_sales"] == 1000000
    assert pl["variable"] == 300000
    assert [c["name"] for c in pl["top_clients"]] == ["受注A"]

    cur = client.get("/api/summary/month", params={"ym": "2026-04"}).json()["current"]
    assert cur["sales"] == 1000000
    assert cur["gross_profit"] == 700000
    assert cur["order_count"] == 1
    assert cur["deal_count"] == 2  # 件数は全ステータスを数える
