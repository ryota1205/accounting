from datetime import datetime
from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.models import SalesActivity
from app.schemas import SalesActivityIn
from app.auth import require_admin

router = APIRouter(prefix="/api/sales-activity", tags=["activity"],
                   dependencies=[Depends(require_admin)])


@router.get("/{ym}")
def get_activity(ym: str, session: Session = Depends(get_session)):
    row = session.get(SalesActivity, ym)
    if row is None:
        return SalesActivity(month=ym, inquiries=0, first_meetings=0, memo=None)
    return row


@router.put("/{ym}")
def put_activity(ym: str, data: SalesActivityIn, session: Session = Depends(get_session)):
    row = session.get(SalesActivity, ym)
    if row is None:
        row = SalesActivity(month=ym, inquiries=data.inquiries,
                            first_meetings=data.first_meetings, memo=data.memo)
    else:
        row.inquiries = data.inquiries
        row.first_meetings = data.first_meetings
        row.memo = data.memo
        row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
