from typing import Optional
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.models import Deal
from app.auth import get_current_user

router = APIRouter(prefix="/api/payments", tags=["payments"],
                   dependencies=[Depends(get_current_user)])


@router.get("")
def list_payments(
    session: Session = Depends(get_session),
    status: Optional[str] = None,
    fiscal_year: Optional[int] = None,
):
    stmt = select(Deal)
    if status:
        stmt = stmt.where(Deal.payment_status == status)
    if fiscal_year is not None:
        stmt = stmt.where(Deal.fiscal_year == fiscal_year)
    return session.exec(stmt.order_by(Deal.payment_due)).all()
