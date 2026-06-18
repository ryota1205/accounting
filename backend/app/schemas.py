from datetime import date
from typing import Optional
from sqlmodel import SQLModel


class DealIn(SQLModel):
    held_on: date
    client: str
    revenue_month: Optional[date] = None  # 未指定なら held_on の月末
    agency: Optional[str] = None
    training_name: Optional[str] = None
    instructor: Optional[str] = None
    fee: int = 0
    transport: int = 0
    other: int = 0
    tax: Optional[int] = None      # 未指定なら fee*10%
    billing: Optional[int] = None  # 未指定なら fee+transport+other+tax
    instructor_fee: int = 0
    payment_due: Optional[date] = None
    payment_status: str = "unpaid"
    paid_on: Optional[date] = None
    support_staff: Optional[str] = None
    note: Optional[str] = None


class PayIn(SQLModel):
    paid_on: Optional[date] = None  # 未指定なら当日


class SettingIn(SQLModel):
    monthly_fixed_cost: int = 0


class MasterIn(SQLModel):
    name: str
    active: bool = True
