def test_confidence_rates_seeded_defaults(client):
    rates = {r["rank"]: r["rate"] for r in client.get("/api/confidence-rates").json()}
    assert rates["A"] == 0.8
    assert rates["B"] == 0.5
    assert rates["C"] == 0.2


def test_confidence_rate_can_be_updated(client):
    res = client.put("/api/confidence-rates/A", json={"rate": 0.9})
    assert res.status_code == 200
    assert res.json()["rate"] == 0.9
    rates = {r["rank"]: r["rate"] for r in client.get("/api/confidence-rates").json()}
    assert rates["A"] == 0.9


def test_confidence_rate_unknown_rank_404(client):
    assert client.put("/api/confidence-rates/Z", json={"rate": 0.5}).status_code == 404
