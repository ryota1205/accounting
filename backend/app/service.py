from datetime import date, datetime
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
        updated_at=datetime.utcnow(),
        support_staff=data.support_staff,
        note=data.note,
        project_name=data.project_name,
        training_theme=data.training_theme,
        direct_cost=data.direct_cost,
        allocated_fixed_cost=data.allocated_fixed_cost,
        expected_sales_amount=data.expected_sales_amount,
        confidence_rank=data.confidence_rank,
        project_status=data.project_status,
        customer_type=data.customer_type,
        lost_reason=data.lost_reason,
        invoice_date=data.invoice_date,
        invoice_amount=data.invoice_amount,
        paid_amount=data.paid_amount,
    )
    if deal is None:
        return Deal(**values)
    for k, v in values.items():
        setattr(deal, k, v)
    return deal


def _theme_key(theme: Optional[str], name: Optional[str]) -> str:
    """研修テーマの突合キー。テーマ未設定なら研修名で代用（一覧表示と同じ優先順）。"""
    return (theme or name or "").strip()


def resolve_customer_type(
    session: Session, *, client: str, training_theme: Optional[str],
    training_name: Optional[str], held_on, self_id: Optional[int] = None,
) -> str:
    """企業×研修テーマで新規/既存/リピートを自動判定。
    - 新規: その企業名での過去案件がない
    - リピート: 同じ研修テーマの過去案件がある
    - 既存: 企業の過去案件はあるが、その研修テーマは初めて
    「過去」は held_on（同日は id）が手前の案件のみを対象とする。"""
    cur_theme = _theme_key(training_theme, training_name)
    others = session.exec(select(Deal).where(Deal.client == client)).all()
    priors = []
    for o in others:
        if self_id is not None and o.id == self_id:
            continue
        is_prior = o.held_on < held_on or (
            o.held_on == held_on and (self_id is None or (o.id is not None and o.id < self_id))
        )
        if is_prior:
            priors.append(o)
    if not priors:
        return "新規"
    if cur_theme and any(_theme_key(o.training_theme, o.training_name) == cur_theme for o in priors):
        return "リピート"
    return "既存"


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
