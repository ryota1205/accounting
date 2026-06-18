from datetime import date, datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Deal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    fiscal_year: int = Field(index=True)
    revenue_month: date = Field(index=True)
    held_on: date
    agency: Optional[str] = None
    client: str = Field(index=True)
    training_name: Optional[str] = None
    instructor: Optional[str] = None
    fee: int = 0
    transport: int = 0
    other: int = 0
    tax: int = 0
    billing: int = 0
    instructor_fee: int = 0
    payment_due: Optional[date] = None
    payment_status: str = Field(default="unpaid")  # "unpaid" | "paid"
    paid_on: Optional[date] = None
    support_staff: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Client(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    agency: Optional[str] = None  # 既定の代理店（マスタで紐づけ）
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Instructor(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Agency(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Setting(SQLModel, table=True):
    fiscal_year: int = Field(primary_key=True)
    monthly_fixed_cost: int = 0
    updated_at: datetime = Field(default_factory=datetime.utcnow)
