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
