from datetime import datetime
from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.models import Setting
from app.schemas import SettingIn

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/{fiscal_year}")
def get_settings(fiscal_year: int, session: Session = Depends(get_session)):
    row = session.get(Setting, fiscal_year)
    if row is None:
        return Setting(fiscal_year=fiscal_year, monthly_fixed_cost=0)
    return row


@router.put("/{fiscal_year}")
def put_settings(fiscal_year: int, data: SettingIn, session: Session = Depends(get_session)):
    row = session.get(Setting, fiscal_year)
    if row is None:
        row = Setting(fiscal_year=fiscal_year, monthly_fixed_cost=data.monthly_fixed_cost)
    else:
        row.monthly_fixed_cost = data.monthly_fixed_cost
        row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
