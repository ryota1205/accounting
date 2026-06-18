from datetime import date
from app.calc import calc_tax, calc_billing, fiscal_year_of, month_end, revenue_month_of


def test_calc_tax_is_10_percent_of_fee():
    assert calc_tax(450000) == 45000
    assert calc_tax(92600) == 9260
    assert calc_tax(562500) == 56250


def test_calc_billing_sums_fee_transport_other_tax():
    assert calc_billing(fee=300000, transport=50000, other=0, tax=30000) == 380000


def test_fiscal_year_apr_to_mar():
    assert fiscal_year_of(date(2026, 4, 1)) == 2026
    assert fiscal_year_of(date(2026, 12, 31)) == 2026
    assert fiscal_year_of(date(2027, 1, 31)) == 2026
    assert fiscal_year_of(date(2027, 3, 31)) == 2026
    assert fiscal_year_of(date(2027, 4, 1)) == 2027


def test_month_end_and_revenue_month():
    assert month_end(date(2026, 4, 8)) == date(2026, 4, 30)
    assert month_end(date(2027, 2, 5)) == date(2027, 2, 28)
    assert revenue_month_of(date(2026, 6, 19)) == date(2026, 6, 30)
