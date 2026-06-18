from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.db import get_session
from app.models import Deal
from app.schemas import DealIn
from app.service import build_deal, register_masters

router = APIRouter(prefix="/api/deals", tags=["deals"])


def _validate(data: DealIn) -> None:
    if not data.client or not data.client.strip():
        raise HTTPException(status_code=422, detail="企業名(client)は必須です")
    for field in ("fee", "transport", "other", "instructor_fee"):
        if getattr(data, field) < 0:
            raise HTTPException(status_code=422, detail=f"{field}は0以上で入力してください")


@router.get("")
def list_deals(
    session: Session = Depends(get_session),
    fiscal_year: Optional[int] = None,
    month: Optional[int] = None,
    client: Optional[str] = None,
    instructor: Optional[str] = None,
    agency: Optional[str] = None,
    payment_status: Optional[str] = None,
    q: Optional[str] = None,
):
    stmt = select(Deal)
    if fiscal_year is not None:
        stmt = stmt.where(Deal.fiscal_year == fiscal_year)
    if client:
        stmt = stmt.where(Deal.client == client)
    if instructor:
        stmt = stmt.where(Deal.instructor == instructor)
    if agency:
        stmt = stmt.where(Deal.agency == agency)
    if payment_status:
        stmt = stmt.where(Deal.payment_status == payment_status)
    rows = session.exec(stmt.order_by(Deal.revenue_month, Deal.held_on)).all()
    if month is not None:
        rows = [d for d in rows if d.revenue_month.month == month]
    if q:
        ql = q.lower()
        rows = [d for d in rows if ql in (d.client or "").lower()
                or ql in (d.training_name or "").lower()
                or ql in (d.instructor or "").lower()]
    return rows


@router.post("", status_code=201)
def create_deal(data: DealIn, session: Session = Depends(get_session)):
    _validate(data)
    deal = build_deal(data)
    session.add(deal)
    register_masters(session, client=data.client, instructor=data.instructor, agency=data.agency)
    session.commit()
    session.refresh(deal)
    return deal


@router.get("/{deal_id}")
def get_deal(deal_id: int, session: Session = Depends(get_session)):
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    return deal


@router.put("/{deal_id}")
def update_deal(deal_id: int, data: DealIn, session: Session = Depends(get_session)):
    _validate(data)
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    build_deal(data, deal)
    register_masters(session, client=data.client, instructor=data.instructor, agency=data.agency)
    session.add(deal)
    session.commit()
    session.refresh(deal)
    return deal


@router.delete("/{deal_id}", status_code=204)
def delete_deal(deal_id: int, session: Session = Depends(get_session)):
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    session.delete(deal)
    session.commit()
    return Response(status_code=204)
