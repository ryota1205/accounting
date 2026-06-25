from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import PaymentItem
from app.schemas import PaymentItemIn, PaymentItemUpdate
from app.auth import require_admin

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
