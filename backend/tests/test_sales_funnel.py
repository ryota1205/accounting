def _post(tc, status, **over):
    base = dict(held_on="2026-06-10", client="A社", fee=100000, project_status=status)
    base.update(over)
    return tc.post("/api/deals", json=base).json()


def test_funnel_counts_and_win_rate(client):
    _post(client, "提案中")
    _post(client, "受注")
    _post(client, "実施済")
    _post(client, "失注", lost_reason="価格")
    _post(client, "失注", lost_reason="価格")
    _post(client, "失注", lost_reason="日程")
    cur = client.get("/api/summary/sales", params={"ym": "2026-06"}).json()["current"]
    # 提案=提案中1+受注1+実施済1+失注3 = 6
    assert cur["proposals"] == 6
    # 受注=受注1+実施済1 = 2
    assert cur["orders"] == 2
    assert cur["lost"] == 3
    # 受注率 = 2/6
    assert abs(cur["win_rate"] - 2 / 6) < 1e-9
    reasons = {r["reason"]: r["count"] for r in cur["lost_reasons"]}
    assert reasons["価格"] == 2
    assert reasons["日程"] == 1


def test_funnel_includes_manual_activity(client):
    client.put("/api/sales-activity/2026-06", json={"inquiries": 20, "first_meetings": 8})
    _post(client, "問い合わせ")  # 自動カウント +1
    cur = client.get("/api/summary/sales", params={"ym": "2026-06"}).json()["current"]
    assert cur["inquiries"] == 21       # 手入力20 + 自動1
    assert cur["first_meetings"] == 8   # 手入力のみ


def test_funnel_zero_proposals_no_div_error(client):
    cur = client.get("/api/summary/sales", params={"ym": "2026-06"}).json()["current"]
    assert cur["win_rate"] == 0.0
