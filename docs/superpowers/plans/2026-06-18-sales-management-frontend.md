# 研修売上管理システム フロントエンド 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** バックエンドAPI（計画A）を利用し、ダッシュボード・案件一覧/登録・年間売上管理表・軸別集計・損益分岐点(BEP)・入金管理・マスタ管理・Excel連携の8画面を React で実装する。

**Architecture:** React + TypeScript + Vite。`api/client.ts` にAPI呼び出しを集約し、`api/types.ts` に型、`lib/` に整形・計算ヘルパ。画面は `pages/` に1ファイル1画面。年度切替はContextで全画面共有。グラフは Recharts。開発時は Vite プロキシで `/api` をバックエンド(8000)へ転送。

**Tech Stack:** React 18, TypeScript, Vite, react-router-dom v6, recharts, vitest（ヘルパのテスト）

前提: 計画A（バックエンド）が `http://localhost:8000` で動作していること。
設計書: `docs/superpowers/specs/2026-06-18-sales-management-design.md`

---

## ファイル構成

```
accounting/frontend/
  package.json / vite.config.ts / tsconfig.json / index.html
  src/
    main.tsx                      # ルート描画 + Router
    App.tsx                       # ルーティング定義
    styles.css                    # 全体スタイル
    context/FiscalYearContext.tsx # 年度の共有状態
    api/types.ts                  # APIレスポンス型
    api/client.ts                 # fetchラッパ + 各API関数
    lib/format.ts                 # 通貨/パーセント/日付整形
    lib/calc.ts                   # 入力プレビュー用 税/請求額計算
    lib/calc.test.ts              # calc のテスト(vitest)
    components/Layout.tsx         # サイドメニュー + 年度セレクタ + 状態表示
    components/Card.tsx           # KPIカード
    components/States.tsx         # Loading/Empty/Error 表示
    pages/Dashboard.tsx
    pages/Deals.tsx
    pages/DealForm.tsx
    pages/AnnualMatrix.tsx
    pages/SummaryBy.tsx
    pages/ProfitLoss.tsx
    pages/Payments.tsx
    pages/Masters.tsx
    pages/ImportExport.tsx
```

**UI方針（CLAUDE.md 8章）:** 主CTAは1つ、loading/empty/error を必ず表示、エラーは原因＋対処、日本語業務用語。

---

## Task 1: Vite雛形・依存・プロキシ・ルーティング・年度Context

**Files:**
- Create: `accounting/frontend/package.json`
- Create: `accounting/frontend/vite.config.ts`
- Create: `accounting/frontend/tsconfig.json`
- Create: `accounting/frontend/index.html`
- Create: `accounting/frontend/src/main.tsx`
- Create: `accounting/frontend/src/App.tsx`
- Create: `accounting/frontend/src/styles.css`
- Create: `accounting/frontend/src/context/FiscalYearContext.tsx`

- [ ] **Step 1: プロジェクト作成と依存インストール**

Run (PowerShell, `accounting/frontend` で):
```powershell
npm create vite@latest . -- --template react-ts
npm install
npm install react-router-dom recharts
npm install -D vitest
```
注: `npm create vite` が既存ファイルを尋ねたら「current directory」を選ぶ。生成された `src/App.css`, `src/index.css`, `src/assets` は不要なら後で削除する。

- [ ] **Step 2: `vite.config.ts` を上書き（APIプロキシ + vitest設定）**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: `index.html` を上書き**

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>研修売上管理</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: `src/context/FiscalYearContext.tsx` を作成**

```tsx
import { createContext, useContext, useState, ReactNode } from "react";

type Ctx = { fiscalYear: number; setFiscalYear: (y: number) => void };
const FiscalYearContext = createContext<Ctx | null>(null);

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const [fiscalYear, setFiscalYear] = useState(2026);
  return (
    <FiscalYearContext.Provider value={{ fiscalYear, setFiscalYear }}>
      {children}
    </FiscalYearContext.Provider>
  );
}

export function useFiscalYear() {
  const ctx = useContext(FiscalYearContext);
  if (!ctx) throw new Error("useFiscalYear must be used within FiscalYearProvider");
  return ctx;
}
```

- [ ] **Step 5: `src/styles.css` を作成**

```css
:root {
  --bg: #f5f6f8; --panel: #fff; --border: #e3e6ea; --text: #1f2933;
  --muted: #6b7280; --primary: #2563eb; --primary-d: #1d4ed8;
  --ok: #16a34a; --warn: #d97706; --danger: #dc2626;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif;
  background: var(--bg); color: var(--text); }
a { color: inherit; text-decoration: none; }
.app { display: flex; min-height: 100vh; }
.side { width: 220px; background: #0f172a; color: #cbd5e1; padding: 16px 0; }
.side h1 { font-size: 15px; color: #fff; padding: 0 18px 12px; margin: 0; }
.side nav a { display: block; padding: 10px 18px; font-size: 14px; }
.side nav a.active, .side nav a:hover { background: #1e293b; color: #fff; }
.main { flex: 1; padding: 20px 28px; }
.topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.topbar h2 { margin: 0; font-size: 20px; }
select, input, textarea { font: inherit; padding: 8px 10px; border: 1px solid var(--border);
  border-radius: 8px; background: #fff; }
.btn { background: var(--primary); color: #fff; border: none; border-radius: 8px;
  padding: 9px 16px; font-size: 14px; cursor: pointer; }
.btn:hover { background: var(--primary-d); }
.btn.sub { background: #fff; color: var(--text); border: 1px solid var(--border); }
.btn.sm { padding: 5px 10px; font-size: 13px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.card .label { color: var(--muted); font-size: 13px; }
.card .value { font-size: 22px; font-weight: 700; margin-top: 6px; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
  padding: 16px; margin-top: 18px; }
.panel h3 { margin: 0 0 12px; font-size: 15px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
th { color: var(--muted); font-weight: 600; }
td.num, th.num { text-align: right; }
.badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; }
.badge.unpaid { background: #fef3c7; color: var(--warn); }
.badge.paid { background: #dcfce7; color: var(--ok); }
.state { padding: 40px; text-align: center; color: var(--muted); }
.err { color: var(--danger); }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.field label { font-size: 13px; color: var(--muted); }
.field .hint { font-size: 12px; color: var(--muted); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.req::after { content: " *"; color: var(--danger); }
.matrix { overflow-x: auto; }
```

- [ ] **Step 6: `src/main.tsx` を上書き**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { FiscalYearProvider } from "./context/FiscalYearContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <FiscalYearProvider>
        <App />
      </FiscalYearProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 7: `src/App.tsx` を上書き（ルーティング。各ページは仮置き）**

```tsx
import { Routes, Route, Navigate } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<div className="main">ダッシュボード（準備中）</div>} />
    </Routes>
  );
}
```

- [ ] **Step 8: 起動確認**

Run: `npm run dev`
Expected: `http://localhost:5173/` が `/dashboard` にリダイレクトし「ダッシュボード（準備中）」が表示。確認後 Ctrl+C。

- [ ] **Step 9: コミット**

```bash
git add accounting/frontend
git commit -m "feat(frontend): Vite雛形/ルーティング/年度Context/基本スタイル"
```

---

## Task 2: 整形・計算ヘルパ（TDD）

**Files:**
- Create: `accounting/frontend/src/lib/format.ts`
- Create: `accounting/frontend/src/lib/calc.ts`
- Test: `accounting/frontend/src/lib/calc.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`accounting/frontend/src/lib/calc.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { previewTax, previewBilling } from "./calc";

describe("calc preview", () => {
  it("税は研修費用の10%(切り捨て)", () => {
    expect(previewTax(450000)).toBe(45000);
    expect(previewTax(92600)).toBe(9260);
  });
  it("請求額は税抜合計+税", () => {
    expect(previewBilling(300000, 50000, 0, 30000)).toBe(380000);
  });
});
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run (`accounting/frontend` で): `npx vitest run`
Expected: FAIL（`Cannot find module './calc'`）

- [ ] **Step 3: `src/lib/calc.ts` を実装**

```ts
export function previewTax(fee: number): number {
  return Math.floor((fee * 10) / 100);
}

export function previewBilling(
  fee: number, transport: number, other: number, tax: number
): number {
  return fee + transport + other + tax;
}
```

- [ ] **Step 4: `src/lib/format.ts` を実装**

```ts
export function yen(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export function pct(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined) return "—";
  return (ratio * 100).toFixed(digits) + "%";
}

export function ymd(s: string | null | undefined): string {
  if (!s) return "—";
  return s; // APIは YYYY-MM-DD で返す
}
```

- [ ] **Step 5: テスト実行して成功を確認**

Run: `npx vitest run`
Expected: PASS（2件）

- [ ] **Step 6: コミット**

```bash
git add accounting/frontend/src/lib
git commit -m "feat(frontend): 整形/計算プレビューヘルパ(テスト付)"
```

---

## Task 3: API型とクライアント

**Files:**
- Create: `accounting/frontend/src/api/types.ts`
- Create: `accounting/frontend/src/api/client.ts`

- [ ] **Step 1: `src/api/types.ts` を作成**

```ts
export interface Deal {
  id: number;
  fiscal_year: number;
  revenue_month: string;
  held_on: string;
  agency: string | null;
  client: string;
  training_name: string | null;
  instructor: string | null;
  fee: number;
  transport: number;
  other: number;
  tax: number;
  billing: number;
  instructor_fee: number;
  payment_due: string | null;
  payment_status: "unpaid" | "paid";
  paid_on: string | null;
  support_staff: string | null;
  note: string | null;
}

export interface DealInput {
  held_on: string;
  client: string;
  revenue_month?: string | null;
  agency?: string | null;
  training_name?: string | null;
  instructor?: string | null;
  fee: number;
  transport: number;
  other: number;
  tax?: number | null;
  billing?: number | null;
  instructor_fee: number;
  payment_due?: string | null;
  support_staff?: string | null;
  note?: string | null;
}

export interface Master { id: number; name: string; active: boolean; }
export type MasterKind = "clients" | "instructors" | "agencies";

export interface MonthlySummary {
  labels: string[];
  current: number[];
  prev: (number | null)[];
  total: number;
}

export interface AnnualRow { client: string; months: number[]; total: number; }
export interface AnnualSummary {
  labels: string[];
  rows: AnnualRow[];
  month_totals: number[];
  grand_total: number;
}

export interface ByRow { name: string; amount: number; instructor_fee: number; share: number; }

export interface TopClient { name: string; amount: number; share: number; }
export interface PLSummary {
  net_sales: number;
  variable: number;
  annual_fixed: number;
  contribution_margin: number;
  cm_ratio: number;
  bep: number;
  operating_profit: number;
  safety_margin_ratio: number;
  bep_achievement: number;
  monthly_labels: string[];
  monthly_net: number[];
  monthly_variable: number[];
  gross_margin_rate: number[];
  cum_net: number[];
  cum_total_cost: number[];
  top_clients: TopClient[];
}

export interface Setting { fiscal_year: number; monthly_fixed_cost: number; }
```

- [ ] **Step 2: `src/api/client.ts` を作成**

```ts
import {
  Deal, DealInput, Master, MasterKind,
  MonthlySummary, AnnualSummary, ByRow, PLSummary, Setting,
} from "./types";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = `エラー (${res.status})`;
    try { const b = await res.json(); if (b.detail) detail = b.detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface DealFilter {
  fiscal_year?: number; month?: number; client?: string;
  instructor?: string; agency?: string; payment_status?: string; q?: string;
}

function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : "";
}

export const api = {
  listDeals: (f: DealFilter) => req<Deal[]>(`/api/deals${qs(f)}`),
  getDeal: (id: number) => req<Deal>(`/api/deals/${id}`),
  createDeal: (d: DealInput) => req<Deal>("/api/deals", { method: "POST", body: JSON.stringify(d) }),
  updateDeal: (id: number, d: DealInput) =>
    req<Deal>(`/api/deals/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteDeal: (id: number) => req<void>(`/api/deals/${id}`, { method: "DELETE" }),
  markPaid: (id: number, paid_on?: string) =>
    req<Deal>(`/api/deals/${id}/pay`, { method: "POST", body: JSON.stringify({ paid_on }) }),

  listMasters: (kind: MasterKind) => req<Master[]>(`/api/masters/${kind}`),
  createMaster: (kind: MasterKind, name: string) =>
    req<Master>(`/api/masters/${kind}`, { method: "POST", body: JSON.stringify({ name }) }),
  updateMaster: (kind: MasterKind, id: number, name: string, active: boolean) =>
    req<Master>(`/api/masters/${kind}/${id}`, { method: "PUT", body: JSON.stringify({ name, active }) }),
  deleteMaster: (kind: MasterKind, id: number) =>
    req<void>(`/api/masters/${kind}/${id}`, { method: "DELETE" }),

  monthly: (fy: number) => req<MonthlySummary>(`/api/summary/monthly${qs({ fiscal_year: fy })}`),
  annual: (fy: number) => req<AnnualSummary>(`/api/summary/annual${qs({ fiscal_year: fy })}`),
  by: (dim: string, frm: string, to: string) =>
    req<ByRow[]>(`/api/summary/by${qs({ dim, frm, to })}`),
  pl: (fy: number) => req<PLSummary>(`/api/summary/pl${qs({ fiscal_year: fy })}`),

  getSetting: (fy: number) => req<Setting>(`/api/settings/${fy}`),
  putSetting: (fy: number, monthly_fixed_cost: number) =>
    req<Setting>(`/api/settings/${fy}`, { method: "PUT", body: JSON.stringify({ monthly_fixed_cost }) }),

  listPayments: (status: string, fy: number) =>
    req<Deal[]>(`/api/payments${qs({ status, fiscal_year: fy })}`),

  exportUrl: (fy: number) => `/api/export/excel?fiscal_year=${fy}`,
  importExcel: async (file: File, wipe: boolean) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/import/excel?wipe=${wipe}`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(`取り込みに失敗しました (${res.status})`);
    return res.json() as Promise<{ imported: number }>;
  },
};
```

- [ ] **Step 3: 型エラーがないか確認**

Run (`accounting/frontend` で): `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add accounting/frontend/src/api
git commit -m "feat(frontend): API型とクライアント"
```

---

## Task 4: 共通コンポーネント（Layout / Card / States）

**Files:**
- Create: `accounting/frontend/src/components/States.tsx`
- Create: `accounting/frontend/src/components/Card.tsx`
- Create: `accounting/frontend/src/components/Layout.tsx`
- Modify: `accounting/frontend/src/App.tsx`

- [ ] **Step 1: `src/components/States.tsx` を作成**

```tsx
export function Loading({ label = "読み込み中…" }: { label?: string }) {
  return <div className="state">{label}</div>;
}
export function Empty({ label = "データがありません" }: { label?: string }) {
  return <div className="state">{label}</div>;
}
export function ErrorState({ message }: { message: string }) {
  return <div className="state err">エラー: {message}</div>;
}
```

- [ ] **Step 2: `src/components/Card.tsx` を作成**

```tsx
export function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="label">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 3: `src/components/Layout.tsx` を作成**

```tsx
import { NavLink } from "react-router-dom";
import { ReactNode } from "react";
import { useFiscalYear } from "../context/FiscalYearContext";

const MENU = [
  { to: "/dashboard", label: "ダッシュボード" },
  { to: "/deals", label: "案件一覧" },
  { to: "/annual", label: "年間売上管理表" },
  { to: "/summary", label: "軸別集計" },
  { to: "/pl", label: "損益・損益分岐点" },
  { to: "/payments", label: "入金管理" },
  { to: "/masters", label: "マスタ管理" },
  { to: "/io", label: "Excel連携" },
];

const YEARS = [2025, 2026, 2027, 2028];

export function Layout({ title, children, actions }: {
  title: string; children: ReactNode; actions?: ReactNode;
}) {
  const { fiscalYear, setFiscalYear } = useFiscalYear();
  return (
    <div className="app">
      <aside className="side">
        <h1>研修売上管理</h1>
        <nav>
          {MENU.map((m) => (
            <NavLink key={m.to} to={m.to}
              className={({ isActive }) => (isActive ? "active" : "")}>
              {m.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <h2>{title}</h2>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {actions}
            <select value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))}>
              {YEARS.map((y) => <option key={y} value={y}>{y}年度</option>)}
            </select>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: `src/App.tsx` を更新（Layout適用のダッシュボード仮置き）**

```tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Layout title="ダッシュボード">準備中</Layout>} />
    </Routes>
  );
}
```

- [ ] **Step 5: 表示確認**

Run: `npm run dev`
Expected: 左サイドメニューと右上の年度セレクタが表示される。確認後 Ctrl+C。

- [ ] **Step 6: コミット**

```bash
git add accounting/frontend/src/components accounting/frontend/src/App.tsx
git commit -m "feat(frontend): 共通レイアウト/カード/状態表示"
```

---

## Task 5: 案件登録/編集フォーム

**Files:**
- Create: `accounting/frontend/src/pages/DealForm.tsx`
- Modify: `accounting/frontend/src/App.tsx`

- [ ] **Step 1: `src/pages/DealForm.tsx` を作成**

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { ErrorState, Loading } from "../components/States";
import { api } from "../api/client";
import { DealInput, Master, MasterKind } from "../api/types";
import { previewTax, previewBilling } from "../lib/calc";
import { yen } from "../lib/format";

const EMPTY: DealInput = {
  held_on: "", client: "", agency: "", training_name: "", instructor: "",
  fee: 0, transport: 0, other: 0, tax: null, billing: null,
  instructor_fee: 0, payment_due: "", support_staff: "", note: "",
};

function MasterField({ kind, label, value, onChange, options, required }: {
  kind: MasterKind; label: string; value: string;
  onChange: (v: string) => void; options: Master[]; required?: boolean;
}) {
  return (
    <div className="field">
      <label className={required ? "req" : ""}>{label}</label>
      <input list={`list-${kind}`} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="選択または入力" />
      <datalist id={`list-${kind}`}>
        {options.map((o) => <option key={o.id} value={o.name} />)}
      </datalist>
    </div>
  );
}

export default function DealForm() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const [form, setForm] = useState<DealInput>(EMPTY);
  const [clients, setClients] = useState<Master[]>([]);
  const [instructors, setInstructors] = useState<Master[]>([]);
  const [agencies, setAgencies] = useState<Master[]>([]);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listMasters("clients").then(setClients).catch(() => {});
    api.listMasters("instructors").then(setInstructors).catch(() => {});
    api.listMasters("agencies").then(setAgencies).catch(() => {});
    if (editing) {
      api.getDeal(Number(id)).then((d) => {
        setForm({
          held_on: d.held_on, client: d.client, revenue_month: d.revenue_month,
          agency: d.agency ?? "", training_name: d.training_name ?? "",
          instructor: d.instructor ?? "", fee: d.fee, transport: d.transport,
          other: d.other, tax: d.tax, billing: d.billing,
          instructor_fee: d.instructor_fee, payment_due: d.payment_due ?? "",
          support_staff: d.support_staff ?? "", note: d.note ?? "",
        });
      }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    }
  }, [id]);

  const set = (k: keyof DealInput, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const num = (k: keyof DealInput, v: string) => set(k, Number(v) || 0);

  const autoTax = previewTax(form.fee);
  const taxShown = form.tax ?? autoTax;
  const billingShown = form.billing ?? previewBilling(form.fee, form.transport, form.other, taxShown);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.held_on) { setError("実施日を入力してください"); return; }
    if (!form.client.trim()) { setError("企業名を入力してください"); return; }
    setSaving(true); setError(null);
    const payload: DealInput = { ...form };
    try {
      if (editing) await api.updateDeal(Number(id), payload);
      else await api.createDeal(payload);
      navigate("/deals");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout title="案件編集"><Loading /></Layout>;

  return (
    <Layout title={editing ? "案件編集" : "案件登録"}>
      {error && <ErrorState message={error} />}
      <form className="panel" onSubmit={submit}>
        <div className="form-grid">
          <div className="field">
            <label className="req">実施日</label>
            <input type="date" value={form.held_on} onChange={(e) => set("held_on", e.target.value)} />
          </div>
          <MasterField kind="agencies" label="代理店" value={form.agency ?? ""}
            onChange={(v) => set("agency", v)} options={agencies} />
          <MasterField kind="clients" label="企業名" value={form.client} required
            onChange={(v) => set("client", v)} options={clients} />
          <div className="field">
            <label>研修名</label>
            <input value={form.training_name ?? ""} onChange={(e) => set("training_name", e.target.value)} />
          </div>
          <MasterField kind="instructors" label="講師" value={form.instructor ?? ""}
            onChange={(v) => set("instructor", v)} options={instructors} />
          <div className="field">
            <label>サポートスタッフ</label>
            <input value={form.support_staff ?? ""} onChange={(e) => set("support_staff", e.target.value)} />
          </div>
          <div className="field">
            <label>研修費用</label>
            <input type="number" value={form.fee} onChange={(e) => num("fee", e.target.value)} />
          </div>
          <div className="field">
            <label>交通費</label>
            <input type="number" value={form.transport} onChange={(e) => num("transport", e.target.value)} />
          </div>
          <div className="field">
            <label>その他</label>
            <input type="number" value={form.other} onChange={(e) => num("other", e.target.value)} />
          </div>
          <div className="field">
            <label>講師料（変動費）</label>
            <input type="number" value={form.instructor_fee}
              onChange={(e) => num("instructor_fee", e.target.value)} />
          </div>
          <div className="field">
            <label>入金予定日</label>
            <input type="date" value={form.payment_due ?? ""} onChange={(e) => set("payment_due", e.target.value)} />
          </div>
          <div className="field">
            <label>備考</label>
            <input value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
          </div>
        </div>
        <div className="cards" style={{ marginTop: 8 }}>
          <div className="card"><div className="label">消費税(自動)</div><div className="value">{yen(taxShown)}</div></div>
          <div className="card"><div className="label">請求額(自動)</div><div className="value">{yen(billingShown)}</div></div>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
          <button className="btn sub" type="button" onClick={() => navigate("/deals")}>取消</button>
        </div>
      </form>
    </Layout>
  );
}
```

注: 税・請求額は画面では自動プレビューのみ（送信は `tax/billing` を null のままにし、サーバ側で確定）。編集時に手修正値を尊重したい場合の拡張は Phase2。

- [ ] **Step 2: `src/App.tsx` にルート追加**

`import` 群に追加:
```tsx
import DealForm from "./pages/DealForm";
```
`<Routes>` 内に追加:
```tsx
<Route path="/deals/new" element={<DealForm />} />
<Route path="/deals/:id/edit" element={<DealForm />} />
```

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add accounting/frontend/src/pages/DealForm.tsx accounting/frontend/src/App.tsx
git commit -m "feat(frontend): 案件登録/編集フォーム(金額自動プレビュー)"
```

---

## Task 6: 案件一覧

**Files:**
- Create: `accounting/frontend/src/pages/Deals.tsx`
- Modify: `accounting/frontend/src/App.tsx`

- [ ] **Step 1: `src/pages/Deals.tsx` を作成**

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { Deal } from "../api/types";
import { yen } from "../lib/format";

export default function Deals() {
  const { fiscalYear } = useFiscalYear();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  function load() {
    setRows(null); setError(null);
    api.listDeals({ fiscal_year: fiscalYear, payment_status: status || undefined, q: q || undefined })
      .then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, [fiscalYear, status]);

  async function remove(id: number) {
    if (!window.confirm("この案件を削除しますか？")) return;
    await api.deleteDeal(id);
    load();
  }

  return (
    <Layout title="案件一覧"
      actions={<button className="btn" onClick={() => navigate("/deals/new")}>＋ 案件登録</button>}>
      <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input placeholder="企業・研修・講師で検索" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">入金: すべて</option>
          <option value="unpaid">未入金</option>
          <option value="paid">入金済</option>
        </select>
        <button className="btn sub sm" onClick={load}>検索</button>
      </div>
      <div className="panel matrix">
        {error ? <ErrorState message={error} />
          : rows === null ? <Loading />
          : rows.length === 0 ? <Empty />
          : (
          <table>
            <thead>
              <tr>
                <th>売上月</th><th>実施日</th><th>企業名</th><th>研修名</th><th>講師</th>
                <th className="num">研修費用</th><th className="num">請求額</th>
                <th>入金予定</th><th>入金</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{d.revenue_month}</td>
                  <td>{d.held_on}</td>
                  <td>{d.client}</td>
                  <td>{d.training_name ?? "—"}</td>
                  <td>{d.instructor ?? "—"}</td>
                  <td className="num">{yen(d.fee)}</td>
                  <td className="num">{yen(d.billing)}</td>
                  <td>{d.payment_due ?? "—"}</td>
                  <td><span className={`badge ${d.payment_status}`}>
                    {d.payment_status === "paid" ? "入金済" : "未入金"}</span></td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn sub sm" onClick={() => navigate(`/deals/${d.id}/edit`)}>編集</button>
                    <button className="btn sub sm" onClick={() => remove(d.id)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: `src/App.tsx` にルート追加**

`import Deals from "./pages/Deals";` を追加し、`<Route path="/deals" element={<Deals />} />` を追加。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add accounting/frontend/src/pages/Deals.tsx accounting/frontend/src/App.tsx
git commit -m "feat(frontend): 案件一覧(検索/絞り込み/編集/削除)"
```

---

## Task 7: ダッシュボード

**Files:**
- Create: `accounting/frontend/src/pages/Dashboard.tsx`
- Modify: `accounting/frontend/src/App.tsx`

- [ ] **Step 1: `src/pages/Dashboard.tsx` を作成**

```tsx
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Layout } from "../components/Layout";
import { Card } from "../components/Card";
import { Loading, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { MonthlySummary, PLSummary, Deal } from "../api/types";
import { yen, pct } from "../lib/format";

export default function Dashboard() {
  const { fiscalYear } = useFiscalYear();
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [pl, setPl] = useState<PLSummary | null>(null);
  const [unpaid, setUnpaid] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null); setMonthly(null);
    Promise.all([
      api.monthly(fiscalYear),
      api.pl(fiscalYear),
      api.listPayments("unpaid", fiscalYear),
    ]).then(([m, p, u]) => { setMonthly(m); setPl(p); setUnpaid(u); })
      .catch((e) => setError(e.message));
  }, [fiscalYear]);

  if (error) return <Layout title="ダッシュボード"><ErrorState message={error} /></Layout>;
  if (!monthly || !pl || !unpaid) return <Layout title="ダッシュボード"><Loading /></Layout>;

  const chartData = monthly.labels.map((l, i) => ({ name: l, 売上: monthly.current[i] }));
  const unpaidTotal = unpaid.reduce((s, d) => s + d.billing, 0);

  return (
    <Layout title="ダッシュボード">
      <div className="cards">
        <Card label={`${fiscalYear}年度 売上合計(税込)`} value={yen(monthly.total)} />
        <Card label="営業利益" value={yen(pl.operating_profit)} />
        <Card label="BEP達成率" value={pct(pl.bep_achievement)}
          sub={`損益分岐点 ${yen(pl.bep)}`} />
        <Card label="未入金合計" value={yen(unpaidTotal)} sub={`${unpaid.length}件`} />
      </div>
      <div className="panel">
        <h3>月別売上</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => `${v / 10000}万`} />
            <Tooltip formatter={(v: number) => yen(v)} />
            <Bar dataKey="売上" fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <h3>今月以降の入金予定（未入金）</h3>
        {unpaid.length === 0 ? <div className="state">未入金はありません</div> : (
          <table>
            <thead><tr><th>入金予定日</th><th>企業名</th><th className="num">請求額</th></tr></thead>
            <tbody>
              {unpaid.slice(0, 10).map((d) => (
                <tr key={d.id}>
                  <td>{d.payment_due ?? "—"}</td><td>{d.client}</td>
                  <td className="num">{yen(d.billing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: `src/App.tsx` を更新（仮置きを本実装に差し替え）**

`import Dashboard from "./pages/Dashboard";` を追加し、`/dashboard` の element を `<Dashboard />` に変更。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add accounting/frontend/src/pages/Dashboard.tsx accounting/frontend/src/App.tsx
git commit -m "feat(frontend): ダッシュボード(KPI/月別売上グラフ/入金予定)"
```

---

## Task 8: 年間売上管理表

**Files:**
- Create: `accounting/frontend/src/pages/AnnualMatrix.tsx`
- Modify: `accounting/frontend/src/App.tsx`

- [ ] **Step 1: `src/pages/AnnualMatrix.tsx` を作成**

```tsx
import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { AnnualSummary } from "../api/types";
import { yen } from "../lib/format";

export default function AnnualMatrix() {
  const { fiscalYear } = useFiscalYear();
  const [data, setData] = useState<AnnualSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    api.annual(fiscalYear).then(setData).catch((e) => setError(e.message));
  }, [fiscalYear]);

  if (error) return <Layout title="年間売上管理表"><ErrorState message={error} /></Layout>;
  if (!data) return <Layout title="年間売上管理表"><Loading /></Layout>;
  if (data.rows.length === 0) return <Layout title="年間売上管理表"><Empty /></Layout>;

  return (
    <Layout title="年間売上管理表">
      <div className="panel matrix">
        <table>
          <thead>
            <tr>
              <th>企業名</th>
              {data.labels.map((l) => <th key={l} className="num">{l}</th>)}
              <th className="num">合計</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.client}>
                <td>{r.client}</td>
                {r.months.map((m, i) => <td key={i} className="num">{m ? yen(m) : "—"}</td>)}
                <td className="num"><strong>{yen(r.total)}</strong></td>
              </tr>
            ))}
            <tr>
              <td><strong>月計</strong></td>
              {data.month_totals.map((m, i) => <td key={i} className="num"><strong>{yen(m)}</strong></td>)}
              <td className="num"><strong>{yen(data.grand_total)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: `src/App.tsx` にルート追加**

`import AnnualMatrix from "./pages/AnnualMatrix";` と `<Route path="/annual" element={<AnnualMatrix />} />` を追加。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add accounting/frontend/src/pages/AnnualMatrix.tsx accounting/frontend/src/App.tsx
git commit -m "feat(frontend): 年間売上管理表(企業×12ヶ月)"
```

---

## Task 9: 軸別集計

**Files:**
- Create: `accounting/frontend/src/pages/SummaryBy.tsx`
- Modify: `accounting/frontend/src/App.tsx`

- [ ] **Step 1: `src/pages/SummaryBy.tsx` を作成**

```tsx
import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { ByRow } from "../api/types";
import { yen, pct } from "../lib/format";

const DIMS = [
  { key: "instructor", label: "講師別" },
  { key: "agency", label: "代理店別" },
  { key: "client", label: "クライアント別" },
];

export default function SummaryBy() {
  const { fiscalYear } = useFiscalYear();
  const [dim, setDim] = useState("instructor");
  const [rows, setRows] = useState<ByRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const frm = `${fiscalYear}-04-01`;
  const to = `${fiscalYear + 1}-03-31`;

  useEffect(() => {
    setRows(null); setError(null);
    api.by(dim, frm, to).then(setRows).catch((e) => setError(e.message));
  }, [dim, fiscalYear]);

  return (
    <Layout title="軸別集計"
      actions={
        <select value={dim} onChange={(e) => setDim(e.target.value)}>
          {DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      }>
      <div className="panel matrix">
        {error ? <ErrorState message={error} />
          : rows === null ? <Loading />
          : rows.length === 0 ? <Empty />
          : (
          <table>
            <thead>
              <tr>
                <th>{DIMS.find((d) => d.key === dim)?.label}</th>
                <th className="num">売上(税込)</th>
                {dim === "instructor" && <th className="num">講師料</th>}
                <th className="num">シェア率</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num">{yen(r.amount)}</td>
                  {dim === "instructor" && <td className="num">{yen(r.instructor_fee)}</td>}
                  <td className="num">{pct(r.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: `src/App.tsx` にルート追加**

`import SummaryBy from "./pages/SummaryBy";` と `<Route path="/summary" element={<SummaryBy />} />` を追加。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add accounting/frontend/src/pages/SummaryBy.tsx accounting/frontend/src/App.tsx
git commit -m "feat(frontend): 軸別集計(講師/代理店/クライアント)"
```

---

## Task 10: 損益・損益分岐点（BEP）

**Files:**
- Create: `accounting/frontend/src/pages/ProfitLoss.tsx`
- Modify: `accounting/frontend/src/App.tsx`

- [ ] **Step 1: `src/pages/ProfitLoss.tsx` を作成**

```tsx
import { useEffect, useState } from "react";
import {
  ComposedChart, LineChart, Line, Bar, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer,
} from "recharts";
import { Layout } from "../components/Layout";
import { Card } from "../components/Card";
import { Loading, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { PLSummary, MonthlySummary } from "../api/types";
import { yen, pct } from "../lib/format";

// 年間BEP図用: 0 と (現売上 or BEP の大きい方×1.1) の2点で直線を引く
function bepLineData(pl: PLSummary) {
  const maxX = Math.max(pl.net_sales, pl.bep) * 1.1 || 1;
  const pts = [0, maxX];
  return pts.map((x) => ({
    sales: Math.round(x),
    売上線: Math.round(x),
    総費用線: Math.round(pl.annual_fixed + (1 - pl.cm_ratio) * x),
  }));
}

export default function ProfitLoss() {
  const { fiscalYear } = useFiscalYear();
  const [pl, setPl] = useState<PLSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [fixed, setFixed] = useState<number>(0);
  const [savingMsg, setSavingMsg] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setError(null); setPl(null);
    Promise.all([api.pl(fiscalYear), api.monthly(fiscalYear), api.getSetting(fiscalYear)])
      .then(([p, m, s]) => { setPl(p); setMonthly(m); setFixed(s.monthly_fixed_cost); })
      .catch((e) => setError(e.message));
  }
  useEffect(reload, [fiscalYear]);

  async function saveFixed() {
    setSavingMsg("保存中…");
    try { await api.putSetting(fiscalYear, fixed); setSavingMsg("保存しました"); reload(); }
    catch (e) { setSavingMsg(""); setError((e as Error).message); }
  }

  if (error) return <Layout title="損益・損益分岐点"><ErrorState message={error} /></Layout>;
  if (!pl || !monthly) return <Layout title="損益・損益分岐点"><Loading /></Layout>;

  const bepData = bepLineData(pl);
  const cumData = pl.monthly_labels.map((l, i) => ({
    name: l, 累計売上: pl.cum_net[i], 累計総費用: pl.cum_total_cost[i],
  }));
  const yoyData = monthly.labels.map((l, i) => ({
    name: l, 当年度: monthly.current[i], 前年度: monthly.prev[i],
  }));
  const gmData = pl.monthly_labels.map((l, i) => ({
    name: l, 粗利率: Math.round(pl.gross_margin_rate[i] * 1000) / 10,
  }));
  const hasPrev = monthly.prev.some((v) => v !== null);

  return (
    <Layout title="損益・損益分岐点">
      <div className="panel" style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>月額固定費（人件費・家賃など）</label>
          <input type="number" value={fixed} onChange={(e) => setFixed(Number(e.target.value) || 0)} />
          <span className="hint">年間固定費 = 月額 × 12</span>
        </div>
        <button className="btn" onClick={saveFixed}>固定費を保存</button>
        <span className="hint">{savingMsg}</span>
      </div>

      <div className="cards">
        <Card label="売上(税抜)" value={yen(pl.net_sales)} />
        <Card label="変動費(講師料)" value={yen(pl.variable)} />
        <Card label="固定費(年間)" value={yen(pl.annual_fixed)} />
        <Card label="限界利益率" value={pct(pl.cm_ratio)} sub={`限界利益 ${yen(pl.contribution_margin)}`} />
        <Card label="営業利益" value={yen(pl.operating_profit)} />
        <Card label="損益分岐点売上高" value={yen(pl.bep)} />
        <Card label="BEP達成率" value={pct(pl.bep_achievement)} />
        <Card label="安全余裕率" value={pct(pl.safety_margin_ratio)} />
      </div>

      <div className="panel">
        <h3>損益分岐点（年間）</h3>
        {pl.annual_fixed === 0 && <div className="hint">※ 月額固定費が未設定です。上で設定すると損益分岐点が計算されます。</div>}
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={bepData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="sales" tickFormatter={(v) => `${Math.round(v / 10000)}万`} />
            <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}万`} />
            <Tooltip formatter={(v: number) => yen(v)} labelFormatter={(v) => `売上 ${yen(Number(v))}`} />
            <Legend />
            <Line dataKey="売上線" stroke="#2563eb" dot={false} />
            <Line dataKey="総費用線" stroke="#dc2626" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h3>月次累計の黒字転換点</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={cumData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}万`} />
            <Tooltip formatter={(v: number) => yen(v)} />
            <Legend />
            <Line dataKey="累計売上" stroke="#2563eb" />
            <Line dataKey="累計総費用" stroke="#dc2626" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h3>前年同月比</h3>
        {!hasPrev && <div className="hint">※ 前年度（{fiscalYear - 1}年度）データがありません。</div>}
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={yoyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}万`} />
            <Tooltip formatter={(v: number) => yen(v)} />
            <Legend />
            <Bar dataKey="当年度" fill="#2563eb" />
            <Line dataKey="前年度" stroke="#d97706" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h3>粗利率推移</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={gmData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Line dataKey="粗利率" stroke="#16a34a" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel matrix">
        <h3>得意先トップ5</h3>
        <table>
          <thead><tr><th>順位</th><th>企業名</th><th className="num">売上(税抜)</th><th className="num">シェア率</th></tr></thead>
          <tbody>
            {pl.top_clients.map((c, i) => (
              <tr key={c.name}>
                <td>{i + 1}</td><td>{c.name}</td>
                <td className="num">{yen(c.amount)}</td><td className="num">{pct(c.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: `src/App.tsx` にルート追加**

`import ProfitLoss from "./pages/ProfitLoss";` と `<Route path="/pl" element={<ProfitLoss />} />` を追加。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add accounting/frontend/src/pages/ProfitLoss.tsx accounting/frontend/src/App.tsx
git commit -m "feat(frontend): 損益・BEP(BEP図/黒字転換/前年比/粗利率/トップ5)"
```

---

## Task 11: 入金管理

**Files:**
- Create: `accounting/frontend/src/pages/Payments.tsx`
- Modify: `accounting/frontend/src/App.tsx`

- [ ] **Step 1: `src/pages/Payments.tsx` を作成**

```tsx
import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { Deal } from "../api/types";
import { yen } from "../lib/format";

export default function Payments() {
  const { fiscalYear } = useFiscalYear();
  const [status, setStatus] = useState("unpaid");
  const [rows, setRows] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setRows(null); setError(null);
    api.listPayments(status, fiscalYear).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, [status, fiscalYear]);

  async function pay(id: number) {
    await api.markPaid(id);
    load();
  }

  const total = rows?.reduce((s, d) => s + d.billing, 0) ?? 0;

  return (
    <Layout title="入金管理"
      actions={
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="unpaid">未入金</option>
          <option value="paid">入金済</option>
        </select>
      }>
      <div className="cards">
        <div className="card"><div className="label">{status === "unpaid" ? "未入金" : "入金済"} 合計</div>
          <div className="value">{yen(total)}</div>
          <div className="label">{rows?.length ?? 0}件</div></div>
      </div>
      <div className="panel matrix">
        {error ? <ErrorState message={error} />
          : rows === null ? <Loading />
          : rows.length === 0 ? <Empty label="該当する案件はありません" />
          : (
          <table>
            <thead>
              <tr>
                <th>入金予定日</th><th>企業名</th><th>研修名</th>
                <th className="num">請求額</th><th>入金日</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{d.payment_due ?? "—"}</td>
                  <td>{d.client}</td>
                  <td>{d.training_name ?? "—"}</td>
                  <td className="num">{yen(d.billing)}</td>
                  <td>{d.paid_on ?? "—"}</td>
                  <td>{d.payment_status === "unpaid" &&
                    <button className="btn sm" onClick={() => pay(d.id)}>入金済みにする</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: `src/App.tsx` にルート追加**

`import Payments from "./pages/Payments";` と `<Route path="/payments" element={<Payments />} />` を追加。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add accounting/frontend/src/pages/Payments.tsx accounting/frontend/src/App.tsx
git commit -m "feat(frontend): 入金管理(未入金一覧/入金済み化)"
```

---

## Task 12: マスタ管理

**Files:**
- Create: `accounting/frontend/src/pages/Masters.tsx`
- Modify: `accounting/frontend/src/App.tsx`

- [ ] **Step 1: `src/pages/Masters.tsx` を作成**

```tsx
import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { api } from "../api/client";
import { Master, MasterKind } from "../api/types";

const KINDS: { key: MasterKind; label: string }[] = [
  { key: "clients", label: "企業" },
  { key: "instructors", label: "講師" },
  { key: "agencies", label: "代理店" },
];

export default function Masters() {
  const [kind, setKind] = useState<MasterKind>("clients");
  const [rows, setRows] = useState<Master[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  function load() {
    setRows(null); setError(null);
    api.listMasters(kind).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, [kind]);

  async function add() {
    if (!newName.trim()) return;
    try { await api.createMaster(kind, newName.trim()); setNewName(""); load(); }
    catch (e) { setError((e as Error).message); }
  }
  async function rename(m: Master) {
    const name = window.prompt("新しい名称", m.name);
    if (name && name.trim()) { await api.updateMaster(kind, m.id, name.trim(), m.active); load(); }
  }
  async function remove(m: Master) {
    if (window.confirm(`「${m.name}」を削除しますか？`)) { await api.deleteMaster(kind, m.id); load(); }
  }

  return (
    <Layout title="マスタ管理"
      actions={
        <select value={kind} onChange={(e) => setKind(e.target.value as MasterKind)}>
          {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      }>
      <div className="panel" style={{ display: "flex", gap: 10 }}>
        <input placeholder="新規名称を入力" value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn" onClick={add}>＋ 追加</button>
      </div>
      <div className="panel matrix">
        {error ? <ErrorState message={error} />
          : rows === null ? <Loading />
          : rows.length === 0 ? <Empty />
          : (
          <table>
            <thead><tr><th>名称</th><th>状態</th><th></th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.active ? "有効" : "無効"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn sub sm" onClick={() => rename(m)}>名称変更</button>
                    <button className="btn sub sm" onClick={() => remove(m)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: `src/App.tsx` にルート追加**

`import Masters from "./pages/Masters";` と `<Route path="/masters" element={<Masters />} />` を追加。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add accounting/frontend/src/pages/Masters.tsx accounting/frontend/src/App.tsx
git commit -m "feat(frontend): マスタ管理(企業/講師/代理店)"
```

---

## Task 13: Excel連携（取り込み/出力）

**Files:**
- Create: `accounting/frontend/src/pages/ImportExport.tsx`
- Modify: `accounting/frontend/src/App.tsx`

- [ ] **Step 1: `src/pages/ImportExport.tsx` を作成**

```tsx
import { useState } from "react";
import { Layout } from "../components/Layout";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";

export default function ImportExport() {
  const { fiscalYear } = useFiscalYear();
  const [file, setFile] = useState<File | null>(null);
  const [wipe, setWipe] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function doImport() {
    if (!file) { setMsg("ファイルを選択してください"); return; }
    if (wipe && !window.confirm("既存データを全件洗い替えします。よろしいですか？")) return;
    setBusy(true); setMsg("取り込み中…");
    try {
      const r = await api.importExcel(file, wipe);
      setMsg(`取り込み完了: ${r.imported}件`);
    } catch (e) {
      setMsg(`エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Excel連携">
      <div className="panel">
        <h3>取り込み（既存Excel → システム）</h3>
        <p className="hint">「①案件日付別管理」シートを読み込みます。初回は洗い替えを推奨。</p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} />
            既存データを洗い替え
          </label>
          <button className="btn" onClick={doImport} disabled={busy}>取り込む</button>
        </div>
        {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      </div>
      <div className="panel">
        <h3>出力（システム → Excel）</h3>
        <p className="hint">{fiscalYear}年度の案件をExcelで書き出します。</p>
        <a className="btn" href={api.exportUrl(fiscalYear)}>Excelをダウンロード</a>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: `src/App.tsx` にルート追加**

`import ImportExport from "./pages/ImportExport";` と `<Route path="/io" element={<ImportExport />} />` を追加。

- [ ] **Step 3: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add accounting/frontend/src/pages/ImportExport.tsx accounting/frontend/src/App.tsx
git commit -m "feat(frontend): Excel連携(取り込み/出力)"
```

---

## Task 14: 結線確認・README

**Files:**
- Create: `accounting/frontend/README.md`

- [ ] **Step 1: 最終の型チェックとビルド**

Run (`accounting/frontend` で):
```powershell
npx tsc --noEmit
npm run build
```
Expected: 型エラーなし、ビルド成功。

- [ ] **Step 2: バックエンドを起動した状態で全画面の手動確認**

前提: 別シェルでバックエンド起動済み（計画A README参照）、実データ取り込み済み。
Run: `npm run dev` → `http://localhost:5173`
確認:
- ダッシュボード: KPIと月別売上グラフが表示される
- 案件一覧: 79件前後が表示、検索・絞り込みが効く
- 案件登録: 研修費用を入れると消費税・請求額が自動表示、保存で一覧に反映
- 年間売上管理表: 企業×12ヶ月の表と月計・合計
- 軸別集計: 講師/代理店/クライアント切替
- 損益・BEP: 月額固定費を保存するとBEP図・各KPIが更新、黒字転換/前年比/粗利率/トップ5表示
- 入金管理: 未入金一覧、「入金済みにする」で入金済へ移動
- マスタ管理: 追加・名称変更・削除
- Excel連携: 出力でxlsxダウンロード

- [ ] **Step 3: `accounting/frontend/README.md` を作成**

```markdown
# 研修売上管理 フロントエンド

## セットアップ
```powershell
cd accounting/frontend
npm install
```

## 開発起動（先にバックエンドを8000で起動しておく）
```powershell
npm run dev
```
ブラウザ: http://localhost:5173 （`/api` は 8000 のバックエンドへプロキシ）

## 本番ビルド
```powershell
npm run build
```
`dist/` を社内サーバで配信し、`/api` をバックエンドへリバースプロキシする（Phase2）。

## テスト
```powershell
npx vitest run
```
```

- [ ] **Step 4: コミット**

```bash
git add accounting/frontend/README.md
git commit -m "docs(frontend): README追加・結線確認"
```

---

## 自己レビュー結果（spec 対応表）

| spec 要件 | 対応タスク |
|---|---|
| ダッシュボード（年度切替/月別グラフ/年度合計/未入金/BEP達成率/営業利益） | Task1, Task7 |
| 案件一覧（絞り込み/検索/編集導線） | Task6 |
| 案件登録/編集（金額自動プレビュー/マスタ選択＋自由入力） | Task5 |
| 年間売上管理表（企業×12ヶ月＋合計/月計） | Task8 |
| 軸別集計（講師/代理店/クライアント、シェア率） | Task9 |
| 損益・BEP（KPI/年間BEP図/月次累計黒字転換/前年同月比/粗利率推移/得意先トップ5/固定費設定） | Task10 |
| 入金管理（未入金一覧/入金済み化） | Task11 |
| マスタ管理（企業/講師/代理店） | Task12 |
| Excel連携（取り込み/出力） | Task13 |
| UI状態（loading/empty/error）・年度共有・日本語業務用語 | Task1, Task4, 各ページ |

注: マスタ選択＋自由入力は `datalist` で実現（選択肢を出しつつ任意入力可、サーバ側で自動マスタ登録）。前年同月比は前年度データが無い場合は注意書きを表示。
