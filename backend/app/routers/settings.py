from datetime import datetime
from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app.models import Setting, MonthlyFixedCost
from app.schemas import SettingIn, MonthlyFixedCostIn
from app.auth import require_admin

router = APIRouter(prefix="/api/settings", tags=["settings"],
                   dependencies=[Depends(require_admin)])


@router.get("/monthly-fixed-cost/{ym}")
def get_monthly_fixed(ym: str, session: Session = Depends(get_session)):
    row = session.get(MonthlyFixedCost, ym)
    if row is None:
        return MonthlyFixedCost(month=ym, fixed_cost_amount=0, memo=None)
    return row


@router.put("/monthly-fixed-cost/{ym}")
def put_monthly_fixed(ym: str, data: MonthlyFixedCostIn, session: Session = Depends(get_session)):
    row = session.get(MonthlyFixedCost, ym)
    if row is None:
        row = MonthlyFixedCost(month=ym, fixed_cost_amount=data.fixed_cost_amount, memo=data.memo)
    else:
        row.fixed_cost_amount = data.fixed_cost_amount
        row.memo = data.memo
        row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


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
        row = Setting(fiscal_year=fiscal_year)
    if data.monthly_fixed_cost is not None:
        row.monthly_fixed_cost = data.monthly_fixed_cost
    if data.opening_balance is not None:
        row.opening_balance = data.opening_balance
    if data.labor_share is not None:
        row.labor_share = data.labor_share
    if data.headcount is not None:
        row.headcount = data.headcount
    if data.bonus_months is not None:
        row.bonus_months = data.bonus_months
    if data.exec_comp_annual is not None:
        row.exec_comp_annual = data.exec_comp_annual
    if data.benchmarks_json is not None:
        row.benchmarks_json = data.benchmarks_json
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
