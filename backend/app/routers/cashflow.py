from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import PaymentItem, PaymentSchedule, Setting
from app.schemas import PaymentItemIn, PaymentItemUpdate, SchedulePutIn
from app.auth import require_admin
from app import calc
from app.routers.summary import (
    _deals_in_fy, _month_fixed_cost, _cost, MONTH_LABELS,
)

router = APIRouter(prefix="/api/cashflow", tags=["cashflow"],
                   dependencies=[Depends(require_admin)])


@router.get("/items")
def list_items(session: Session = Depends(get_session)):
    rows = session.exec(
        select(PaymentItem).where(PaymentItem.active == True)  # noqa: E712
    ).all()
    return sorted(rows, key=lambda r: (r.sort_order, r.id or 0))


@router.post("/items")
def create_item(data: PaymentItemIn, session: Session = Depends(get_session)):
    existing = session.exec(
        select(PaymentItem).where(PaymentItem.active == True)  # noqa: E712
    ).all()
    next_order = (max((r.sort_order for r in existing), default=-1) + 1) if existing else 0
    row = PaymentItem(name=data.name, sort_order=next_order)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/items/{item_id}")
def update_item(item_id: int, data: PaymentItemUpdate, session: Session = Depends(get_session)):
    row = session.get(PaymentItem, item_id)
    if row is None or not row.active:
        raise HTTPException(status_code=404, detail="項目が見つかりません")
    if data.name is not None:
        row.name = data.name
    if data.sort_order is not None:
        row.sort_order = data.sort_order
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/items/{item_id}")
def delete_item(item_id: int, session: Session = Depends(get_session)):
    row = session.get(PaymentItem, item_id)
    if row is not None:
        row.active = False           # 論理削除（過去の金額は残す）
        session.add(row)
        session.commit()
    return {"id": item_id}


def _fy_yms(fiscal_year: int) -> list[str]:
    """年度(4月→翌3月)の "YYYY-MM" を12個返す。"""
    return [f"{y:04d}-{m:02d}" for y, m in calc.fiscal_months(fiscal_year)]


@router.get("/schedule")
def get_schedule(fiscal_year: int, session: Session = Depends(get_session)):
    yms = set(_fy_yms(fiscal_year))
    rows = session.exec(select(PaymentSchedule)).all()
    amounts: dict[str, dict[str, int]] = {}
    for r in rows:
        if r.ym in yms and r.amount:
            amounts.setdefault(str(r.item_id), {})[r.ym] = r.amount
    return {"fiscal_year": fiscal_year, "amounts": amounts}


@router.put("/schedule")
def put_schedule(fiscal_year: int, data: SchedulePutIn, session: Session = Depends(get_session)):
    for cell in data.cells:
        row = session.get(PaymentSchedule, (cell.item_id, cell.ym))
        if row is None:
            row = PaymentSchedule(item_id=cell.item_id, ym=cell.ym, amount=cell.amount)
        else:
            row.amount = cell.amount
            row.updated_at = datetime.utcnow()
        session.add(row)
    session.commit()
    return {"saved": len(data.cells)}


@router.get("")
def cashflow(fiscal_year: int, basis: str = "billing",
             session: Session = Depends(get_session)):
    if basis not in ("billing", "paid"):
        raise HTTPException(status_code=422, detail="basis は billing か paid を指定してください")

    deals = _deals_in_fy(session, fiscal_year)

    # 入金（プラス側）
    if basis == "paid":
        paid_items, undated = [], 0
        for d in deals:
            if d.payment_status == "paid":
                if d.paid_on is not None:
                    paid_items.append((d.paid_on.year, d.paid_on.month, d.paid_amount or 0))
                else:
                    undated += d.paid_amount or 0
        inflow = calc.monthly_buckets(fiscal_year, paid_items)
        undated_inflow = undated
    else:
        inflow = calc.monthly_buckets(
            fiscal_year, [(d.revenue_month.year, d.revenue_month.month, d.billing) for d in deals]
        )
        undated_inflow = 0

    # 原価（売上月）
    cost = calc.monthly_buckets(
        fiscal_year, [(d.revenue_month.year, d.revenue_month.month, _cost(d)) for d in deals]
    )

    # 固定費（月次フォールバック）と 大型支払い（PaymentSchedule）
    fixed_cost, big_payment = [], []
    sched_rows = session.exec(select(PaymentSchedule)).all()
    by_ym: dict[str, int] = {}
    for r in sched_rows:
        by_ym[r.ym] = by_ym.get(r.ym, 0) + r.amount
    for (y, m) in calc.fiscal_months(fiscal_year):
        fixed_cost.append(_month_fixed_cost(session, y, m))
        big_payment.append(by_ym.get(f"{y:04d}-{m:02d}", 0))

    net = [inflow[i] - (big_payment[i] + fixed_cost[i] + cost[i]) for i in range(12)]

    setting = session.get(Setting, fiscal_year)
    opening = setting.opening_balance if setting else 0
    balance = calc.running_total(net, start=opening)

    return {
        "labels": MONTH_LABELS,
        "basis": basis,
        "opening_balance": opening,
        "inflow": inflow,
        "cost": cost,
        "fixed_cost": fixed_cost,
        "big_payment": big_payment,
        "net": net,
        "balance": balance,
        "undated_inflow": undated_inflow,
        "grand_inflow": sum(inflow),
        "grand_outflow": sum(big_payment) + sum(fixed_cost) + sum(cost),
        "ending_balance": balance[-1] if balance else opening,
    }
