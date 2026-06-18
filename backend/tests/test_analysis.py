def _post(tc, **over):
    base = dict(held_on="2026-06-10", client="A社", fee=1000000, direct_cost=400000,
                project_status="受注", customer_type="新規")
    base.update(over)
    return tc.post("/api/deals", json=base).json()


def test_analysis_by_client_and_dependency(client):
    _post(client, client="A社", fee=1000000, direct_cost=400000)   # net100万/粗利60万
    _post(client, client="A社", fee=1000000, direct_cost=400000)
    _post(client, client="B社", fee=500000, direct_cost=0)         # net50万/粗利50万
    res = client.get("/api/summary/analysis", params={"fiscal_year": 2026})
    body = res.json()
    a = next(r for r in body["by_client"] if r["name"] == "A社")
    assert a["sales"] == 2000000
    assert a["gross"] == 1200000
    assert abs(a["gross_rate"] - 0.6) < 1e-9
    assert a["count"] == 2
    # 上位1社依存度 = A社200万 / 全体250万 = 0.8
    assert abs(body["dependency"]["top1"] - 2000000 / 2500000) < 1e-9
    assert body["dependency"]["total"] == 2500000


def test_analysis_customer_type_share(client):
    _post(client, client="A社", fee=1000000, direct_cost=0, customer_type="新規")
    _post(client, client="B社", fee=1000000, direct_cost=0, customer_type="リピート")
    body = client.get("/api/summary/analysis", params={"fiscal_year": 2026}).json()
    shares = {r["type"]: r["share"] for r in body["by_customer_type"]}
    assert abs(shares["新規"] - 0.5) < 1e-9
    assert abs(shares["リピート"] - 0.5) < 1e-9


def test_analysis_yoy_prev_flag(client):
    _post(client, held_on="2026-06-10")
    yoy = client.get("/api/summary/analysis", params={"fiscal_year": 2026}).json()["yoy"]
    assert yoy["prev_has_data"] is False
    assert yoy["total_sales_cur"] == 1000000
    assert len(yoy["sales_cur"]) == 12
