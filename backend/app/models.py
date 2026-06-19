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
    # 入金ステータス: uninvoiced(未請求)/invoiced(請求済)/scheduled(入金予定)/
    #                 partial(一部入金)/paid(入金済)/overdue(遅延)
    payment_status: str = Field(default="uninvoiced")
    paid_on: Optional[date] = None
    support_staff: Optional[str] = None
    note: Optional[str] = None
    # --- 拡張: 案件管理（すべて任意・自動マイグレーション） ---
    project_name: Optional[str] = None          # 案件名
    training_theme: Optional[str] = None        # 研修テーマ
    direct_cost: Optional[int] = None           # 直接原価（未設定時は instructor_fee を使用）
    allocated_fixed_cost: int = 0               # 固定費配賦額（任意）
    expected_sales_amount: int = 0              # 見込み売上
    confidence_rank: Optional[str] = None       # 受注確度 A/B/C
    project_status: str = Field(default="受注")  # 案件ステータス（8区分）
    customer_type: Optional[str] = None         # 新規/既存/リピート
    lost_reason: Optional[str] = None           # 失注理由
    invoice_date: Optional[date] = None         # 請求日
    invoice_amount: Optional[int] = None        # 請求金額（未設定時は billing を使用）
    paid_amount: int = 0                        # 入金済金額（一部入金対応）
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class User(SQLModel, table=True):
    """ログインユーザー。2ロール（admin=全権 / staff=入力担当）。"""
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)   # ログインID
    name: str                                        # 表示名
    password_hash: str
    salt: str
    role: str = Field(default="staff")               # "admin" | "staff"
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


class ConfidenceRate(SQLModel, table=True):
    """受注確度の掛け率（編集可）。A=0.8 / B=0.5 / C=0.2 を初期値とする。"""
    rank: str = Field(primary_key=True)   # "A" | "B" | "C"
    rate: float = 0.0
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class MonthlyFixedCost(SQLModel, table=True):
    """月次の固定費（未設定の月は年度設定の月額をフォールバック）。"""
    month: str = Field(primary_key=True)   # "YYYY-MM"
    fixed_cost_amount: int = 0
    memo: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SalesActivity(SQLModel, table=True):
    """営業活動の月次手入力（案件にならない問い合わせ・初回相談を補う）。"""
    month: str = Field(primary_key=True)   # "YYYY-MM"
    inquiries: int = 0          # 問い合わせ数（手入力）
    first_meetings: int = 0     # 初回相談数（手入力）
    memo: Optional[str] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)
