import calendar
from datetime import date

TAX_RATE_PERCENT = 10


def calc_tax(fee: int) -> int:
    """消費税 = 研修費用 × 10%（円未満切り捨て）。"""
    return fee * TAX_RATE_PERCENT // 100


def calc_billing(fee: int, transport: int, other: int, tax: int) -> int:
    """請求額 = 研修費用 + 交通費 + その他 + 消費税。"""
    return fee + transport + other + tax


def fiscal_year_of(d: date) -> int:
    """年度(4月〜翌3月)。1〜3月は前年の年度。"""
    return d.year if d.month >= 4 else d.year - 1


def month_end(d: date) -> date:
    last = calendar.monthrange(d.year, d.month)[1]
    return date(d.year, d.month, last)


def revenue_month_of(held_on: date) -> date:
    """売上月 = 実施日の属する月の月末日。"""
    return month_end(held_on)
