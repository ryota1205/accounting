from datetime import date
from typing import Optional
from sqlmodel import Session, select

from app import calc
from app.models import Deal, Client, Instructor, Agency
from app.schemas import DealIn


def build_deal(data: DealIn, deal: Optional[Deal] = None) -> Deal:
    """DealIn から税・請求額・売上月・年度を補完して Deal を組み立てる。
    deal を渡すと既存インスタンスを更新（編集用）。"""
    revenue_month = data.revenue_month or calc.revenue_month_of(data.held_on)
    tax = data.tax if data.tax is not None else calc.calc_tax(data.fee)
    billing = data.billing if data.billing is not None else calc.calc_billing(
        data.fee, data.transport, data.other, tax
    )
    fiscal_year = calc.fiscal_year_of(revenue_month)

    values = dict(
        fiscal_year=fiscal_year,
        revenue_month=revenue_month,
        held_on=data.held_on,
        agency=data.agency,
        client=data.client,
        training_name=data.training_name,
        instructor=data.instructor,
        fee=data.fee,
        transport=data.transport,
        other=data.other,
        tax=tax,
        billing=billing,
        instructor_fee=data.instructor_fee,
        payment_due=data.payment_due,
        payment_status=data.payment_status,
        paid_on=data.paid_on,
        support_staff=data.support_staff,
        note=data.note,
    )
    if deal is None:
        return Deal(**values)
    for k, v in values.items():
        setattr(deal, k, v)
    return deal


def _ensure(session: Session, model, name: Optional[str]) -> None:
    if not name:
        return
    name = name.strip()
    if not name:
        return
    exists = session.exec(select(model).where(model.name == name)).first()
    if exists is None:
        session.add(model(name=name))


def register_masters(session: Session, client: Optional[str] = None,
                     instructor: Optional[str] = None,
                     agency: Optional[str] = None) -> None:
    _ensure(session, Client, client)
    _ensure(session, Instructor, instructor)
    _ensure(session, Agency, agency)
