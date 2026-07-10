from datetime import date
from typing import Optional, Literal
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
    payment_status: Literal[
        "uninvoiced", "invoiced", "scheduled", "partial", "paid", "overdue"
    ] = "uninvoiced"
    paid_on: Optional[date] = None
    support_staff: Optional[str] = None
    note: Optional[str] = None
    # --- 拡張: 案件管理 ---
    project_name: Optional[str] = None
    training_theme: Optional[str] = None
    direct_cost: Optional[int] = None
    allocated_fixed_cost: int = 0
    expected_sales_amount: int = 0
    confidence_rank: Optional[Literal["A", "B", "C"]] = None
    project_status: str = "受注"
    customer_type: Optional[Literal["新規", "既存", "リピート"]] = None
    lost_reason: Optional[str] = None
    invoice_date: Optional[date] = None
    invoice_amount: Optional[int] = None
    paid_amount: int = 0


class PayIn(SQLModel):
    paid_on: Optional[date] = None  # 未指定なら当日


class ConfidenceRateIn(SQLModel):
    rate: float = 0.0


class MonthlyFixedCostIn(SQLModel):
    fixed_cost_amount: int = 0
    memo: Optional[str] = None


class SalesActivityIn(SQLModel):
    inquiries: int = 0
    first_meetings: int = 0
    memo: Optional[str] = None


class RecurringSkipIn(SQLModel):
    ym: str                       # 今年の対象月 "YYYY-MM"
    client: str                   # 企業名
    reason: Optional[str] = None  # 見送り理由（任意）


class SettingIn(SQLModel):
    monthly_fixed_cost: Optional[int] = None
    opening_balance: Optional[int] = None


class MasterIn(SQLModel):
    name: str
    active: bool = True
    agency: Optional[str] = None   # 企業マスタのみ使用（既定代理店）
    address: Optional[str] = None  # 企業マスタのみ使用（本社所在地）
    url: Optional[str] = None      # 企業マスタのみ使用（公式サイトURL）


class PaymentItemIn(SQLModel):
    name: str


class PaymentItemUpdate(SQLModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class ScheduleCellIn(SQLModel):
    item_id: int
    ym: str
    amount: int = 0


class SchedulePutIn(SQLModel):
    cells: list[ScheduleCellIn] = []
