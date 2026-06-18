import {
  Deal, DealInput, Master, MasterKind,
  MonthlySummary, AnnualSummary, ByRow, PLSummary, Setting, ConfidenceRate,
  MonthSummary, MonthlyFixedCost, SalesFunnel, SalesActivity, Analysis,
} from "./types";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
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
  updateMaster: (kind: MasterKind, id: number, name: string, active: boolean, agency?: string | null) =>
    req<Master>(`/api/masters/${kind}/${id}`, { method: "PUT", body: JSON.stringify({ name, active, agency }) }),
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
  getSalesActivity: (ym: string) => req<SalesActivity>(`/api/sales-activity/${ym}`),
  putSalesActivity: (ym: string, inquiries: number, first_meetings: number, memo?: string | null) =>
    req<SalesActivity>(`/api/sales-activity/${ym}`,
      { method: "PUT", body: JSON.stringify({ inquiries, first_meetings, memo }) }),

  exportUrl: (fy: number) => `/api/export/excel?fiscal_year=${fy}`,
  importExcel: async (file: File, wipe: boolean) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/import/excel?wipe=${wipe}`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(`取り込みに失敗しました (${res.status})`);
    return res.json() as Promise<{ imported: number }>;
  },
};
