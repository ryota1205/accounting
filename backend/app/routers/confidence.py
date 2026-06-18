from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import ConfidenceRate
from app.schemas import ConfidenceRateIn

router = APIRouter(prefix="/api/confidence-rates", tags=["confidence"])

DEFAULT_RATES = {"A": 0.8, "B": 0.5, "C": 0.2}


def _ensure_defaults(session: Session) -> None:
    for rank, rate in DEFAULT_RATES.items():
        if session.get(ConfidenceRate, rank) is None:
            session.add(ConfidenceRate(rank=rank, rate=rate))
    session.commit()


@router.get("")
def list_rates(session: Session = Depends(get_session)):
    _ensure_defaults(session)
    return session.exec(select(ConfidenceRate).order_by(ConfidenceRate.rank)).all()


@router.put("/{rank}")
def update_rate(rank: str, data: ConfidenceRateIn, session: Session = Depends(get_session)):
    if rank not in ("A", "B", "C"):
        raise HTTPException(status_code=404, detail="不明な確度ランクです")
    row = session.get(ConfidenceRate, rank)
    if row is None:
        row = ConfidenceRate(rank=rank, rate=data.rate)
    else:
        row.rate = data.rate
        row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
