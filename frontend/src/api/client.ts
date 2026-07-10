import {
  Deal, DealInput, Master, MasterKind,
  MonthlySummary, AnnualSummary, ByRow, PLSummary, Setting, ConfidenceRate,
  MonthSummary, MonthlyFixedCost, SalesFunnel, SalesActivity, Analysis, AuthUser,
  RecurringSummary, PaymentItem, ScheduleMatrix, CashFlowSummary,
} from "./types";

// ===== API接続先 =====
// 同一オリジン配信（ローカル開発・同居デプロイ）では空文字＝相対パスのまま。
// フロントとバックを別ドメインに分ける場合（例: Vercel + Render）は
// ビルド時に VITE_API_BASE="https://xxx.onrender.com" を設定する。
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
const apiUrl = (path: string) => `${API_BASE}${path}`;

// ===== 認証トークン（localStorage） =====
const TOKEN_KEY = "auth_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const t = getToken();
  return t ? { ...base, Authorization: `Bearer ${t}` } : base;
}

// 401（未認証・期限切れ）を共通処理：トークン破棄してログインへ
function handle401(url: string) {
  if (url.includes("/api/auth/login")) return; // ログイン失敗はそのままエラー表示
  clearToken();
  if (!location.pathname.startsWith("/login")) location.href = "/login";
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(url), {
    ...init,
    headers: authHeaders({ "Content-Type": "application/json", ...(init?.headers as Record<string, string> | undefined) }),
  });
  if (res.status === 401) handle401(url);
  if (!res.ok) {
    let detail = `エラー (${res.status})`;
    try {
      const b = await res.json();
      if (typeof b.detail === "string") {
        detail = b.detail;
      } else if (Array.isArray(b.detail)) {
        // FastAPI/Pydantic のバリデーションエラー配列を読みやすく整形
        detail = b.detail
          .map((e: { loc?: (string | number)[]; msg?: string }) =>
            `${e.loc ? e.loc.filter((x) => x !== "body").join(".") + ": " : ""}${e.msg ?? ""}`)
          .join(" / ");
      } else if (b.detail) {
        detail = JSON.stringify(b.detail);
      }
    } catch { /* noop */ }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface DealFilter {
  fiscal_year?: number; month?: number; client?: string;
  instructor?: string; agency?: string; payment_status?: string; q?: string;
  [key: string]: unknown;
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
  // ===== 認証 =====
  login: (username: string, password: string) =>
    req<{ token: string; user: AuthUser }>("/api/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => req<AuthUser>("/api/auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    req<{ ok: boolean }>("/api/auth/change-password",
      { method: "POST", body: JSON.stringify({ current_password, new_password }) }),

  listDeals: (f: DealFilter) => req<Deal[]>(`/api/deals${qs(f)}`),
  getDeal: (id: number) => req<Deal>(`/api/deals/${id}`),
  createDeal: (d: DealInput) => req<Deal>("/api/deals", { method: "POST", body: JSON.stringify(d) }),
  updateDeal: (id: number, d: DealInput) =>
    req<Deal>(`/api/deals/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  deleteDeal: (id: number) => req<void>(`/api/deals/${id}`, { method: "DELETE" }),
  markPaid: (id: number, paid_on?: string) =>
    req<Deal>(`/api/deals/${id}/pay`, { method: "POST", body: JSON.stringify({ paid_on }) }),

  listMasters: (kind: MasterKind) => req<Master[]>(`/api/masters/${kind}`),
  createMaster: (kind: MasterKind, name: string, agency?: string | null) =>
    req<Master>(`/api/masters/${kind}`, { method: "POST", body: JSON.stringify({ name, agency }) }),
  updateMaster: (
    kind: MasterKind, id: number, name: string, active: boolean,
    agency?: string | null, address?: string | null, url?: string | null,
    industry?: string | null,
  ) =>
    req<Master>(`/api/masters/${kind}/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name, active, agency, address, url, industry }),
    }),
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

  listConfidenceRates: () => req<ConfidenceRate[]>(`/api/confidence-rates`),
  updateConfidenceRate: (rank: string, rate: number) =>
    req<ConfidenceRate>(`/api/confidence-rates/${rank}`, { method: "PUT", body: JSON.stringify({ rate }) }),

  monthSummary: (ym: string) => req<MonthSummary>(`/api/summary/month${qs({ ym })}`),
  getMonthlyFixedCost: (ym: string) => req<MonthlyFixedCost>(`/api/settings/monthly-fixed-cost/${ym}`),
  putMonthlyFixedCost: (ym: string, fixed_cost_amount: number, memo?: string | null) =>
    req<MonthlyFixedCost>(`/api/settings/monthly-fixed-cost/${ym}`,
      { method: "PUT", body: JSON.stringify({ fixed_cost_amount, memo }) }),

  analysis: (fy: number) => req<Analysis>(`/api/summary/analysis${qs({ fiscal_year: fy })}`),
  salesFunnel: (ym: string) => req<SalesFunnel>(`/api/summary/sales${qs({ ym })}`),
  recurring: (ym: string) => req<RecurringSummary>(`/api/summary/recurring${qs({ ym })}`),
  skipRecurring: (ym: string, client: string, reason?: string | null) =>
    req<{ ym: string; client: string; reason: string | null }>(
      "/api/summary/recurring/skip",
      { method: "PUT", body: JSON.stringify({ ym, client, reason: reason ?? null }) }),
  unskipRecurring: (ym: string, client: string) =>
    req<{ ym: string; client: string }>(
      `/api/summary/recurring/skip${qs({ ym, client })}`, { method: "DELETE" }),
  getSalesActivity: (ym: string) => req<SalesActivity>(`/api/sales-activity/${ym}`),
  putSalesActivity: (ym: string, inquiries: number, first_meetings: number, memo?: string | null) =>
    req<SalesActivity>(`/api/sales-activity/${ym}`,
      { method: "PUT", body: JSON.stringify({ inquiries, first_meetings, memo }) }),

  exportUrl: (fy: number) => apiUrl(`/api/export/excel?fiscal_year=${fy}`),
  exportExcel: async (fy: number) => {
    const res = await fetch(apiUrl(`/api/export/excel?fiscal_year=${fy}`), { headers: authHeaders() });
    if (res.status === 401) handle401("/api/export/excel");
    if (!res.ok) throw new Error(`出力に失敗しました (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `研修売上管理_${fy}年度.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  importExcel: async (file: File, wipe: boolean) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(apiUrl(`/api/import/excel?wipe=${wipe}`),
      { method: "POST", body: fd, headers: authHeaders() });
    if (res.status === 401) handle401("/api/import/excel");
    if (!res.ok) throw new Error(`取り込みに失敗しました (${res.status})`);
    return res.json() as Promise<{ imported: number }>;
  },
};
