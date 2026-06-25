# 資金繰り（年間大型支払い＋資金残高推移）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 年間の大型支払い（消費税・社保等）を「項目×12ヶ月」の表で登録し、期首残高を起点に「入金−支払い」の資金残高推移を見える化する新規ページ「資金繰り」を追加する。

**Architecture:** 既存のFastAPI＋SQLModel＋SQLite構成に、項目マスタ(`PaymentItem`)と月別金額(`PaymentSchedule`)の2テーブルを追加し、`Setting`に`opening_balance`列を足す。新ルーター`routers/cashflow.py`が項目CRUD・金額一括保存・推移集計を担う。フロントは新ページ`CashFlow.tsx`を追加し、既存のrecharts/States/format資産を流用する。既存画面・集計には触れない。

**Tech Stack:** Backend: FastAPI / SQLModel / SQLite / pytest。Frontend: React + TypeScript + Vite + recharts。

**設計根拠:** `docs/superpowers/specs/2026-06-24-cashflow-annual-payments-design.md`

---

## ファイル構成（責務）

**バックエンド**
- `backend/app/models.py`（変更）: `PaymentItem`・`PaymentSchedule` 追加、`Setting.opening_balance` 追加
- `backend/app/schemas.py`（変更）: `SettingIn` 拡張、`PaymentItemIn`・`PaymentItemUpdate`・`ScheduleCellIn`・`SchedulePutIn` 追加
- `backend/app/routers/settings.py`（変更）: 期首残高の部分更新に対応
- `backend/app/routers/cashflow.py`（新規）: 項目CRUD・金額マトリクス・推移集計
- `backend/app/calc.py`（変更）: `running_total()` 追加（累計残高の純粋関数）
- `backend/app/db.py`（変更）: `Setting.opening_balance` のALTER＋`PaymentItem` 定番6項目シード
- `backend/app/main.py`（変更）: `cashflow` ルーター登録
- `backend/tests/test_settings.py`（変更）: 期首残高テスト
- `backend/tests/test_calc.py`（変更）: `running_total` テスト
- `backend/tests/test_cashflow.py`（新規）: 項目CRUD・金額・推移のテスト

**フロント**
- `frontend/src/api/types.ts`（変更）: `Setting` 拡張、`PaymentItem`・`ScheduleMatrix`・`CashFlowSummary` 追加
- `frontend/src/api/client.ts`（変更）: `cashflow` 系API・`putOpeningBalance` 追加
- `frontend/src/pages/CashFlow.tsx`（新規）: 画面本体
- `frontend/src/App.tsx`（変更）: `/cashflow` ルート追加
- `frontend/src/components/Layout.tsx`（変更）: メニュー「資金繰り」＋アイコン追加
- `frontend/src/styles.css`（変更）: 表・トグルの最小スタイル

> **権限について:** `lib/access.ts` の `STAFF_PATHS` に `/cashflow` を含めない＝admin専用になる（`canAccess` は admin で常に true、staff は STAFF_PATHS 前置一致のみ true）。よって access.ts の変更は不要。

> **テスト前提:** `backend/tests/conftest.py` は `SQLModel.metadata.create_all` でテーブルを直接作成し、`_run_migrations()`（＝定番項目シード）は実行されない。したがってテストでは項目をAPI経由で作ってから検証する。

---

## Task 1: `Setting.opening_balance`（期首残高）

**Files:**
- Modify: `backend/app/models.py:80-83`
- Modify: `backend/app/schemas.py:66-67`
- Modify: `backend/app/routers/settings.py:45-56`
- Modify: `backend/app/db.py`（`_run_migrations` 内）
- Test: `backend/tests/test_settings.py`

- [ ] **Step 1: 期首残高のテストを追記（失敗させる）**

`backend/tests/test_settings.py` の末尾に追記：

```python
def test_settings_opening_balance_defaults_to_zero(client):
    res = client.get("/api/settings/2026")
    assert res.status_code == 200
    assert res.json()["opening_balance"] == 0


def test_put_opening_balance_does_not_clear_fixed_cost(client):
    # 固定費を入れてから、期首残高だけを送る → 固定費は維持される（部分更新）
    client.put("/api/settings/2026", json={"monthly_fixed_cost": 1500000})
    res = client.put("/api/settings/2026", json={"opening_balance": 5000000})
    assert res.status_code == 200
    body = client.get("/api/settings/2026").json()
    assert body["opening_balance"] == 5000000
    assert body["monthly_fixed_cost"] == 1500000  # 消えていないこと
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_settings.py -v`
Expected: FAIL（`opening_balance` キーが無い / 固定費が0に消える）

- [ ] **Step 3: モデルに列を追加**

`backend/app/models.py` の `Setting` を次に置き換え：

```python
class Setting(SQLModel, table=True):
    fiscal_year: int = Field(primary_key=True)
    monthly_fixed_cost: int = 0
    opening_balance: int = 0          # 年度開始時点の手元資金（資金繰り画面の起点）
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

- [ ] **Step 4: スキーマを部分更新対応に変更**

`backend/app/schemas.py` の `SettingIn` を次に置き換え（両フィールドを任意化し、送られた項目だけ更新する）：

```python
class SettingIn(SQLModel):
    monthly_fixed_cost: Optional[int] = None
    opening_balance: Optional[int] = None
```

- [ ] **Step 5: settings ルーターを部分更新に変更**

`backend/app/routers/settings.py` の `put_settings` を次に置き換え：

```python
@router.put("/{fiscal_year}")
def put_settings(fiscal_year: int, data: SettingIn, session: Session = Depends(get_session)):
    row = session.get(Setting, fiscal_year)
    if row is None:
        row = Setting(fiscal_year=fiscal_year)
    if data.monthly_fixed_cost is not None:
        row.monthly_fixed_cost = data.monthly_fixed_cost
    if data.opening_balance is not None:
        row.opening_balance = data.opening_balance
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
```

- [ ] **Step 6: 既存DB向けマイグレーションを追記**

`backend/app/db.py` の `_run_migrations()` 内、`with engine.connect() as conn:` ブロックの `conn.commit()` の直前に追記：

```python
        setting_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(setting)"))]
        if setting_cols and "opening_balance" not in setting_cols:
            conn.execute(text("ALTER TABLE setting ADD COLUMN opening_balance INTEGER DEFAULT 0"))
```

- [ ] **Step 7: テストが通ることを確認**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_settings.py -v`
Expected: PASS（既存2件＋新規2件）

- [ ] **Step 8: コミット**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/routers/settings.py backend/app/db.py backend/tests/test_settings.py
git commit -m "feat(settings): 期首残高(opening_balance)を追加（部分更新対応）"
```

---

## Task 2: `running_total` 純粋関数（累計残高）

**Files:**
- Modify: `backend/app/calc.py`（末尾に追加）
- Test: `backend/tests/test_calc.py`

- [ ] **Step 1: テストを追記（失敗させる）**

`backend/tests/test_calc.py` の先頭importを次に変更：

```python
from app.calc import fiscal_months, monthly_buckets, pl_metrics, running_total
```

ファイル末尾に追記：

```python
def test_running_total_accumulates_from_start():
    assert running_total([100, -30, 50], start=1000) == [1100, 1070, 1120]


def test_running_total_empty_returns_empty():
    assert running_total([], start=500) == []
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_calc.py -v`
Expected: FAIL（`running_total` が import できない）

- [ ] **Step 3: 関数を実装**

`backend/app/calc.py` の末尾に追加：

```python
def running_total(values: Iterable[int], start: int = 0) -> list[int]:
    """各時点までの累計を、start を起点に返す。資金残高の推移に使う。"""
    result = []
    acc = start
    for v in values:
        acc += v
        result.append(acc)
    return result
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_calc.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add backend/app/calc.py backend/tests/test_calc.py
git commit -m "feat(calc): 累計残高の純粋関数 running_total を追加"
```

---

## Task 3: 大型支払いの項目マスタ（`PaymentItem`）とCRUD

**Files:**
- Modify: `backend/app/models.py`（末尾に追加）
- Modify: `backend/app/schemas.py`（末尾に追加）
- Create: `backend/app/routers/cashflow.py`
- Modify: `backend/app/main.py:31-43`
- Modify: `backend/app/db.py`（`_run_migrations` の末尾でシード）
- Create: `backend/tests/test_cashflow.py`

- [ ] **Step 1: テストを作成（失敗させる）**

`backend/tests/test_cashflow.py` を新規作成：

```python
def test_items_seeded_empty_then_create_and_list(client):
    # テストDBは未シード（conftestは create_all のみ）→ 初期は空
    assert client.get("/api/cashflow/items").json() == []
    # 追加
    res = client.post("/api/cashflow/items", json={"name": "消費税"})
    assert res.status_code == 200
    assert res.json()["name"] == "消費税"
    assert res.json()["sort_order"] == 0
    client.post("/api/cashflow/items", json={"name": "社会保険料"})
    items = client.get("/api/cashflow/items").json()
    assert [i["name"] for i in items] == ["消費税", "社会保険料"]


def test_item_rename(client):
    item = client.post("/api/cashflow/items", json={"name": "仮"}).json()
    res = client.patch(f"/api/cashflow/items/{item['id']}", json={"name": "法人税等"})
    assert res.status_code == 200
    assert res.json()["name"] == "法人税等"


def test_item_logical_delete_hides_from_list(client):
    item = client.post("/api/cashflow/items", json={"name": "消す予定"}).json()
    res = client.delete(f"/api/cashflow/items/{item['id']}")
    assert res.status_code == 200
    names = [i["name"] for i in client.get("/api/cashflow/items").json()]
    assert "消す予定" not in names
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_cashflow.py -v`
Expected: FAIL（404 / ルーター未登録）

- [ ] **Step 3: モデルを追加**

`backend/app/models.py` の末尾に追加：

```python
class PaymentItem(SQLModel, table=True):
    """年間の大型支払いの項目マスタ（消費税・社会保険料など）。年度をまたいで共有する。"""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    sort_order: int = 0
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PaymentSchedule(SQLModel, table=True):
    """大型支払いの月別金額。キー＝(項目ID, 対象月 ym)。"""
    item_id: int = Field(primary_key=True)
    ym: str = Field(primary_key=True)        # "YYYY-MM"
    amount: int = 0
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

- [ ] **Step 4: スキーマを追加**

`backend/app/schemas.py` の末尾に追加：

```python
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
```

- [ ] **Step 5: cashflow ルーターを作成（項目CRUDのみ。集計はTask 5で追加）**

`backend/app/routers/cashflow.py` を新規作成：

```python
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import PaymentItem
from app.schemas import PaymentItemIn, PaymentItemUpdate
from app.auth import require_admin

router = APIRouter(prefix="/api/cashflow", tags=["cashflow"],
                   dependencies=[Depends(require_admin)])


@router.get("/items")
def list_items(session: Session = Depends(get_session)):
    rows = session.exec(
        select(PaymentItem).where(PaymentItem.active == True)  # noqa: E712
    ).all()
    return sorted(rows, key=lambda r: (r.sort_order, r.id or 0))


@router.post("/items")
def create_item(data: PaymentItemIn, session: Session = Depends(get_session)):
    existing = session.exec(
        select(PaymentItem).where(PaymentItem.active == True)  # noqa: E712
    ).all()
    next_order = (max((r.sort_order for r in existing), default=-1) + 1) if existing else 0
    row = PaymentItem(name=data.name, sort_order=next_order)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/items/{item_id}")
def update_item(item_id: int, data: PaymentItemUpdate, session: Session = Depends(get_session)):
    row = session.get(PaymentItem, item_id)
    if row is None or not row.active:
        raise HTTPException(status_code=404, detail="項目が見つかりません")
    if data.name is not None:
        row.name = data.name
    if data.sort_order is not None:
        row.sort_order = data.sort_order
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/items/{item_id}")
def delete_item(item_id: int, session: Session = Depends(get_session)):
    row = session.get(PaymentItem, item_id)
    if row is not None:
        row.active = False           # 論理削除（過去の金額は残す）
        session.add(row)
        session.commit()
    return {"id": item_id}
```

- [ ] **Step 6: main.py にルーターを登録**

`backend/app/main.py` の import 行（31-33行目）に `cashflow` を追加：

```python
from app.routers import (
    deals, masters, settings, summary, payments, io_excel, confidence, activity, auth,
    cashflow,
)
```

`app.include_router(activity.router)` の直後に追加：

```python
app.include_router(cashflow.router)
```

- [ ] **Step 7: 本番DB向けシードを追加（テストには影響しない）**

`backend/app/db.py` の `_run_migrations()` の末尾（`ConfidenceRate` 投入ブロックの後）に追加：

```python
    # 大型支払いの定番項目を初期投入（1件も無ければ）
    from app.models import PaymentItem
    default_items = ["消費税", "社会保険料", "労働保険料", "法人税等", "住民税・事業税", "源泉所得税"]
    with Session(engine) as session:
        if not session.exec(select(PaymentItem)).first():
            for i, name in enumerate(default_items):
                session.add(PaymentItem(name=name, sort_order=i))
            session.commit()
```

- [ ] **Step 8: テストが通ることを確認**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_cashflow.py -v`
Expected: PASS（3件）

- [ ] **Step 9: 全テストでリグレッションが無いことを確認**

Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: PASS（全件）

- [ ] **Step 10: コミット**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/routers/cashflow.py backend/app/main.py backend/app/db.py backend/tests/test_cashflow.py
git commit -m "feat(cashflow): 大型支払い項目マスタのCRUDと定番項目シードを追加"
```

---

## Task 4: 月別金額マトリクス（`PaymentSchedule`）の取得・一括保存

**Files:**
- Modify: `backend/app/routers/cashflow.py`（エンドポイント追加）
- Modify: `backend/tests/test_cashflow.py`（テスト追加）

- [ ] **Step 1: テストを追記（失敗させる）**

`backend/tests/test_cashflow.py` の末尾に追記：

```python
def test_schedule_put_then_get_returns_matrix(client):
    tax = client.post("/api/cashflow/items", json={"name": "消費税"}).json()
    res = client.put("/api/cashflow/schedule", params={"fiscal_year": 2026}, json={
        "cells": [
            {"item_id": tax["id"], "ym": "2026-05", "amount": 800000},
            {"item_id": tax["id"], "ym": "2026-11", "amount": 800000},
        ],
    })
    assert res.status_code == 200
    got = client.get("/api/cashflow/schedule", params={"fiscal_year": 2026}).json()
    # item_id -> { ym: amount } の形で返す
    assert got["amounts"][str(tax["id"])]["2026-05"] == 800000
    assert got["amounts"][str(tax["id"])]["2026-11"] == 800000


def test_schedule_put_zero_overwrites_existing(client):
    tax = client.post("/api/cashflow/items", json={"name": "消費税"}).json()
    client.put("/api/cashflow/schedule", params={"fiscal_year": 2026}, json={
        "cells": [{"item_id": tax["id"], "ym": "2026-05", "amount": 800000}],
    })
    client.put("/api/cashflow/schedule", params={"fiscal_year": 2026}, json={
        "cells": [{"item_id": tax["id"], "ym": "2026-05", "amount": 0}],
    })
    got = client.get("/api/cashflow/schedule", params={"fiscal_year": 2026}).json()
    assert got["amounts"].get(str(tax["id"]), {}).get("2026-05", 0) == 0
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_cashflow.py -v`
Expected: FAIL（schedule エンドポイント未実装）

- [ ] **Step 3: schedule エンドポイントを実装**

`backend/app/routers/cashflow.py` の import を次に差し替え：

```python
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import PaymentItem, PaymentSchedule
from app.schemas import PaymentItemIn, PaymentItemUpdate, SchedulePutIn
from app.auth import require_admin
from app import calc
```

ファイル末尾（`delete_item` の後）に追加：

```python
def _fy_yms(fiscal_year: int) -> list[str]:
    """年度(4月→翌3月)の "YYYY-MM" を12個返す。"""
    return [f"{y:04d}-{m:02d}" for y, m in calc.fiscal_months(fiscal_year)]


@router.get("/schedule")
def get_schedule(fiscal_year: int, session: Session = Depends(get_session)):
    yms = set(_fy_yms(fiscal_year))
    rows = session.exec(select(PaymentSchedule)).all()
    amounts: dict[str, dict[str, int]] = {}
    for r in rows:
        if r.ym in yms and r.amount:
            amounts.setdefault(str(r.item_id), {})[r.ym] = r.amount
    return {"fiscal_year": fiscal_year, "amounts": amounts}


@router.put("/schedule")
def put_schedule(fiscal_year: int, data: SchedulePutIn, session: Session = Depends(get_session)):
    for cell in data.cells:
        row = session.get(PaymentSchedule, (cell.item_id, cell.ym))
        if row is None:
            row = PaymentSchedule(item_id=cell.item_id, ym=cell.ym, amount=cell.amount)
        else:
            row.amount = cell.amount
            row.updated_at = datetime.utcnow()
        session.add(row)
    session.commit()
    return {"saved": len(data.cells)}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_cashflow.py -v`
Expected: PASS（既存3件＋新規2件）

- [ ] **Step 5: コミット**

```bash
git add backend/app/routers/cashflow.py backend/tests/test_cashflow.py
git commit -m "feat(cashflow): 大型支払いの月別金額マトリクスの取得・一括保存を追加"
```

---

## Task 5: 資金残高の推移エンドポイント（`GET /api/cashflow`）

**Files:**
- Modify: `backend/app/routers/cashflow.py`（集計エンドポイント追加）
- Modify: `backend/tests/test_cashflow.py`（テスト追加）

**ロジック（12ヶ月＝4月→翌3月の年度順）:**
- 入金: `basis=billing` は `billing` を売上月へ。`basis=paid` は `payment_status=='paid'` かつ `paid_on` 有りの `paid_amount` を入金日の月へ。
- 原価: `direct_cost`（未設定は `instructor_fee`）を売上月へ。
- 固定費: `summary._month_fixed_cost(session, year, month)`。
- 大型支払い: `PaymentSchedule` の月別合計。
- 月次収支[i] = 入金[i] − (大型支払い[i] + 固定費[i] + 原価[i])。
- 累計残高 = `calc.running_total(月次収支, start=期首残高)`。

- [ ] **Step 1: テストを追記（失敗させる）**

`backend/tests/test_cashflow.py` の末尾に追記：

```python
def _deal(tc, **over):
    base = dict(held_on="2026-04-10", client="A社", fee=1000000, instructor_fee=300000)
    base.update(over)
    return tc.post("/api/deals", json=base).json()


def test_cashflow_billing_basis_balance(client):
    # 期首500万・固定費月100万
    client.put("/api/settings/2026", json={"opening_balance": 5000000, "monthly_fixed_cost": 1000000})
    # 4月: 請求 fee100万+税10万=110万、原価30万
    _deal(client, held_on="2026-04-10", fee=1000000, instructor_fee=300000)
    # 大型支払い: 5月に消費税80万
    tax = client.post("/api/cashflow/items", json={"name": "消費税"}).json()
    client.put("/api/cashflow/schedule", params={"fiscal_year": 2026}, json={
        "cells": [{"item_id": tax["id"], "ym": "2026-05", "amount": 800000}],
    })

    res = client.get("/api/cashflow", params={"fiscal_year": 2026, "basis": "billing"})
    assert res.status_code == 200
    b = res.json()
    assert b["labels"][0] == "4月"
    assert b["opening_balance"] == 5000000
    # 4月: 入金110万 / 固定費100万 / 原価30万 / 大型0 → 収支 -20万
    assert b["inflow"][0] == 1100000
    assert b["fixed_cost"][0] == 1000000
    assert b["cost"][0] == 300000
    assert b["big_payment"][0] == 0
    assert b["net"][0] == 1100000 - (1000000 + 300000 + 0)
    # 5月: 入金0 / 固定費100万 / 原価0 / 大型80万 → 収支 -180万
    assert b["big_payment"][1] == 800000
    assert b["net"][1] == 0 - (1000000 + 0 + 800000)
    # 累計残高[1] = 500万 + (-20万) + (-180万) = 300万
    assert b["balance"][0] == 5000000 + b["net"][0]
    assert b["balance"][1] == b["balance"][0] + b["net"][1]


def test_cashflow_paid_basis_uses_paid_on_month(client):
    client.put("/api/settings/2026", json={"opening_balance": 0, "monthly_fixed_cost": 0})
    # 売上は4月、入金は7月
    d = _deal(client, held_on="2026-04-10", fee=1000000, instructor_fee=0,
              payment_status="invoiced")
    client.post(f"/api/deals/{d['id']}/pay", json={"paid_on": "2026-07-20"})

    res = client.get("/api/cashflow", params={"fiscal_year": 2026, "basis": "paid"})
    b = res.json()
    # 4月(index0)には入金が乗らず、7月(index3)に乗る
    assert b["inflow"][0] == 0
    assert b["inflow"][3] == 1100000
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_cashflow.py -v`
Expected: FAIL（`/api/cashflow` 未実装）

- [ ] **Step 3: import を追加（`Setting` と summary のhelper流用）**

`backend/app/routers/cashflow.py` の `from app.models import PaymentItem, PaymentSchedule` を次に変更：

```python
from app.models import PaymentItem, PaymentSchedule, Setting
```

import 群の末尾（`from app import calc` の後）に追記：

```python
from app.routers.summary import (
    _deals_in_fy, _month_fixed_cost, _cost, MONTH_LABELS,
)
```

- [ ] **Step 4: 集計エンドポイントを実装**

`backend/app/routers/cashflow.py` のファイル末尾に追加：

```python
@router.get("")
def cashflow(fiscal_year: int, basis: str = "billing",
             session: Session = Depends(get_session)):
    if basis not in ("billing", "paid"):
        raise HTTPException(status_code=422, detail="basis は billing か paid を指定してください")

    deals = _deals_in_fy(session, fiscal_year)

    # 入金（プラス側）
    if basis == "paid":
        paid_items, undated = [], 0
        for d in deals:
            if d.payment_status == "paid":
                if d.paid_on is not None:
                    paid_items.append((d.paid_on.year, d.paid_on.month, d.paid_amount or 0))
                else:
                    undated += d.paid_amount or 0
        inflow = calc.monthly_buckets(fiscal_year, paid_items)
        undated_inflow = undated
    else:
        inflow = calc.monthly_buckets(
            fiscal_year, [(d.revenue_month.year, d.revenue_month.month, d.billing) for d in deals]
        )
        undated_inflow = 0

    # 原価（売上月）
    cost = calc.monthly_buckets(
        fiscal_year, [(d.revenue_month.year, d.revenue_month.month, _cost(d)) for d in deals]
    )

    # 固定費（月次フォールバック）と 大型支払い（PaymentSchedule）
    fixed_cost, big_payment = [], []
    sched_rows = session.exec(select(PaymentSchedule)).all()
    by_ym: dict[str, int] = {}
    for r in sched_rows:
        by_ym[r.ym] = by_ym.get(r.ym, 0) + r.amount
    for (y, m) in calc.fiscal_months(fiscal_year):
        fixed_cost.append(_month_fixed_cost(session, y, m))
        big_payment.append(by_ym.get(f"{y:04d}-{m:02d}", 0))

    net = [inflow[i] - (big_payment[i] + fixed_cost[i] + cost[i]) for i in range(12)]

    setting = session.get(Setting, fiscal_year)
    opening = setting.opening_balance if setting else 0
    balance = calc.running_total(net, start=opening)

    return {
        "labels": MONTH_LABELS,
        "basis": basis,
        "opening_balance": opening,
        "inflow": inflow,
        "cost": cost,
        "fixed_cost": fixed_cost,
        "big_payment": big_payment,
        "net": net,
        "balance": balance,
        "undated_inflow": undated_inflow,
        "grand_inflow": sum(inflow),
        "grand_outflow": sum(big_payment) + sum(fixed_cost) + sum(cost),
        "ending_balance": balance[-1] if balance else opening,
    }
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_cashflow.py -v`
Expected: PASS（既存5件＋新規2件）

- [ ] **Step 6: 全テストでリグレッションが無いことを確認**

Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: PASS（全件）

- [ ] **Step 7: コミット**

```bash
git add backend/app/routers/cashflow.py backend/tests/test_cashflow.py
git commit -m "feat(cashflow): 資金残高の推移エンドポイント(請求/入金ベース)を追加"
```

---

## Task 6: フロントの型とAPIクライアント

**Files:**
- Modify: `frontend/src/api/types.ts:206`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: 型を追加・拡張**

`frontend/src/api/types.ts` の末尾 `export interface Setting ...` を次に置き換え：

```typescript
export interface Setting { fiscal_year: number; monthly_fixed_cost: number; opening_balance: number; }

export interface PaymentItem { id: number; name: string; sort_order: number; active: boolean; }

// item_id(文字列) -> { ym: amount }
export interface ScheduleMatrix {
  fiscal_year: number;
  amounts: Record<string, Record<string, number>>;
}

export interface CashFlowSummary {
  labels: string[];
  basis: "billing" | "paid";
  opening_balance: number;
  inflow: number[];
  cost: number[];
  fixed_cost: number[];
  big_payment: number[];
  net: number[];
  balance: number[];
  undated_inflow: number;
  grand_inflow: number;
  grand_outflow: number;
  ending_balance: number;
}
```

- [ ] **Step 2: API クライアントに追加**

`frontend/src/api/client.ts` の import（1-6行目）に型を追加：

```typescript
import {
  Deal, DealInput, Master, MasterKind,
  MonthlySummary, AnnualSummary, ByRow, PLSummary, Setting, ConfidenceRate,
  MonthSummary, MonthlyFixedCost, SalesFunnel, SalesActivity, Analysis, AuthUser,
  RecurringSummary, PaymentItem, ScheduleMatrix, CashFlowSummary,
} from "./types";
```

`api` オブジェクト内、`listPayments` の直後に追加：

```typescript
  // ===== 資金繰り（cashflow） =====
  putOpeningBalance: (fy: number, opening_balance: number) =>
    req<Setting>(`/api/settings/${fy}`, { method: "PUT", body: JSON.stringify({ opening_balance }) }),
  listPaymentItems: () => req<PaymentItem[]>(`/api/cashflow/items`),
  createPaymentItem: (name: string) =>
    req<PaymentItem>(`/api/cashflow/items`, { method: "POST", body: JSON.stringify({ name }) }),
  updatePaymentItem: (id: number, name: string) =>
    req<PaymentItem>(`/api/cashflow/items/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deletePaymentItem: (id: number) =>
    req<{ id: number }>(`/api/cashflow/items/${id}`, { method: "DELETE" }),
  getSchedule: (fy: number) => req<ScheduleMatrix>(`/api/cashflow/schedule${qs({ fiscal_year: fy })}`),
  putSchedule: (fy: number, cells: { item_id: number; ym: string; amount: number }[]) =>
    req<{ saved: number }>(`/api/cashflow/schedule${qs({ fiscal_year: fy })}`,
      { method: "PUT", body: JSON.stringify({ cells }) }),
  cashflow: (fy: number, basis: "billing" | "paid") =>
    req<CashFlowSummary>(`/api/cashflow${qs({ fiscal_year: fy, basis })}`),
```

- [ ] **Step 3: 型チェック（ビルド）でエラーが無いことを確認**

Run: `cd frontend && npm run build`
Expected: 成功（型エラー無し）。※この時点ではまだ画面未作成のため、未使用exportの警告は出ない（exportは使用扱い）。

- [ ] **Step 4: コミット**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts
git commit -m "feat(cashflow): フロントの型とAPIクライアントを追加"
```

---

## Task 7: 「資金繰り」ページ本体

**Files:**
- Create: `frontend/src/pages/CashFlow.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx:20-22`（アイコン）, `:47-49`（メニュー）
- Modify: `frontend/src/styles.css`（末尾に追加）

ymヘルパー: 年度の12ヶ月は4月→翌3月。index i の ym は `m = ((3 + i) % 12) + 1`、`y = m >= 4 ? fy : fy + 1`。

- [ ] **Step 1: ページを作成**

`frontend/src/pages/CashFlow.tsx` を新規作成：

```tsx
import { useEffect, useState } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Layout } from "../components/Layout";
import { Loading, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { PaymentItem, CashFlowSummary } from "../api/types";
import { yen, man } from "../lib/format";

// 年度の i 番目（0=4月 … 11=翌3月）の "YYYY-MM" を返す
function ymOf(fy: number, i: number): string {
  const m = ((3 + i) % 12) + 1;
  const y = m >= 4 ? fy : fy + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

const MONTH_LABELS = ["4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月"];

export default function CashFlow() {
  const { fiscalYear } = useFiscalYear();
  const [items, setItems] = useState<PaymentItem[]>([]);
  // grid[itemId][i] = 金額（文字列で保持し、入力中の空欄を許容）
  const [grid, setGrid] = useState<Record<number, string[]>>({});
  const [opening, setOpening] = useState<string>("");
  const [basis, setBasis] = useState<"billing" | "paid">("billing");
  const [cf, setCf] = useState<CashFlowSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingMsg, setSavingMsg] = useState("");

  function loadGrid(its: PaymentItem[], amounts: Record<string, Record<string, number>>) {
    const g: Record<number, string[]> = {};
    its.forEach((it) => {
      g[it.id] = Array.from({ length: 12 }, (_, i) => {
        const v = amounts[String(it.id)]?.[ymOf(fiscalYear, i)] ?? 0;
        return v ? String(v) : "";
      });
    });
    setGrid(g);
  }

  function reload() {
    setError(null);
    Promise.all([
      api.listPaymentItems(),
      api.getSchedule(fiscalYear),
      api.getSetting(fiscalYear),
      api.cashflow(fiscalYear, basis),
    ])
      .then(([its, sched, setting, summary]) => {
        setItems(its);
        loadGrid(its, sched.amounts);
        setOpening(setting.opening_balance ? String(setting.opening_balance) : "");
        setCf(summary);
      })
      .catch((e) => setError((e as Error).message));
  }
  useEffect(reload, [fiscalYear]);

  // basis 切替時は推移だけ取り直す（入力中のgridは保持）
  useEffect(() => {
    api.cashflow(fiscalYear, basis).then(setCf).catch((e) => setError((e as Error).message));
  }, [basis, fiscalYear]);

  const num = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

  function setCell(itemId: number, i: number, value: string) {
    setGrid((prev) => {
      const row = [...(prev[itemId] ?? Array(12).fill(""))];
      row[i] = value;
      return { ...prev, [itemId]: row };
    });
  }

  async function saveOpening() {
    setSavingMsg("保存中…");
    try {
      await api.putOpeningBalance(fiscalYear, num(opening));
      setSavingMsg("期首残高を保存しました");
      const summary = await api.cashflow(fiscalYear, basis);
      setCf(summary);
    } catch (e) { setSavingMsg(""); setError((e as Error).message); }
  }

  async function saveSchedule() {
    setSavingMsg("保存中…");
    try {
      const cells = items.flatMap((it) =>
        (grid[it.id] ?? Array(12).fill("")).map((s, i) => ({
          item_id: it.id, ym: ymOf(fiscalYear, i), amount: num(s),
        })),
      );
      await api.putSchedule(fiscalYear, cells);
      setSavingMsg("大型支払いを保存しました");
      const summary = await api.cashflow(fiscalYear, basis);
      setCf(summary);
    } catch (e) { setSavingMsg(""); setError((e as Error).message); }
  }

  async function addItem() {
    const name = window.prompt("追加する項目名を入力してください（例: 法人税）");
    if (!name) return;
    try { await api.createPaymentItem(name.trim()); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function renameItem(it: PaymentItem) {
    const name = window.prompt("項目名を変更", it.name);
    if (!name || name.trim() === it.name) return;
    try { await api.updatePaymentItem(it.id, name.trim()); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function removeItem(it: PaymentItem) {
    const hasAmount = (grid[it.id] ?? []).some((s) => num(s) > 0);
    const msg = hasAmount
      ? `「${it.name}」には金額が入力されています。削除しますか？（推移には反映されなくなります）`
      : `「${it.name}」を削除しますか？`;
    if (!window.confirm(msg)) return;
    try { await api.deletePaymentItem(it.id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  if (error) return <Layout title="資金繰り"><ErrorState message={error} /></Layout>;
  if (!cf) return <Layout title="資金繰り"><Loading /></Layout>;

  const colTotal = (i: number) => items.reduce((s, it) => s + num((grid[it.id] ?? [])[i] ?? ""), 0);
  const rowTotal = (itemId: number) => (grid[itemId] ?? []).reduce((s, v) => s + num(v), 0);
  const grand = items.reduce((s, it) => s + rowTotal(it.id), 0);

  const chartData = MONTH_LABELS.map((l, i) => ({
    name: l, 累計残高: cf.balance[i], 大型支払い: cf.big_payment[i],
  }));

  return (
    <Layout title="資金繰り">
      {/* 期首残高 */}
      <div className="panel" style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 20 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>期首残高（年度開始時点の手元資金）</label>
          <input type="text" inputMode="numeric" style={{ fontSize: 13 }}
            value={opening ? Number(num(opening)).toLocaleString("ja-JP") : ""}
            onChange={(e) => setOpening(e.target.value)} placeholder="0" />
        </div>
        <button className="btn" onClick={saveOpening}>期首残高を保存</button>
        <span className="hint">{savingMsg}</span>
      </div>

      {/* 大型支払い表 */}
      <div className="panel matrix flush">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px" }}>
          <h3 style={{ margin: 0 }}>年間の大型支払い（税・社会保険など）</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sub sm" onClick={addItem}>＋ 項目を追加</button>
            <button className="btn" onClick={saveSchedule}>まとめて保存</button>
          </div>
        </div>
        <table className="cashflow-table">
          <thead>
            <tr>
              <th style={{ whiteSpace: "nowrap" }}>項目</th>
              {MONTH_LABELS.map((l) => <th key={l} className="num">{l}</th>)}
              <th className="num">合計</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {it.name}
                  <span className="row-actions">
                    <button className="link-btn" title="名称変更" onClick={() => renameItem(it)}>✎</button>
                    <button className="link-btn danger" title="削除" onClick={() => removeItem(it)}>🗑</button>
                  </span>
                </td>
                {Array.from({ length: 12 }, (_, i) => (
                  <td key={i} className="num">
                    <input className="cell-input" type="text" inputMode="numeric"
                      value={(grid[it.id] ?? [])[i] ? Number(num((grid[it.id] ?? [])[i])).toLocaleString("ja-JP") : ""}
                      onChange={(e) => setCell(it.id, i, e.target.value)} placeholder="—" />
                  </td>
                ))}
                <td className="num"><strong>{yen(rowTotal(it.id))}</strong></td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={14} className="hint" style={{ padding: 16 }}>
                項目がありません。「＋ 項目を追加」で消費税・社会保険料などを登録してください。
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>月計</th>
              {Array.from({ length: 12 }, (_, i) => <th key={i} className="num">{yen(colTotal(i))}</th>)}
              <th className="num">{yen(grand)}</th>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 資金残高の推移 */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>資金残高の推移</h3>
          <div className="seg">
            <button className={basis === "billing" ? "active" : ""} onClick={() => setBasis("billing")}>請求ベース</button>
            <button className={basis === "paid" ? "active" : ""} onClick={() => setBasis("paid")}>入金ベース</button>
          </div>
        </div>
        <div className="hint" style={{ marginBottom: 10, fontSize: 11 }}>
          残高 = 期首残高 ＋ 各月の（入金 − 大型支払い − 固定費 − 原価）の累計。
          固定費・原価は支払時期データが無いため売上月で概算。
          {cf.undated_inflow > 0 && `　※入金日未入力の入金 ${yen(cf.undated_inflow)} は推移に未反映。`}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} padding={{ left: 12, right: 12 }} />
            <YAxis tickFormatter={man} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => yen(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 2" />
            <Bar dataKey="大型支払い" fill="#f59e0b" />
            <Line dataKey="累計残高" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 内訳テーブル */}
      <div className="panel matrix flush">
        <table className="cashflow-table">
          <thead>
            <tr><th>　</th>{MONTH_LABELS.map((l) => <th key={l} className="num">{l}</th>)}</tr>
          </thead>
          <tbody>
            <tr><td>入金(+)</td>{cf.inflow.map((v, i) => <td key={i} className="num">{v ? yen(v) : "—"}</td>)}</tr>
            <tr><td>固定費(−)</td>{cf.fixed_cost.map((v, i) => <td key={i} className="num">{v ? yen(v) : "—"}</td>)}</tr>
            <tr><td>原価(−)</td>{cf.cost.map((v, i) => <td key={i} className="num">{v ? yen(v) : "—"}</td>)}</tr>
            <tr><td>大型支払(−)</td>{cf.big_payment.map((v, i) => (
              <td key={i} className="num" style={{ color: v ? "var(--danger)" : undefined }}>{v ? yen(v) : "—"}</td>
            ))}</tr>
            <tr><td>月次収支</td>{cf.net.map((v, i) => (
              <td key={i} className="num" style={{ color: v < 0 ? "var(--danger)" : "var(--ok)" }}>{yen(v)}</td>
            ))}</tr>
            <tr><td><strong>累計残高</strong></td>{cf.balance.map((v, i) => (
              <td key={i} className="num"><strong style={{ color: v < 0 ? "var(--danger)" : undefined }}>{yen(v)}</strong></td>
            ))}</tr>
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: ルートを追加**

`frontend/src/App.tsx` の import に追加（`import Payments ...` の下あたり）：

```tsx
import CashFlow from "./pages/CashFlow";
```

`<Route path="/payments" ... />` の直後に追加：

```tsx
      <Route path="/cashflow" element={guard(<CashFlow />)} />
```

- [ ] **Step 3: メニューにアイコンと項目を追加**

`frontend/src/components/Layout.tsx` の `Icon` の `p` 定義（payments の行の後、22行目付近）に追加：

```tsx
    cash: <><path d="M3 6h18v12H3z" /><circle cx="12" cy="12" r="2.5" /><path d="M7 9v6M17 9v6" /></>,
```

`{ title: "入金", items: [...] }` グループ（47-49行目）を次に置き換え：

```tsx
  { title: "入金", items: [
    { to: "/payments", label: "入金管理", icon: "payments" },
    { to: "/cashflow", label: "資金繰り", icon: "cash" },
  ] },
```

- [ ] **Step 4: スタイルを追加**

`frontend/src/styles.css` の末尾に追加：

```css
/* ===== 資金繰り（cashflow） ===== */
.cashflow-table .cell-input {
  width: 100%; min-width: 70px; text-align: right; border: 1px solid transparent;
  background: transparent; padding: 4px 6px; font-size: 13px; border-radius: 4px;
}
.cashflow-table .cell-input:hover { border-color: var(--border, #e2e8f0); }
.cashflow-table .cell-input:focus { border-color: #2563eb; background: #fff; outline: none; }
.cashflow-table .row-actions { margin-left: 8px; white-space: nowrap; }
.link-btn {
  border: none; background: none; cursor: pointer; font-size: 12px; padding: 2px 4px;
  opacity: 0.55;
}
.link-btn:hover { opacity: 1; }
.link-btn.danger:hover { color: var(--danger, #dc2626); }
.seg { display: inline-flex; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; overflow: hidden; }
.seg button { border: none; background: #fff; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.seg button.active { background: #2563eb; color: #fff; }
```

> **注:** `--border` 等のCSS変数が未定義でもフォールバック値を併記済み。既存の `--danger`/`--ok` は AnnualMatrix で使用実績あり。

- [ ] **Step 5: ビルドして型・構文エラーが無いことを確認**

Run: `cd frontend && npm run build`
Expected: 成功（型エラー・未使用import無し）

- [ ] **Step 6: 手動確認（任意・推奨）**

Run: バックエンド起動 `cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload`、フロント `cd frontend && npm run dev`。
確認: `/cashflow` を開く → 期首残高を保存 → 項目追加 → セルに金額入力 →「まとめて保存」→ 推移グラフと内訳表が更新される。請求/入金ベースのトグルが切り替わる。

- [ ] **Step 7: コミット**

```bash
git add frontend/src/pages/CashFlow.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx frontend/src/styles.css
git commit -m "feat(cashflow): 資金繰りページ（大型支払い入力＋資金残高推移）を追加"
```

---

## 完了条件（受け入れ）

- [ ] `cd backend && .venv/Scripts/python -m pytest -q` が全件PASS
- [ ] `cd frontend && npm run build` が成功
- [ ] `/cashflow` で：期首残高を年度ごとに保存できる
- [ ] 大型支払いの項目を追加・名称変更・削除でき、月別金額を保存できる
- [ ] 資金残高の推移が「請求ベース／入金ベース」で切替表示され、累計残高マイナス月が赤字になる
- [ ] 既存画面（損益・年間売上管理表など）が従来通り動作する（`Setting` の固定費保存が壊れていない）

## 非対象（YAGNI）

- 消費税額などの自動計算（金額は手入力）
- 銀行残高連携・入出金明細取込
- 原価・固定費の実際の支払時期管理（売上月/月次で概算）
- 項目の並び替えUI（API（`sort_order` PATCH）は用意。ドラッグ並び替えUIは将来）
