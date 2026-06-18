from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.db import get_session
from app.models import Deal, Setting, MonthlyFixedCost, ConfidenceRate
from app import calc

router = APIRouter(prefix="/api/summary", tags=["summary"])

ORDER_STATUSES = {"受注", "実施済", "請求済", "入金済"}

MONTH_LABELS = ["4月", "5月", "6月", "7月", "8月", "9月",
                "10月", "11月", "12月", "1月", "2月", "3月"]


def _deals_in_fy(session: Session, fiscal_year: int):
    return session.exec(select(Deal).where(Deal.fiscal_year == fiscal_year)).all()


@router.get("/monthly")
def monthly(fiscal_year: int, session: Session = Depends(get_session)):
    cur = _deals_in_fy(session, fiscal_year)
    prev = _deals_in_fy(session, fiscal_year - 1)
    cur_buckets = calc.monthly_buckets(
        fiscal_year, [(d.revenue_month.year, d.revenue_month.month, d.billing) for d in cur]
    )
    has_prev = len(prev) > 0
    prev_buckets = calc.monthly_buckets(
        fiscal_year - 1, [(d.revenue_month.year, d.revenue_month.month, d.billing) for d in prev]
    )
    prev_series = prev_buckets if has_prev else [None] * 12
    return {
        "labels": MONTH_LABELS,
        "current": cur_buckets,
        "prev": prev_series,
        "total": sum(cur_buckets),
    }


@router.get("/annual")
def annual(fiscal_year: int, session: Session = Depends(get_session)):
    deals = _deals_in_fy(session, fiscal_year)
    clients = sorted({d.client for d in deals})
    rows = []
    month_totals = [0] * 12
    for c in clients:
        items = [(d.revenue_month.year, d.revenue_month.month, d.billing)
                 for d in deals if d.client == c]
        buckets = calc.monthly_buckets(fiscal_year, items)
        for i in range(12):
            month_totals[i] += buckets[i]
        rows.append({"client": c, "months": buckets, "total": sum(buckets)})
    return {
        "labels": MONTH_LABELS,
        "rows": rows,
        "month_totals": month_totals,
        "grand_total": sum(month_totals),
    }


@router.get("/by")
def by_dimension(
    dim: str = Query(..., pattern="^(instructor|agency|client)$"),
    frm: date = Query(..., alias="frm"),
    to: date = Query(...),
    session: Session = Depends(get_session),
):
    deals = session.exec(
        select(Deal).where(Deal.revenue_month >= frm, Deal.revenue_month <= to)
    ).all()
    totals: dict[str, dict] = {}
    for d in deals:
        key = getattr(d, dim) or "(未設定)"
        bucket = totals.setdefault(key, {"name": key, "amount": 0, "instructor_fee": 0})
        bucket["amount"] += d.billing
        bucket["instructor_fee"] += d.instructor_fee
    grand = sum(b["amount"] for b in totals.values())
    result = []
    for b in sorted(totals.values(), key=lambda x: x["amount"], reverse=True):
        b["share"] = (b["amount"] / grand) if grand else 0.0
        result.append(b)
    return result


def _net(d: Deal) -> int:
    return d.fee + d.transport + d.other


def _cost(d: Deal) -> int:
    """直接原価。未設定なら従来の講師料を用いる（既存BEPと後方互換）。"""
    return d.direct_cost if d.direct_cost is not None else d.instructor_fee


@router.get("/pl")
def profit_loss(fiscal_year: int, session: Session = Depends(get_session)):
    deals = _deals_in_fy(session, fiscal_year)
    setting = session.get(Setting, fiscal_year)
    monthly_fixed = setting.monthly_fixed_cost if setting else 0
    annual_fixed = monthly_fixed * 12

    net_sales = sum(_net(d) for d in deals)
    variable = sum(_cost(d) for d in deals)
    metrics = calc.pl_metrics(net_sales, variable, annual_fixed)

    monthly_net = calc.monthly_buckets(
        fiscal_year, [(d.revenue_month.year, d.revenue_month.month, _net(d)) for d in deals]
    )
    monthly_var = calc.monthly_buckets(
        fiscal_year, [(d.revenue_month.year, d.revenue_month.month, _cost(d)) for d in deals]
    )
    gross_margin_rate = [
        ((monthly_net[i] - monthly_var[i]) / monthly_net[i]) if monthly_net[i] else 0.0
        for i in range(12)
    ]

    cum_net, cum_total_cost = [], []
    run_net = run_cost = 0
    for i in range(12):
        run_net += monthly_net[i]
        run_cost += monthly_var[i] + monthly_fixed
        cum_net.append(run_net)
        cum_total_cost.append(run_cost)

    by_client: dict[str, int] = {}
    for d in deals:
        by_client[d.client] = by_client.get(d.client, 0) + _net(d)
    top_clients = [
        {"name": name, "amount": amount,
         "share": (amount / net_sales) if net_sales else 0.0}
        for name, amount in sorted(by_client.items(), key=lambda x: x[1], reverse=True)[:5]
    ]

    return {
        **metrics,
        "monthly_labels": MONTH_LABELS,
        "monthly_net": monthly_net,
        "monthly_variable": monthly_var,
        "gross_margin_rate": gross_margin_rate,
        "cum_net": cum_net,
        "cum_total_cost": cum_total_cost,
        "top_clients": top_clients,
    }


# ===== 月次サマリー =====
def _invoice_amount(d: Deal) -> int:
    return d.invoice_amount if d.invoice_amount is not None else d.billing


def _unpaid_amount(d: Deal) -> int:
    if d.payment_status == "paid":
        return 0
    return max(0, _invoice_amount(d) - (d.paid_amount or 0))


def _month_fixed_cost(session: Session, year: int, month: int) -> int:
    ym = f"{year:04d}-{month:02d}"
    row = session.get(MonthlyFixedCost, ym)
    if row is not None:
        return row.fixed_cost_amount
    s = session.get(Setting, calc.fiscal_year_of(date(year, month, 1)))
    return s.monthly_fixed_cost if s else 0


def _rates(session: Session) -> dict:
    rows = session.exec(select(ConfidenceRate)).all()
    if not rows:
        # 未投入なら初期値を投入（テスト/初回起動向け）
        for rank, rate in {"A": 0.8, "B": 0.5, "C": 0.2}.items():
            session.add(ConfidenceRate(rank=rank, rate=rate))
        session.commit()
        rows = session.exec(select(ConfidenceRate)).all()
    return {r.rank: r.rate for r in rows}


def _month_metrics(session: Session, year: int, month: int, rates: dict) -> dict:
    start = date(year, month, 1)
    end = calc.month_end(start)
    deals = session.exec(
        select(Deal).where(Deal.revenue_month >= start, Deal.revenue_month <= end)
    ).all()
    net = sum(_net(d) for d in deals)
    cost = sum(_cost(d) for d in deals)
    gross = net - cost
    gross_rate = (gross / net) if net else 0.0
    fixed = _month_fixed_cost(session, year, month)
    cm_ratio = (gross / net) if net else 0.0
    bep = round(fixed / cm_ratio) if cm_ratio > 0 else 0
    order_count = sum(1 for d in deals if d.project_status in ORDER_STATUSES)
    expected = sum(d.expected_sales_amount for d in deals)
    weighted = sum(
        round(d.expected_sales_amount * rates.get(d.confidence_rank, 0.0))
        for d in deals if d.confidence_rank
    )
    return {
        "sales": net,
        "gross_profit": gross,
        "gross_rate": gross_rate,
        "fixed_cost": fixed,
        "bep": bep,
        "bep_diff": net - bep,
        "invoice_total": sum(_invoice_amount(d) for d in deals),
        "unpaid_total": sum(_unpaid_amount(d) for d in deals),
        "order_count": order_count,
        "avg_price": round(net / order_count) if order_count else 0,
        "expected_sales": expected,
        "weighted_forecast": weighted,
        "deal_count": len(deals),
    }


@router.get("/month")
def month_summary(ym: str, session: Session = Depends(get_session)):
    """ym = 'YYYY-MM'。当月・前月・前年同月の指標を返す。"""
    try:
        year, month = int(ym[:4]), int(ym[5:7])
    except (ValueError, IndexError):
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="ym は YYYY-MM 形式で指定してください")
    rates = _rates(session)
    pm_year, pm_month = (year, month - 1) if month > 1 else (year - 1, 12)
    cur = _month_metrics(session, year, month, rates)
    prev_month = _month_metrics(session, pm_year, pm_month, rates)
    prev_year = _month_metrics(session, year - 1, month, rates)
    return {
        "ym": f"{year:04d}-{month:02d}",
        "current": cur,
        "prev_month": prev_month,
        "prev_month_has_data": prev_month["deal_count"] > 0,
        "prev_year": prev_year,
        "prev_year_has_data": prev_year["deal_count"] > 0,
    }
