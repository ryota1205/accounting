def _post(tc, **over):
    base = dict(held_on="2026-06-10", client="A社", fee=1000000,
                direct_cost=300000, project_status="受注")
    base.update(over)
    return tc.post("/api/deals", json=base).json()


def test_month_summary_basic_metrics(client):
    # 月額固定費（年度設定）= 50万 → 当月固定費 50万
    client.put("/api/settings/2026", json={"monthly_fixed_cost": 500000})
    _post(client, client="A社", fee=1000000, direct_cost=300000)  # 6月 net100万/原価30万
    _post(client, client="B社", fee=1000000, direct_cost=300000)  # 6月
    res = client.get("/api/summary/month", params={"ym": "2026-06"})
    assert res.status_code == 200
    cur = res.json()["current"]
    assert cur["sales"] == 2000000           # 税抜売上合計
    assert cur["gross_profit"] == 1400000    # 200万 - 原価60万
    assert abs(cur["gross_rate"] - 0.7) < 1e-9
    assert cur["fixed_cost"] == 500000
    # 限界利益率0.7, BEP = 50万 / 0.7 = 714,286
    assert cur["bep"] == round(500000 / 0.7)
    assert cur["bep_diff"] == 2000000 - cur["bep"]
    assert cur["order_count"] == 2
    assert cur["avg_price"] == 1000000


def test_month_summary_monthly_fixed_cost_override(client):
    client.put("/api/settings/2026", json={"monthly_fixed_cost": 500000})
    client.put("/api/settings/monthly-fixed-cost/2026-06", json={"fixed_cost_amount": 800000})
    _post(client, fee=1000000, direct_cost=300000)
    cur = client.get("/api/summary/month", params={"ym": "2026-06"}).json()["current"]
    assert cur["fixed_cost"] == 800000  # 月次設定が優先


def test_month_summary_weighted_forecast(client):
    _post(client, fee=0, direct_cost=0, expected_sales_amount=1000000, confidence_rank="A")
    cur = client.get("/api/summary/month", params={"ym": "2026-06"}).json()["current"]
    assert cur["expected_sales"] == 1000000
    assert cur["weighted_forecast"] == 800000  # 100万 × 0.8


def test_month_summary_prev_year_flag(client):
    _post(client, held_on="2026-06-10")
    body = client.get("/api/summary/month", params={"ym": "2026-06"}).json()
    assert body["prev_year_has_data"] is False
