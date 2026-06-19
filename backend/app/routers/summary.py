from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.db import get_session
from app.models import Deal, Setting, MonthlyFixedCost, ConfidenceRate, SalesActivity
from app import calc
from app.auth import require_admin

router = APIRouter(prefix="/api/summary", tags=["summary"],
                   dependencies=[Depends(require_admin)])

ORDER_STATUSES = {"受注", "実施済", "請求済", "入金済"}
PROPOSAL_STATUSES = ORDER_STATUSES | {"提案中", "失注"}

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


def _group_metrics(deals, key_fn) -> list[dict]:
    agg: dict[str, dict] = {}
    for d in deals:
        key = key_fn(d) or "(未設定)"
        b = agg.setdefault(key, {"name": key, "sales": 0, "gross": 0, "count": 0})
        b["sales"] += _net(d)
        b["gross"] += _net(d) - _cost(d)
        b["count"] += 1
    rows = []
    for b in sorted(agg.values(), key=lambda x: x["sales"], reverse=True):
        b["gross_rate"] = (b["gross"] / b["sales"]) if b["sales"] else 0.0
        rows.append(b)
    return rows


@router.get("/analysis")
def analysis(fiscal_year: int, session: Session = Depends(get_session)):
    deals = _deals_in_fy(session, fiscal_year)
    prev = _deals_in_fy(session, fiscal_year - 1)

    by_client = _group_metrics(deals, lambda d: d.client)
    by_theme = _group_metrics(deals, lambda d: d.training_theme or d.training_name)

    # 新規/既存/リピート別
    total_sales = sum(_net(d) for d in deals)
    ctype: dict[str, int] = {}
    for d in deals:
        ctype[d.customer_type or "(未設定)"] = ctype.get(d.customer_type or "(未設定)", 0) + _net(d)
    by_customer_type = [
        {"type": t, "sales": s, "share": (s / total_sales) if total_sales else 0.0}
        for t, s in sorted(ctype.items(), key=lambda x: x[1], reverse=True)
    ]

    # 上位顧客依存度
    client_sales = sorted((r["sales"] for r in by_client), reverse=True)

    def topn(n: int) -> float:
        return (sum(client_sales[:n]) / total_sales) if total_sales else 0.0
    dependency = {"top1": topn(1), "top3": topn(3), "top5": topn(5), "total": total_sales}

    # 前年同月比較（売上=税抜・粗利・受注件数）
    def buckets(ds, fy, amount_fn):
        return calc.monthly_buckets(fy, [(d.revenue_month.year, d.revenue_month.month, amount_fn(d)) for d in ds])
    is_order = lambda d: 1 if d.project_status in ORDER_STATUSES else 0
    yoy = {
        "labels": MONTH_LABELS,
        "sales_cur": buckets(deals, fiscal_year, _net),
        "sales_prev": buckets(prev, fiscal_year - 1, _net),
        "gross_cur": buckets(deals, fiscal_year, lambda d: _net(d) - _cost(d)),
        "gross_prev": buckets(prev, fiscal_year - 1, lambda d: _net(d) - _cost(d)),
        "orders_cur": buckets(deals, fiscal_year, is_order),
        "orders_prev": buckets(prev, fiscal_year - 1, is_order),
        "prev_has_data": len(prev) > 0,
    }
    yoy["total_sales_cur"] = sum(yoy["sales_cur"])
    yoy["total_sales_prev"] = sum(yoy["sales_prev"])
    yoy["total_gross_cur"] = sum(yoy["gross_cur"])
    yoy["total_gross_prev"] = sum(yoy["gross_prev"])
    yoy["total_orders_cur"] = sum(yoy["orders_cur"])
    yoy["total_orders_prev"] = sum(yoy["orders_prev"])

    return {
        "by_client": by_client,
        "by_theme": by_theme,
        "by_customer_type": by_customer_type,
        "dependency": dependency,
        "yoy": yoy,
    }


def _funnel_metrics(session: Session, year: int, month: int) -> dict:
    start = date(year, month, 1)
    end = calc.month_end(start)
    deals = session.exec(
        select(Deal).where(Deal.revenue_month >= start, Deal.revenue_month <= end)
    ).all()
    auto_inq = sum(1 for d in deals if d.project_status == "問い合わせ")
    auto_first = sum(1 for d in deals if d.project_status == "初回相談")
    proposals = sum(1 for d in deals if d.project_status in PROPOSAL_STATUSES)
    orders = sum(1 for d in deals if d.project_status in ORDER_STATUSES)
    lost = sum(1 for d in deals if d.project_status == "失注")
    act = session.get(SalesActivity, f"{year:04d}-{month:02d}")
    inquiries = (act.inquiries if act else 0) + auto_inq
    first_meetings = (act.first_meetings if act else 0) + auto_first
    lost_reasons: dict[str, int] = {}
    for d in deals:
        if d.project_status == "失注":
            key = d.lost_reason or "(未設定)"
            lost_reasons[key] = lost_reasons.get(key, 0) + 1
    return {
        "inquiries": inquiries,
        "first_meetings": first_meetings,
        "proposals": proposals,
        "orders": orders,
        "lost": lost,
        "win_rate": (orders / proposals) if proposals else 0.0,
        "lost_reasons": [{"reason": k, "count": v}
                         for k, v in sorted(lost_reasons.items(), key=lambda x: x[1], reverse=True)],
        "total_deals": len(deals),
    }


@router.get("/sales")
def sales_funnel(ym: str, session: Session = Depends(get_session)):
    try:
        year, month = int(ym[:4]), int(ym[5:7])
    except (ValueError, IndexError):
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="ym は YYYY-MM 形式で指定してください")
    cur = _funnel_metrics(session, year, month)
    prev = _funnel_metrics(session, year - 1, month)
    return {
        "ym": f"{year:04d}-{month:02d}",
        "current": cur,
        "prev_year": prev,
        "prev_year_has_data": prev["total_deals"] > 0,
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
