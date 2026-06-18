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
