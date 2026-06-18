# 研修売上管理システム バックエンド 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 研修案件を登録すると、消費税・請求額・売上月・年度を自動計算して保存し、月別/年間/軸別/損益分岐点(BEP)を集計し、既存Excelの取り込み・出力ができる FastAPI + SQLite の REST API を作る。

**Architecture:** FastAPI + SQLModel(SQLAlchemy + Pydantic) + SQLite。純粋関数の計算層(`calc.py`)を1か所に集約し、入力からDealを組み立てるサービス層(`service.py`)、機能ごとのルータ(`routers/`)に分ける。集計はSQL/Pythonで算出。全機能を pytest + FastAPI TestClient で検証する。

**Tech Stack:** Python 3.11+, FastAPI, SQLModel, uvicorn, openpyxl, pytest, httpx

設計書: `docs/superpowers/specs/2026-06-18-sales-management-design.md`

---

## ファイル構成

```
accounting/backend/
  requirements.txt
  README.md
  app/
    __init__.py
    db.py            # engine / get_session / init_db
    calc.py          # 純粋関数: 消費税・請求額・年度・売上月
    models.py        # SQLModel テーブル: Deal, Client, Instructor, Agency, Setting
    schemas.py       # 入出力スキーマ: DealIn, DealRead, PayIn, SettingIn ほか
    service.py       # DealIn→Deal 組み立て、マスタ自動登録
    main.py          # FastAPI app, CORS, ルータ登録, 起動時 init_db
    routers/
      __init__.py
      deals.py       # 案件CRUD
      masters.py     # 企業/講師/代理店マスタ
      settings.py    # 年度設定(月額固定費)
      summary.py     # monthly / annual / by / pl
      payments.py    # 入金一覧・入金済み化
      io_excel.py    # Excel取り込み・出力
  tests/
    __init__.py
    conftest.py
    test_calc.py
    test_deals.py
    test_masters.py
    test_settings.py
    test_summary.py
    test_payments.py
    test_io_excel.py
```

**売上の定義（重要・全タスク共通）**
- ダッシュボード/年間管理表/軸別集計の「売上」= **請求額 billing（税込）**（Excelの年間売上管理表と一致）。
- 損益・BEP の「売上」= **税抜 net = fee + transport + other**。
- 粗利 = net − instructor_fee、粗利率 = 粗利 ÷ net。

---

## Task 1: バックエンド雛形（依存・DB・アプリ起動）

**Files:**
- Create: `accounting/backend/requirements.txt`
- Create: `accounting/backend/app/__init__.py`
- Create: `accounting/backend/app/db.py`
- Create: `accounting/backend/app/main.py`
- Create: `accounting/backend/tests/__init__.py`

- [ ] **Step 1: requirements.txt を作成**

`accounting/backend/requirements.txt`:
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlmodel==0.0.22
openpyxl==3.1.5
pytest==8.3.3
httpx==0.27.2
```

- [ ] **Step 2: 仮想環境と依存インストール**

Run (PowerShell, `accounting/backend` で):
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```
Expected: 正常にインストール完了（エラーなし）。

- [ ] **Step 3: `app/__init__.py` と `tests/__init__.py` を空ファイルで作成**

両ファイルとも内容は空（パッケージ化のため）。

- [ ] **Step 4: `app/db.py` を作成**

```python
import os
from sqlmodel import SQLModel, Session, create_engine

DATABASE_URL = os.getenv("ACCOUNTING_DB", "sqlite:///./accounting.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db() -> None:
    # models をインポートしてメタデータへ登録してから作成する
    from app import models  # noqa: F401
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
```

- [ ] **Step 5: `app/main.py` を作成（この時点では models 未作成なので最小構成）**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="研修売上管理API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 6: 起動確認**

Run:
```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```
Expected: 起動後 `http://localhost:8000/api/health` が `{"status":"ok"}` を返す。確認したら Ctrl+C。

- [ ] **Step 7: コミット**

```bash
git add accounting/backend
git commit -m "feat(backend): プロジェクト雛形(FastAPI/DB/health)"
```

---

## Task 2: 計算層 calc.py（TDD）

**Files:**
- Create: `accounting/backend/app/calc.py`
- Test: `accounting/backend/tests/test_calc.py`

- [ ] **Step 1: 失敗するテストを書く**

`accounting/backend/tests/test_calc.py`:
```python
from datetime import date
from app.calc import calc_tax, calc_billing, fiscal_year_of, month_end, revenue_month_of


def test_calc_tax_is_10_percent_of_fee():
    assert calc_tax(450000) == 45000
    assert calc_tax(92600) == 9260
    assert calc_tax(562500) == 56250


def test_calc_billing_sums_fee_transport_other_tax():
    # 研修費用30万+交通費5万+その他0+消費税3万 = 38万
    assert calc_billing(fee=300000, transport=50000, other=0, tax=30000) == 380000


def test_fiscal_year_apr_to_mar():
    assert fiscal_year_of(date(2026, 4, 1)) == 2026
    assert fiscal_year_of(date(2026, 12, 31)) == 2026
    assert fiscal_year_of(date(2027, 1, 31)) == 2026
    assert fiscal_year_of(date(2027, 3, 31)) == 2026
    assert fiscal_year_of(date(2027, 4, 1)) == 2027


def test_month_end_and_revenue_month():
    assert month_end(date(2026, 4, 8)) == date(2026, 4, 30)
    assert month_end(date(2027, 2, 5)) == date(2027, 2, 28)
    assert revenue_month_of(date(2026, 6, 19)) == date(2026, 6, 30)
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_calc.py -v`
Expected: FAIL（`ModuleNotFoundError: app.calc`）

- [ ] **Step 3: `app/calc.py` を実装**

```python
import calendar
from datetime import date

TAX_RATE_PERCENT = 10


def calc_tax(fee: int) -> int:
    """消費税 = 研修費用 × 10%（円未満切り捨て）。"""
    return fee * TAX_RATE_PERCENT // 100


def calc_billing(fee: int, transport: int, other: int, tax: int) -> int:
    """請求額 = 研修費用 + 交通費 + その他 + 消費税。"""
    return fee + transport + other + tax


def fiscal_year_of(d: date) -> int:
    """年度(4月〜翌3月)。1〜3月は前年の年度。"""
    return d.year if d.month >= 4 else d.year - 1


def month_end(d: date) -> date:
    last = calendar.monthrange(d.year, d.month)[1]
    return date(d.year, d.month, last)


def revenue_month_of(held_on: date) -> date:
    """売上月 = 実施日の属する月の月末日。"""
    return month_end(held_on)
```

- [ ] **Step 4: テスト実行して成功を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_calc.py -v`
Expected: PASS（4件）

- [ ] **Step 5: コミット**

```bash
git add accounting/backend/app/calc.py accounting/backend/tests/test_calc.py
git commit -m "feat(backend): 計算層(消費税/請求額/年度/売上月)"
```

---

## Task 3: モデルとスキーマ

**Files:**
- Create: `accounting/backend/app/models.py`
- Create: `accounting/backend/app/schemas.py`

- [ ] **Step 1: `app/models.py` を作成**

```python
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
```

- [ ] **Step 2: `app/schemas.py` を作成**

```python
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
```

- [ ] **Step 3: `app/main.py` の起動時に init_db を呼ぶよう更新**

`app/main.py` の `app = FastAPI(...)` 定義の直後に追記:
```python
from app.db import init_db


@app.on_event("startup")
def on_startup():
    init_db()
```

- [ ] **Step 4: import が壊れていないか確認**

Run: `.\.venv\Scripts\python.exe -c "import app.main; print('ok')"`
Expected: `ok`

- [ ] **Step 5: コミット**

```bash
git add accounting/backend/app/models.py accounting/backend/app/schemas.py accounting/backend/app/main.py
git commit -m "feat(backend): モデルとスキーマ"
```

---

## Task 4: テスト基盤 conftest

**Files:**
- Create: `accounting/backend/tests/conftest.py`

- [ ] **Step 1: `tests/conftest.py` を作成**

```python
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine
from sqlmodel.pool import StaticPool

from app.main import app
from app.db import get_session


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session):
    def get_session_override():
        return session
    app.dependency_overrides[get_session] = get_session_override
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()
```

- [ ] **Step 2: 動作確認（既存の calc テストが通ること）**

Run: `.\.venv\Scripts\python.exe -m pytest -v`
Expected: test_calc の4件 PASS（他テストはまだ無い）

- [ ] **Step 3: コミット**

```bash
git add accounting/backend/tests/conftest.py
git commit -m "test(backend): pytest基盤(インメモリDB+TestClient)"
```

---

## Task 5: サービス層（DealIn→Deal 組み立て・マスタ自動登録）（TDD）

**Files:**
- Create: `accounting/backend/app/service.py`
- Test: `accounting/backend/tests/test_deals.py`（このタスクではサービスのみ。CRUDはTask6）

- [ ] **Step 1: 失敗するテストを書く**

`accounting/backend/tests/test_deals.py`:
```python
from datetime import date
from app.schemas import DealIn
from app.service import build_deal, register_masters
from app.models import Client, Instructor, Agency
from sqlmodel import select


def test_build_deal_auto_calculates_tax_billing_month_year():
    deal = build_deal(DealIn(held_on=date(2026, 6, 19), client="花王株式会社", fee=430000))
    assert deal.tax == 43000
    assert deal.billing == 473000
    assert deal.revenue_month == date(2026, 6, 30)
    assert deal.fiscal_year == 2026


def test_build_deal_respects_manual_tax_and_billing():
    deal = build_deal(DealIn(
        held_on=date(2026, 7, 30), client="タダノ共栄会",
        fee=300000, transport=50000, tax=30000, billing=380000,
    ))
    assert deal.tax == 30000
    assert deal.billing == 380000


def test_register_masters_inserts_new_names(session):
    register_masters(session, client="新規企業", instructor="新規講師", agency="新規代理店")
    session.commit()
    assert session.exec(select(Client).where(Client.name == "新規企業")).first() is not None
    assert session.exec(select(Instructor).where(Instructor.name == "新規講師")).first() is not None
    assert session.exec(select(Agency).where(Agency.name == "新規代理店")).first() is not None


def test_register_masters_is_idempotent(session):
    register_masters(session, client="重複企業")
    register_masters(session, client="重複企業")
    session.commit()
    rows = session.exec(select(Client).where(Client.name == "重複企業")).all()
    assert len(rows) == 1
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_deals.py -v`
Expected: FAIL（`ModuleNotFoundError: app.service`）

- [ ] **Step 3: `app/service.py` を実装**

```python
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
```

- [ ] **Step 4: テスト実行して成功を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_deals.py -v`
Expected: PASS（4件）

- [ ] **Step 5: コミット**

```bash
git add accounting/backend/app/service.py accounting/backend/tests/test_deals.py
git commit -m "feat(backend): サービス層(Deal組み立て/マスタ自動登録)"
```

---

## Task 6: 案件CRUD API（TDD）

**Files:**
- Create: `accounting/backend/app/routers/__init__.py`（空）
- Create: `accounting/backend/app/routers/deals.py`
- Modify: `accounting/backend/app/main.py`（ルータ登録）
- Test: `accounting/backend/tests/test_deals.py`（追記）

- [ ] **Step 1: 失敗するテストを追記**

`accounting/backend/tests/test_deals.py` の末尾に追記:
```python
def _sample_payload(**over):
    base = dict(held_on="2026-06-19", client="花王株式会社",
                instructor="高橋", fee=430000)
    base.update(over)
    return base


def test_create_deal_returns_calculated_fields(client):
    res = client.post("/api/deals", json=_sample_payload())
    assert res.status_code == 201
    body = res.json()
    assert body["tax"] == 43000
    assert body["billing"] == 473000
    assert body["fiscal_year"] == 2026
    assert body["revenue_month"] == "2026-06-30"
    assert body["id"] > 0


def test_create_deal_requires_client(client):
    res = client.post("/api/deals", json=_sample_payload(client=""))
    assert res.status_code == 422


def test_list_deals_filters_by_fiscal_year_and_status(client):
    client.post("/api/deals", json=_sample_payload(held_on="2026-06-19"))
    client.post("/api/deals", json=_sample_payload(held_on="2027-05-10"))  # 2027年度
    res = client.get("/api/deals", params={"fiscal_year": 2026})
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["fiscal_year"] == 2026


def test_update_and_delete_deal(client):
    created = client.post("/api/deals", json=_sample_payload()).json()
    did = created["id"]
    upd = client.put(f"/api/deals/{did}", json=_sample_payload(fee=500000))
    assert upd.status_code == 200
    assert upd.json()["tax"] == 50000
    assert upd.json()["billing"] == 550000
    dele = client.delete(f"/api/deals/{did}")
    assert dele.status_code == 204
    assert client.get("/api/deals", params={"fiscal_year": 2026}).json() == []


def test_create_deal_autoregisters_masters(client):
    client.post("/api/deals", json=_sample_payload(client="自動登録企業", instructor="自動講師"))
    masters = client.get("/api/masters/clients").json()
    names = [m["name"] for m in masters]
    assert "自動登録企業" in names
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_deals.py -v`
Expected: FAIL（404 などルート未定義。create系が落ちる）

- [ ] **Step 3: `app/routers/__init__.py` を空で作成**

- [ ] **Step 4: `app/routers/deals.py` を実装**

```python
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.db import get_session
from app.models import Deal
from app.schemas import DealIn
from app.service import build_deal, register_masters

router = APIRouter(prefix="/api/deals", tags=["deals"])


def _validate(data: DealIn) -> None:
    if not data.client or not data.client.strip():
        raise HTTPException(status_code=422, detail="企業名(client)は必須です")
    for field in ("fee", "transport", "other", "instructor_fee"):
        if getattr(data, field) < 0:
            raise HTTPException(status_code=422, detail=f"{field}は0以上で入力してください")


@router.get("")
def list_deals(
    session: Session = Depends(get_session),
    fiscal_year: Optional[int] = None,
    month: Optional[int] = None,
    client: Optional[str] = None,
    instructor: Optional[str] = None,
    agency: Optional[str] = None,
    payment_status: Optional[str] = None,
    q: Optional[str] = None,
):
    stmt = select(Deal)
    if fiscal_year is not None:
        stmt = stmt.where(Deal.fiscal_year == fiscal_year)
    if month is not None:
        stmt = stmt.where(Deal.revenue_month >= date(2000, 1, 1))  # placeholder replaced below
    if client:
        stmt = stmt.where(Deal.client == client)
    if instructor:
        stmt = stmt.where(Deal.instructor == instructor)
    if agency:
        stmt = stmt.where(Deal.agency == agency)
    if payment_status:
        stmt = stmt.where(Deal.payment_status == payment_status)
    rows = session.exec(stmt.order_by(Deal.revenue_month, Deal.held_on)).all()
    if month is not None:
        rows = [d for d in rows if d.revenue_month.month == month]
    if q:
        ql = q.lower()
        rows = [d for d in rows if ql in (d.client or "").lower()
                or ql in (d.training_name or "").lower()
                or ql in (d.instructor or "").lower()]
    return rows


@router.post("", status_code=201)
def create_deal(data: DealIn, session: Session = Depends(get_session)):
    _validate(data)
    deal = build_deal(data)
    session.add(deal)
    register_masters(session, client=data.client, instructor=data.instructor, agency=data.agency)
    session.commit()
    session.refresh(deal)
    return deal


@router.get("/{deal_id}")
def get_deal(deal_id: int, session: Session = Depends(get_session)):
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    return deal


@router.put("/{deal_id}")
def update_deal(deal_id: int, data: DealIn, session: Session = Depends(get_session)):
    _validate(data)
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    build_deal(data, deal)
    register_masters(session, client=data.client, instructor=data.instructor, agency=data.agency)
    session.add(deal)
    session.commit()
    session.refresh(deal)
    return deal


@router.delete("/{deal_id}", status_code=204)
def delete_deal(deal_id: int, session: Session = Depends(get_session)):
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    session.delete(deal)
    session.commit()
    return Response(status_code=204)
```

注: `month` フィルタはSQLで月抽出が方言依存のため、上記のとおり取得後にPythonで `revenue_month.month == month` で絞る（プレースホルダのwhere行は削除してよい）。最終形は次のとおり `list_deals` を整理する:

```python
@router.get("")
def list_deals(
    session: Session = Depends(get_session),
    fiscal_year: Optional[int] = None,
    month: Optional[int] = None,
    client: Optional[str] = None,
    instructor: Optional[str] = None,
    agency: Optional[str] = None,
    payment_status: Optional[str] = None,
    q: Optional[str] = None,
):
    stmt = select(Deal)
    if fiscal_year is not None:
        stmt = stmt.where(Deal.fiscal_year == fiscal_year)
    if client:
        stmt = stmt.where(Deal.client == client)
    if instructor:
        stmt = stmt.where(Deal.instructor == instructor)
    if agency:
        stmt = stmt.where(Deal.agency == agency)
    if payment_status:
        stmt = stmt.where(Deal.payment_status == payment_status)
    rows = session.exec(stmt.order_by(Deal.revenue_month, Deal.held_on)).all()
    if month is not None:
        rows = [d for d in rows if d.revenue_month.month == month]
    if q:
        ql = q.lower()
        rows = [d for d in rows if ql in (d.client or "").lower()
                or ql in (d.training_name or "").lower()
                or ql in (d.instructor or "").lower()]
    return rows
```

- [ ] **Step 5: `app/main.py` にルータを登録**

`app/main.py` の末尾に追記:
```python
from app.routers import deals

app.include_router(deals.router)
```

- [ ] **Step 6: テスト実行して成功を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_deals.py -v`
Expected: PASS（test_create_deal_autoregisters_masters は Task7 の masters ルータ未登録なら一旦 skip。順序の都合で Task7 後に再実行して PASS とする。ここでは create/update/delete/list/validate の各テストが PASS することを確認）

注: `test_create_deal_autoregisters_masters` は `/api/masters/clients` を参照するため、Task7 完了後に PASS する。Task6 時点では当該1件のみ失敗してよい。

- [ ] **Step 7: コミット**

```bash
git add accounting/backend/app/routers accounting/backend/app/main.py accounting/backend/tests/test_deals.py
git commit -m "feat(backend): 案件CRUD API"
```

---

## Task 7: マスタAPI（企業/講師/代理店）（TDD）

**Files:**
- Create: `accounting/backend/app/routers/masters.py`
- Modify: `accounting/backend/app/main.py`
- Test: `accounting/backend/tests/test_masters.py`

- [ ] **Step 1: 失敗するテストを書く**

`accounting/backend/tests/test_masters.py`:
```python
import pytest


@pytest.mark.parametrize("kind", ["clients", "instructors", "agencies"])
def test_master_crud(client, kind):
    # 作成
    res = client.post(f"/api/masters/{kind}", json={"name": "テスト名"})
    assert res.status_code == 201
    mid = res.json()["id"]
    # 一覧
    lst = client.get(f"/api/masters/{kind}").json()
    assert any(m["name"] == "テスト名" for m in lst)
    # 更新
    upd = client.put(f"/api/masters/{kind}/{mid}", json={"name": "変更後", "active": False})
    assert upd.status_code == 200
    assert upd.json()["name"] == "変更後"
    assert upd.json()["active"] is False
    # 削除
    dele = client.delete(f"/api/masters/{kind}/{mid}")
    assert dele.status_code == 204


def test_master_duplicate_name_rejected(client):
    client.post("/api/masters/clients", json={"name": "重複"})
    res = client.post("/api/masters/clients", json={"name": "重複"})
    assert res.status_code == 409


def test_unknown_kind_returns_404(client):
    assert client.get("/api/masters/unknown").status_code == 404
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_masters.py -v`
Expected: FAIL（404）

- [ ] **Step 3: `app/routers/masters.py` を実装**

```python
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from app.db import get_session
from app.models import Client, Instructor, Agency
from app.schemas import MasterIn

router = APIRouter(prefix="/api/masters", tags=["masters"])

MODELS = {"clients": Client, "instructors": Instructor, "agencies": Agency}


def _model(kind: str):
    model = MODELS.get(kind)
    if model is None:
        raise HTTPException(status_code=404, detail="不明なマスタ種別です")
    return model


@router.get("/{kind}")
def list_master(kind: str, session: Session = Depends(get_session)):
    model = _model(kind)
    return session.exec(select(model).order_by(model.name)).all()


@router.post("/{kind}", status_code=201)
def create_master(kind: str, data: MasterIn, session: Session = Depends(get_session)):
    model = _model(kind)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="名称は必須です")
    if session.exec(select(model).where(model.name == name)).first():
        raise HTTPException(status_code=409, detail="同じ名称が既に存在します")
    row = model(name=name, active=data.active)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.put("/{kind}/{row_id}")
def update_master(kind: str, row_id: int, data: MasterIn, session: Session = Depends(get_session)):
    model = _model(kind)
    row = session.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="マスタが見つかりません")
    row.name = data.name.strip()
    row.active = data.active
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/{kind}/{row_id}", status_code=204)
def delete_master(kind: str, row_id: int, session: Session = Depends(get_session)):
    model = _model(kind)
    row = session.get(model, row_id)
    if row is None:
        raise HTTPException(status_code=404, detail="マスタが見つかりません")
    session.delete(row)
    session.commit()
    return Response(status_code=204)
```

- [ ] **Step 4: `app/main.py` にルータ登録**

```python
from app.routers import masters

app.include_router(masters.router)
```

- [ ] **Step 5: テスト実行して成功を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_masters.py tests/test_deals.py -v`
Expected: PASS（masters全件 + deals全件。Task6 で保留した test_create_deal_autoregisters_masters もここで PASS）

- [ ] **Step 6: コミット**

```bash
git add accounting/backend/app/routers/masters.py accounting/backend/app/main.py accounting/backend/tests/test_masters.py
git commit -m "feat(backend): マスタAPI(企業/講師/代理店)"
```

---

## Task 8: 年度設定API（月額固定費）（TDD）

**Files:**
- Create: `accounting/backend/app/routers/settings.py`
- Modify: `accounting/backend/app/main.py`
- Test: `accounting/backend/tests/test_settings.py`

- [ ] **Step 1: 失敗するテストを書く**

`accounting/backend/tests/test_settings.py`:
```python
def test_get_settings_defaults_to_zero(client):
    res = client.get("/api/settings/2026")
    assert res.status_code == 200
    assert res.json()["fiscal_year"] == 2026
    assert res.json()["monthly_fixed_cost"] == 0


def test_put_settings_upserts(client):
    res = client.put("/api/settings/2026", json={"monthly_fixed_cost": 1500000})
    assert res.status_code == 200
    assert res.json()["monthly_fixed_cost"] == 1500000
    # 再取得で保持されている
    assert client.get("/api/settings/2026").json()["monthly_fixed_cost"] == 1500000
    # 上書き
    client.put("/api/settings/2026", json={"monthly_fixed_cost": 2000000})
    assert client.get("/api/settings/2026").json()["monthly_fixed_cost"] == 2000000
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_settings.py -v`
Expected: FAIL（404）

- [ ] **Step 3: `app/routers/settings.py` を実装**

```python
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
```

- [ ] **Step 4: `app/main.py` にルータ登録**

```python
from app.routers import settings

app.include_router(settings.router)
```

- [ ] **Step 5: テスト実行して成功を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_settings.py -v`
Expected: PASS（2件）

- [ ] **Step 6: コミット**

```bash
git add accounting/backend/app/routers/settings.py accounting/backend/app/main.py accounting/backend/tests/test_settings.py
git commit -m "feat(backend): 年度設定API(月額固定費)"
```

---

## Task 9: 集計の計算層（純粋関数）（TDD）

集計ロジックをDBに依存しない純粋関数として `calc.py` に追加し、単体テストする。ルータ(Task10/11)はこれを呼ぶだけにする。

**Files:**
- Modify: `accounting/backend/app/calc.py`
- Test: `accounting/backend/tests/test_summary.py`（計算層パート）

- [ ] **Step 1: 失敗するテストを書く**

`accounting/backend/tests/test_summary.py`:
```python
from app.calc import fiscal_months, monthly_buckets, pl_metrics


def test_fiscal_months_returns_apr_to_mar_year_month_pairs():
    months = fiscal_months(2026)
    assert months[0] == (2026, 4)
    assert months[8] == (2026, 12)
    assert months[9] == (2027, 1)
    assert months[11] == (2027, 3)
    assert len(months) == 12


def test_monthly_buckets_sums_amounts_into_12_slots():
    # (year, month, amount) の明細を12スロットに集計
    items = [(2026, 4, 100), (2026, 4, 50), (2027, 1, 200)]
    buckets = monthly_buckets(2026, items)
    assert buckets[0] == 150   # 4月
    assert buckets[9] == 200   # 1月
    assert sum(buckets) == 350


def test_pl_metrics_computes_bep_and_profit():
    m = pl_metrics(net_sales=20000000, variable=4000000, annual_fixed=12000000)
    # 限界利益率 = (2000万-400万)/2000万 = 0.8
    assert abs(m["cm_ratio"] - 0.8) < 1e-9
    # BEP = 1200万 / 0.8 = 1500万
    assert m["bep"] == 15000000
    # 営業利益 = 2000万 - 400万 - 1200万 = 400万
    assert m["operating_profit"] == 4000000


def test_pl_metrics_handles_zero_sales():
    m = pl_metrics(net_sales=0, variable=0, annual_fixed=1000000)
    assert m["cm_ratio"] == 0
    assert m["bep"] == 0
    assert m["operating_profit"] == -1000000
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_summary.py -v`
Expected: FAIL（`ImportError: cannot import name 'fiscal_months'`）

- [ ] **Step 3: `app/calc.py` に追記**

```python
from typing import Iterable, Tuple


def fiscal_months(fiscal_year: int) -> list[Tuple[int, int]]:
    """年度の (年, 月) を4月→翌3月の順で12個返す。"""
    result = []
    for m in range(4, 13):
        result.append((fiscal_year, m))
    for m in range(1, 4):
        result.append((fiscal_year + 1, m))
    return result


def monthly_buckets(fiscal_year: int, items: Iterable[Tuple[int, int, int]]) -> list[int]:
    """(年, 月, 金額) の明細を、年度の12スロット(4月→翌3月)に合計する。"""
    index = {ym: i for i, ym in enumerate(fiscal_months(fiscal_year))}
    buckets = [0] * 12
    for year, month, amount in items:
        i = index.get((year, month))
        if i is not None:
            buckets[i] += amount
    return buckets


def pl_metrics(net_sales: int, variable: int, annual_fixed: int) -> dict:
    """損益分岐点まわりの指標を計算する。"""
    contribution_margin = net_sales - variable
    cm_ratio = (contribution_margin / net_sales) if net_sales else 0.0
    bep = round(annual_fixed / cm_ratio) if cm_ratio else 0
    operating_profit = net_sales - variable - annual_fixed
    safety_margin_ratio = ((net_sales - bep) / net_sales) if net_sales else 0.0
    bep_achievement = (net_sales / bep) if bep else 0.0
    return {
        "net_sales": net_sales,
        "variable": variable,
        "annual_fixed": annual_fixed,
        "contribution_margin": contribution_margin,
        "cm_ratio": cm_ratio,
        "bep": bep,
        "operating_profit": operating_profit,
        "safety_margin_ratio": safety_margin_ratio,
        "bep_achievement": bep_achievement,
    }
```

- [ ] **Step 4: テスト実行して成功を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_summary.py -v`
Expected: PASS（4件）

- [ ] **Step 5: コミット**

```bash
git add accounting/backend/app/calc.py accounting/backend/tests/test_summary.py
git commit -m "feat(backend): 集計計算層(年度月/月別集計/BEP指標)"
```

---

## Task 10: 集計API（monthly / annual / by）（TDD）

**Files:**
- Create: `accounting/backend/app/routers/summary.py`
- Modify: `accounting/backend/app/main.py`
- Test: `accounting/backend/tests/test_summary.py`（API パート追記）

- [ ] **Step 1: 失敗するテストを追記**

`accounting/backend/tests/test_summary.py` の末尾に追記:
```python
def _post(client, **over):
    base = dict(held_on="2026-06-19", client="A社", instructor="高橋",
                agency="TAC", fee=400000)
    base.update(over)
    return client.post("/api/deals", json=base)


def test_summary_monthly_returns_12_billing_buckets(client):
    _post(client, held_on="2026-04-10", client="A社", fee=400000)  # billing 440000 → 4月
    _post(client, held_on="2026-05-10", client="B社", fee=200000)  # billing 220000 → 5月
    res = client.get("/api/summary/monthly", params={"fiscal_year": 2026})
    assert res.status_code == 200
    body = res.json()
    assert body["labels"][0] == "4月"
    assert body["current"][0] == 440000
    assert body["current"][1] == 220000
    assert body["total"] == 660000
    # 前年(2025)データは無いので prev は全て None
    assert all(v is None for v in body["prev"])


def test_summary_annual_matrix_by_client(client):
    _post(client, held_on="2026-04-10", client="A社", fee=400000)  # 440000 4月
    _post(client, held_on="2026-08-10", client="A社", fee=400000)  # 440000 8月
    _post(client, held_on="2026-05-10", client="B社", fee=200000)  # 220000 5月
    res = client.get("/api/summary/annual", params={"fiscal_year": 2026})
    body = res.json()
    a_row = next(r for r in body["rows"] if r["client"] == "A社")
    assert a_row["months"][0] == 440000   # 4月
    assert a_row["months"][4] == 440000   # 8月
    assert a_row["total"] == 880000
    assert body["month_totals"][0] == 440000
    assert body["grand_total"] == 1100000


def test_summary_by_instructor_share(client):
    _post(client, held_on="2026-04-10", instructor="高橋", fee=400000)   # 440000
    _post(client, held_on="2026-04-10", instructor="窪田", fee=600000)   # 660000
    res = client.get("/api/summary/by", params={"dim": "instructor",
                     "frm": "2026-04-01", "to": "2027-03-31"})
    body = res.json()
    total = sum(r["amount"] for r in body)
    assert total == 1100000
    takahashi = next(r for r in body if r["name"] == "高橋")
    assert takahashi["amount"] == 440000
    assert abs(takahashi["share"] - 440000 / 1100000) < 1e-9
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_summary.py -v`
Expected: FAIL（summary API 未定義で 404）

- [ ] **Step 3: `app/routers/summary.py` を実装（monthly/annual/by）**

```python
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.db import get_session
from app.models import Deal
from app import calc

router = APIRouter(prefix="/api/summary", tags=["summary"])

MONTH_LABELS = ["4月", "5月", "6月", "7月", "8月", "9月",
                "10月", "11月", "12月", "1月", "2月", "3月"]


def _deals_in_fy(session: Session, fiscal_year: int):
    return session.exec(select(Deal).where(Deal.fiscal_year == fiscal_year)).all()


@router.get("/monthly")
def monthly(fiscal_year: int, session: Session = Depends(get_session)):
    cur = _deals_in_fy(session, fiscal_year)
    prev = _deals_in_fy(session, fiscal_year - 1)
    cur_buckets = calc.monthly_buckets(
        fiscal_year, [(d.revenue_month.year, d.revenue_month.month, d.billing) for d in cur]
    )
    has_prev = len(prev) > 0
    prev_buckets = calc.monthly_buckets(
        fiscal_year - 1, [(d.revenue_month.year, d.revenue_month.month, d.billing) for d in prev]
    )
    prev_series = prev_buckets if has_prev else [None] * 12
    return {
        "labels": MONTH_LABELS,
        "current": cur_buckets,
        "prev": prev_series,
        "total": sum(cur_buckets),
    }


@router.get("/annual")
def annual(fiscal_year: int, session: Session = Depends(get_session)):
    deals = _deals_in_fy(session, fiscal_year)
    clients = sorted({d.client for d in deals})
    rows = []
    month_totals = [0] * 12
    for c in clients:
        items = [(d.revenue_month.year, d.revenue_month.month, d.billing)
                 for d in deals if d.client == c]
        buckets = calc.monthly_buckets(fiscal_year, items)
        for i in range(12):
            month_totals[i] += buckets[i]
        rows.append({"client": c, "months": buckets, "total": sum(buckets)})
    return {
        "labels": MONTH_LABELS,
        "rows": rows,
        "month_totals": month_totals,
        "grand_total": sum(month_totals),
    }


@router.get("/by")
def by_dimension(
    dim: str = Query(..., pattern="^(instructor|agency|client)$"),
    frm: date = Query(..., alias="frm"),
    to: date = Query(...),
    session: Session = Depends(get_session),
):
    deals = session.exec(
        select(Deal).where(Deal.revenue_month >= frm, Deal.revenue_month <= to)
    ).all()
    totals: dict[str, dict] = {}
    for d in deals:
        key = getattr(d, dim) or "(未設定)"
        bucket = totals.setdefault(key, {"name": key, "amount": 0, "instructor_fee": 0})
        bucket["amount"] += d.billing
        bucket["instructor_fee"] += d.instructor_fee
    grand = sum(b["amount"] for b in totals.values())
    result = []
    for b in sorted(totals.values(), key=lambda x: x["amount"], reverse=True):
        b["share"] = (b["amount"] / grand) if grand else 0.0
        result.append(b)
    return result
```

- [ ] **Step 4: `app/main.py` にルータ登録**

```python
from app.routers import summary

app.include_router(summary.router)
```

- [ ] **Step 5: テスト実行して成功を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_summary.py -v`
Expected: PASS（計算層4件 + API3件 = 7件）

- [ ] **Step 6: コミット**

```bash
git add accounting/backend/app/routers/summary.py accounting/backend/app/main.py accounting/backend/tests/test_summary.py
git commit -m "feat(backend): 集計API(月別/年間/軸別)"
```

---

## Task 11: 損益・BEP API（pl）（TDD）

**Files:**
- Modify: `accounting/backend/app/routers/summary.py`
- Test: `accounting/backend/tests/test_summary.py`（追記）

- [ ] **Step 1: 失敗するテストを追記**

`accounting/backend/tests/test_summary.py` の末尾に追記:
```python
def test_summary_pl_full(client):
    # 月額固定費 100万 → 年間1200万
    client.put("/api/settings/2026", json={"monthly_fixed_cost": 1000000})
    # net = fee+transport+other。講師料(変動費)を設定。
    client.post("/api/deals", json=dict(held_on="2026-04-10", client="A社",
                fee=10000000, transport=0, other=0, instructor_fee=2000000))
    client.post("/api/deals", json=dict(held_on="2026-05-10", client="B社",
                fee=10000000, transport=0, other=0, instructor_fee=2000000))
    res = client.get("/api/summary/pl", params={"fiscal_year": 2026})
    assert res.status_code == 200
    b = res.json()
    assert b["net_sales"] == 20000000
    assert b["variable"] == 4000000
    assert b["annual_fixed"] == 12000000
    assert abs(b["cm_ratio"] - 0.8) < 1e-9
    assert b["bep"] == 15000000
    assert b["operating_profit"] == 4000000
    # 月別 net とBEP系列
    assert b["monthly_net"][0] == 10000000  # 4月
    assert b["monthly_net"][1] == 10000000  # 5月
    # 粗利率(4月) = (1000万-200万)/1000万 = 0.8
    assert abs(b["gross_margin_rate"][0] - 0.8) < 1e-9
    # 累計（黒字転換用）: 4月末 累計net=1000万, 累計総費用=月固定100万+変動200万=300万
    assert b["cum_net"][0] == 10000000
    assert b["cum_total_cost"][0] == 3000000
    # 得意先トップ5（net基準）
    assert b["top_clients"][0]["name"] in ("A社", "B社")
    assert b["top_clients"][0]["amount"] == 10000000
    assert len(b["top_clients"]) <= 5
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_summary.py::test_summary_pl_full -v`
Expected: FAIL（pl 未定義で 404）

- [ ] **Step 3: `app/routers/summary.py` に pl を追記**

ファイル先頭の import に `Setting` を追加:
```python
from app.models import Deal, Setting
```
末尾に関数を追記:
```python
def _net(d: Deal) -> int:
    return d.fee + d.transport + d.other


@router.get("/pl")
def profit_loss(fiscal_year: int, session: Session = Depends(get_session)):
    deals = _deals_in_fy(session, fiscal_year)
    setting = session.get(Setting, fiscal_year)
    monthly_fixed = setting.monthly_fixed_cost if setting else 0
    annual_fixed = monthly_fixed * 12

    net_sales = sum(_net(d) for d in deals)
    variable = sum(d.instructor_fee for d in deals)
    metrics = calc.pl_metrics(net_sales, variable, annual_fixed)

    monthly_net = calc.monthly_buckets(
        fiscal_year, [(d.revenue_month.year, d.revenue_month.month, _net(d)) for d in deals]
    )
    monthly_var = calc.monthly_buckets(
        fiscal_year, [(d.revenue_month.year, d.revenue_month.month, d.instructor_fee) for d in deals]
    )
    gross_margin_rate = [
        ((monthly_net[i] - monthly_var[i]) / monthly_net[i]) if monthly_net[i] else 0.0
        for i in range(12)
    ]

    cum_net, cum_total_cost = [], []
    run_net = run_cost = 0
    for i in range(12):
        run_net += monthly_net[i]
        run_cost += monthly_var[i] + monthly_fixed
        cum_net.append(run_net)
        cum_total_cost.append(run_cost)

    by_client: dict[str, int] = {}
    for d in deals:
        by_client[d.client] = by_client.get(d.client, 0) + _net(d)
    top_clients = [
        {"name": name, "amount": amount,
         "share": (amount / net_sales) if net_sales else 0.0}
        for name, amount in sorted(by_client.items(), key=lambda x: x[1], reverse=True)[:5]
    ]

    return {
        **metrics,
        "monthly_labels": MONTH_LABELS,
        "monthly_net": monthly_net,
        "monthly_variable": monthly_var,
        "gross_margin_rate": gross_margin_rate,
        "cum_net": cum_net,
        "cum_total_cost": cum_total_cost,
        "top_clients": top_clients,
    }
```

- [ ] **Step 4: テスト実行して成功を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_summary.py -v`
Expected: PASS（全 summary テスト）

- [ ] **Step 5: コミット**

```bash
git add accounting/backend/app/routers/summary.py accounting/backend/tests/test_summary.py
git commit -m "feat(backend): 損益・BEP API(粗利率/累計/得意先トップ5)"
```

---

## Task 12: 入金管理API（TDD）

**Files:**
- Create: `accounting/backend/app/routers/payments.py`
- Modify: `accounting/backend/app/main.py`
- Test: `accounting/backend/tests/test_payments.py`

- [ ] **Step 1: 失敗するテストを書く**

`accounting/backend/tests/test_payments.py`:
```python
def _post(client, **over):
    base = dict(held_on="2026-06-19", client="A社", fee=400000,
                payment_due="2026-07-31")
    base.update(over)
    return client.post("/api/deals", json=base).json()


def test_payments_list_unpaid_only(client):
    _post(client, client="未A")
    paid = _post(client, client="済B")
    client.post(f"/api/deals/{paid['id']}/pay", json={"paid_on": "2026-07-20"})
    res = client.get("/api/payments", params={"status": "unpaid", "fiscal_year": 2026})
    names = [r["client"] for r in res.json()]
    assert "未A" in names
    assert "済B" not in names


def test_mark_paid_sets_status_and_date(client):
    d = _post(client)
    res = client.post(f"/api/deals/{d['id']}/pay", json={"paid_on": "2026-07-25"})
    assert res.status_code == 200
    assert res.json()["payment_status"] == "paid"
    assert res.json()["paid_on"] == "2026-07-25"


def test_mark_paid_without_date_uses_today(client):
    d = _post(client)
    res = client.post(f"/api/deals/{d['id']}/pay", json={})
    assert res.status_code == 200
    assert res.json()["payment_status"] == "paid"
    assert res.json()["paid_on"] is not None
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_payments.py -v`
Expected: FAIL（404）

- [ ] **Step 3: 入金済み化エンドポイントを `deals.py` に追加**

`app/routers/deals.py` の import に追加:
```python
from datetime import date as date_cls
from app.schemas import DealIn, PayIn
```
（既存の `from app.schemas import DealIn` 行を上記に置き換え）

`delete_deal` の下に追記:
```python
@router.post("/{deal_id}/pay")
def mark_paid(deal_id: int, data: PayIn, session: Session = Depends(get_session)):
    deal = session.get(Deal, deal_id)
    if deal is None:
        raise HTTPException(status_code=404, detail="案件が見つかりません")
    deal.payment_status = "paid"
    deal.paid_on = data.paid_on or date_cls.today()
    session.add(deal)
    session.commit()
    session.refresh(deal)
    return deal
```

- [ ] **Step 4: `app/routers/payments.py` を実装（一覧）**

```python
from typing import Optional
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.models import Deal

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("")
def list_payments(
    session: Session = Depends(get_session),
    status: Optional[str] = None,
    fiscal_year: Optional[int] = None,
):
    stmt = select(Deal)
    if status:
        stmt = stmt.where(Deal.payment_status == status)
    if fiscal_year is not None:
        stmt = stmt.where(Deal.fiscal_year == fiscal_year)
    return session.exec(stmt.order_by(Deal.payment_due)).all()
```

- [ ] **Step 5: `app/main.py` にルータ登録**

```python
from app.routers import payments

app.include_router(payments.router)
```

- [ ] **Step 6: テスト実行して成功を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_payments.py -v`
Expected: PASS（3件）

- [ ] **Step 7: コミット**

```bash
git add accounting/backend/app/routers/payments.py accounting/backend/app/routers/deals.py accounting/backend/app/main.py accounting/backend/tests/test_payments.py
git commit -m "feat(backend): 入金管理API(未入金一覧/入金済み化)"
```

---

## Task 13: Excel取り込み・出力（TDD）

**Files:**
- Create: `accounting/backend/app/routers/io_excel.py`
- Modify: `accounting/backend/app/main.py`
- Test: `accounting/backend/tests/test_io_excel.py`

取り込み元シート名: `①案件日付別管理`。列順:
`売上月(月末) | 実施日 | 代理店 | 企業名 | 研修名 | 講師 | 研修費用 | 交通費 | その他 | 消費税 | 請求額 | 講師料 | 入金予定日 | サポートスタッフ`（1行目はヘッダ）

- [ ] **Step 1: 失敗するテストを書く**

`accounting/backend/tests/test_io_excel.py`:
```python
import io
from datetime import date
import openpyxl
from app.io_parse import parse_deals_sheet


def _make_workbook():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "①案件日付別管理"
    ws.append(["売上月", "実施日", "代理店", "企業名", "研修名", "講師",
               "研修費用", "交通費", "その他", "消費税", "請求額", "講師料",
               "入金予定日", "サポートスタッフ"])
    ws.append([date(2026, 4, 30), date(2026, 4, 8), None, "サンライズ", None, "平野",
               450000, None, None, 45000, 495000, None, None, None])
    ws.append([date(2026, 7, 31), date(2026, 7, 30), None, "タダノ共栄会", "安全衛生", None,
               300000, 50000, None, 30000, 380000, 100000, None, None])
    return wb


def test_parse_deals_sheet_maps_rows():
    wb = _make_workbook()
    deals = parse_deals_sheet(wb)
    assert len(deals) == 2
    d0 = deals[0]
    assert d0.client == "サンライズ"
    assert d0.fee == 450000
    assert d0.tax == 45000
    assert d0.billing == 495000
    assert d0.held_on == date(2026, 4, 8)
    d1 = deals[1]
    assert d1.transport == 50000
    assert d1.instructor_fee == 100000


def test_import_endpoint_loads_and_wipes(client):
    wb = _make_workbook()
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    res = client.post(
        "/api/import/excel?wipe=true",
        files={"file": ("test.xlsx", buf,
               "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 2
    deals = client.get("/api/deals", params={"fiscal_year": 2026}).json()
    assert len(deals) == 2
    # マスタにも登録されている
    clients = client.get("/api/masters/clients").json()
    assert any(m["name"] == "サンライズ" for m in clients)


def test_export_endpoint_returns_xlsx(client):
    client.post("/api/deals", json=dict(held_on="2026-06-19", client="A社", fee=400000))
    res = client.get("/api/export/excel", params={"fiscal_year": 2026})
    assert res.status_code == 200
    assert "spreadsheetml" in res.headers["content-type"]
    wb = openpyxl.load_workbook(io.BytesIO(res.content))
    ws = wb.active
    assert ws.max_row >= 2  # ヘッダ + 1件
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_io_excel.py -v`
Expected: FAIL（`ModuleNotFoundError: app.io_parse`）

- [ ] **Step 3: `app/io_parse.py` を作成（パース純粋関数）**

```python
from datetime import date, datetime
from typing import Optional
import openpyxl

from app.schemas import DealIn

SHEET_NAME = "①案件日付別管理"


def _to_date(v) -> Optional[date]:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


def _to_int(v) -> int:
    if v is None or v == "":
        return 0
    return int(round(float(v)))


def _opt_int(v) -> Optional[int]:
    if v is None or v == "":
        return None
    return int(round(float(v)))


def _to_str(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def parse_deals_sheet(wb) -> list[DealIn]:
    ws = wb[SHEET_NAME] if SHEET_NAME in wb.sheetnames else wb.active
    deals: list[DealIn] = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        # 列: 売上月, 実施日, 代理店, 企業名, 研修名, 講師, 研修費用, 交通費,
        #     その他, 消費税, 請求額, 講師料, 入金予定日, サポートスタッフ
        revenue_month = _to_date(row[0])
        held_on = _to_date(row[1])
        client_name = _to_str(row[3])
        if held_on is None and revenue_month is None:
            continue
        if not client_name:
            continue
        if held_on is None:
            held_on = revenue_month
        deals.append(DealIn(
            revenue_month=revenue_month,
            held_on=held_on,
            agency=_to_str(row[2]),
            client=client_name,
            training_name=_to_str(row[4]),
            instructor=_to_str(row[5]),
            fee=_to_int(row[6]),
            transport=_to_int(row[7]),
            other=_to_int(row[8]),
            tax=_opt_int(row[9]),
            billing=_opt_int(row[10]),
            instructor_fee=_to_int(row[11]),
            payment_due=_to_date(row[12]),
            support_staff=_to_str(row[13]) if len(row) > 13 else None,
        ))
    return deals
```

- [ ] **Step 4: `app/routers/io_excel.py` を実装（取り込み/出力）**

```python
import io
from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select, delete
import openpyxl

from app.db import get_session
from app.models import Deal
from app.service import build_deal, register_masters
from app.io_parse import parse_deals_sheet

router = APIRouter(prefix="/api", tags=["io"])

EXPORT_HEADER = ["売上月", "実施日", "代理店", "企業名", "研修名", "講師",
                 "研修費用", "交通費", "その他", "消費税", "請求額", "講師料",
                 "入金予定日", "入金状況", "入金日", "サポートスタッフ", "備考"]


@router.post("/import/excel")
async def import_excel(file: UploadFile = File(...), wipe: bool = False,
                       session: Session = Depends(get_session)):
    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    deals_in = parse_deals_sheet(wb)
    if wipe:
        session.exec(delete(Deal))
    imported = 0
    for data in deals_in:
        deal = build_deal(data)
        session.add(deal)
        register_masters(session, client=data.client,
                         instructor=data.instructor, agency=data.agency)
        imported += 1
    session.commit()
    return {"imported": imported}


@router.get("/export/excel")
def export_excel(fiscal_year: int, session: Session = Depends(get_session)):
    deals = session.exec(
        select(Deal).where(Deal.fiscal_year == fiscal_year)
        .order_by(Deal.revenue_month, Deal.held_on)
    ).all()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"{fiscal_year}年度"
    ws.append(EXPORT_HEADER)
    for d in deals:
        ws.append([
            d.revenue_month, d.held_on, d.agency, d.client, d.training_name, d.instructor,
            d.fee, d.transport, d.other, d.tax, d.billing, d.instructor_fee,
            d.payment_due, ("入金済" if d.payment_status == "paid" else "未入金"),
            d.paid_on, d.support_staff, d.note,
        ])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"sales_{fiscal_year}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 5: `app/main.py` にルータ登録**

```python
from app.routers import io_excel

app.include_router(io_excel.router)
```

- [ ] **Step 6: テスト実行して成功を確認**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_io_excel.py -v`
Expected: PASS（4件）

- [ ] **Step 7: コミット**

```bash
git add accounting/backend/app/io_parse.py accounting/backend/app/routers/io_excel.py accounting/backend/app/main.py accounting/backend/tests/test_io_excel.py
git commit -m "feat(backend): Excel取り込み・出力"
```

---

## Task 14: 全テスト緑化・README・実データ取り込み確認

**Files:**
- Create: `accounting/backend/README.md`

- [ ] **Step 1: 全テストを実行**

Run: `.\.venv\Scripts\python.exe -m pytest -v`
Expected: 全テスト PASS（calc/deals/masters/settings/summary/payments/io_excel）

- [ ] **Step 2: `accounting/backend/README.md` を作成**

```markdown
# 研修売上管理 バックエンド

## セットアップ
```powershell
cd accounting/backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 起動
```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
- API ドキュメント: http://localhost:8000/docs
- DB ファイル: `accounting.db`（環境変数 `ACCOUNTING_DB` で変更可）

## テスト
```powershell
.\.venv\Scripts\python.exe -m pytest -v
```

## 既存Excel取り込み
`/docs` の `POST /api/import/excel`（`wipe=true` で洗い替え）に
`2026年度研修売上管理表_アカデミージャパン.xlsx` をアップロードする。
```

- [ ] **Step 3: 実データの取り込み確認（手動・任意）**

サーバを起動し、別シェルで実ファイルを取り込む:
```powershell
cd accounting/backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```
別 PowerShell:
```powershell
$f = "C:\Users\川西竜太\Downloads\2026年度研修売上管理表_アカデミージャパン.xlsx"
curl.exe -F "file=@$f" "http://localhost:8000/api/import/excel?wipe=true"
```
Expected: `{"imported": 79}` 付近（クライアント名のある行数）。
`curl.exe "http://localhost:8000/api/summary/pl?fiscal_year=2026"` で集計が返ることを確認。確認後サーバ停止。

- [ ] **Step 4: コミット**

```bash
git add accounting/backend/README.md
git commit -m "docs(backend): README追加・全テスト緑化"
```

---

## 自己レビュー結果（spec 対応表）

| spec 要件 | 対応タスク |
|---|---|
| 消費税=fee×10% / 請求額=fee+交通+その他+税（自動・手修正可） | Task2, Task5 |
| 売上月=実施日の月末（手修正可）/ 年度導出 | Task2, Task5 |
| deals データモデル（入金状況/入金日/備考含む） | Task3 |
| マスタ（clients/instructors/agencies、選択＋自由入力＝自動登録） | Task3, Task5, Task7 |
| settings（月額固定費） | Task3, Task8 |
| 案件CRUD・一覧フィルタ（年度/月/企業/講師/代理店/入金状況/検索） | Task6 |
| 月別集計（+前年同月） | Task9, Task10 |
| 年間売上管理表（企業×12ヶ月+合計/月計） | Task10 |
| 軸別集計（講師/代理店/クライアント、シェア率） | Task10 |
| 損益・BEP（売上税抜/変動費/固定費/限界利益率/BEP/営業利益/安全余裕率） | Task9, Task11 |
| 粗利率推移 / 月次累計黒字転換 / 得意先トップ5 | Task11 |
| 入金管理（未入金一覧/入金済み化） | Task12 |
| Excel取り込み（①案件日付別管理）・出力 | Task13 |
| テスト（pytest） | 全タスク |

前年同月比は前年度(2025)データが無い場合 `prev` を null 配列で返す（spec の「前年データなし」表示に対応）。
