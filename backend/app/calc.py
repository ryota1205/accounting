import calendar
from datetime import date
from typing import Iterable, Tuple

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


def fiscal_months(fiscal_year: int) -> list[Tuple[int, int]]:
    """年度の (年, 月) を4月→翌3月の順で12個返す。"""
    result = []
    for m in range(4, 13):
        result.append((fiscal_year, m))
    for m in range(1, 4):
        result.append((fiscal_year + 1, m))
    return result


def monthly_buckets(fiscal_year: int, items: Iterable[Tuple[int, int, int]]) -> list[int]:
    """(年, 月, 金額) の明細を、年度の12スロット(4月→翌3月)に合計する。"""
    index = {ym: i for i, ym in enumerate(fiscal_months(fiscal_year))}
    buckets = [0] * 12
    for year, month, amount in items:
        i = index.get((year, month))
        if i is not None:
            buckets[i] += amount
    return buckets


def pl_metrics(net_sales: int, variable: int, annual_fixed: int) -> dict:
    """損益分岐点まわりの指標を計算する。"""
    contribution_margin = net_sales - variable
    cm_ratio = (contribution_margin / net_sales) if net_sales else 0.0
    bep = round(annual_fixed / cm_ratio) if cm_ratio > 0 else 0
    operating_profit = net_sales - variable - annual_fixed
    safety_margin_ratio = ((net_sales - bep) / net_sales) if net_sales else 0.0
    bep_achievement = (net_sales / bep) if bep else 0.0
    return {
        "net_sales": net_sales,
        "variable": variable,
        "annual_fixed": annual_fixed,
        "contribution_margin": contribution_margin,
        "cm_ratio": cm_ratio,
        "bep": bep,
        "operating_profit": operating_profit,
        "safety_margin_ratio": safety_margin_ratio,
        "bep_achievement": bep_achievement,
    }


def running_total(values: Iterable[int], start: int = 0) -> list[int]:
    """各時点までの累計を、start を起点に返す。資金残高の推移に使う。"""
    result = []
    acc = start
    for v in values:
        acc += v
        result.append(acc)
    return result
