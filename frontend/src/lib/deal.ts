import { Deal, PaymentStatus } from "../api/types";

// ===== 選択肢・ラベル =====
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  uninvoiced: "未請求",
  invoiced: "請求済",
  scheduled: "入金予定",
  partial: "一部入金",
  paid: "入金済",
  overdue: "遅延",
};
export const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = [
  "uninvoiced", "invoiced", "scheduled", "partial", "paid", "overdue",
];

export const PROJECT_STATUS_OPTIONS = [
  "問い合わせ", "初回相談", "提案中", "受注", "実施済", "請求済", "入金済", "失注",
];

export const CUSTOMER_TYPES = ["新規", "既存", "リピート"] as const;
export const CONFIDENCE_RANKS = ["A", "B", "C"] as const;

// ===== 派生計算（DBには持たず算出） =====
/** 売上金額（税抜）= 研修費用 + 交通費 + その他 */
export function salesAmount(d: Deal): number {
  return d.fee + d.transport + d.other;
}
/** 直接原価（未設定なら講師料を使用） */
export function directCost(d: Deal): number {
  return d.direct_cost ?? d.instructor_fee;
}
/** 粗利額 = 売上金額 - 直接原価 */
export function grossProfit(d: Deal): number {
  return salesAmount(d) - directCost(d);
}
/** 粗利率 = 粗利額 ÷ 売上金額 */
export function grossMarginRate(d: Deal): number {
  const s = salesAmount(d);
  return s ? grossProfit(d) / s : 0;
}
/** 営業利益見込み = 粗利額 - 固定費配賦額 */
export function estimatedOperatingProfit(d: Deal): number {
  return grossProfit(d) - (d.allocated_fixed_cost ?? 0);
}
/** 確度加重後見込み売上 = 見込み売上 × 確度掛け率 */
export function weightedForecast(d: Deal, rates: Record<string, number>): number {
  const rate = d.confidence_rank ? rates[d.confidence_rank] ?? 0 : 0;
  return Math.round((d.expected_sales_amount ?? 0) * rate);
}
/** 請求金額（未設定なら billing を使用） */
export function invoiceAmount(d: Deal): number {
  return d.invoice_amount ?? d.billing;
}
/** 未入金額 = 請求金額 - 入金済金額（入金済は0） */
export function unpaidAmount(d: Deal): number {
  if (d.payment_status === "paid") return 0;
  return Math.max(0, invoiceAmount(d) - (d.paid_amount ?? 0));
}

// ===== 入金アラート =====
export type AlertKind =
  | "normal" | "due_soon" | "overdue" | "long_overdue" | "partial_remain";

export const ALERT_LABELS: Record<AlertKind, string> = {
  normal: "通常",
  due_soon: "入金予定間近",
  overdue: "入金遅延",
  long_overdue: "長期未入金",
  partial_remain: "一部入金残あり",
};

/** 入金遅延日数（今日 - 入金予定日）。入金済や予定日なしは0。 */
export function paymentDelayDays(d: Deal, today: Date): number {
  if (!d.payment_due || d.payment_status === "paid") return 0;
  const due = new Date(d.payment_due + "T00:00:00");
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

/** 入金アラート区分の判定。 */
export function paymentAlert(d: Deal, today: Date): AlertKind {
  if (d.payment_status === "paid" || unpaidAmount(d) <= 0) return "normal";
  const delay = paymentDelayDays(d, today); // 正=遅延日数
  if (delay >= 30) return "long_overdue";
  if (delay >= 1) return "overdue";
  if (d.payment_status === "partial") return "partial_remain";
  if (d.payment_due && delay >= -7 && delay <= 0) return "due_soon";
  return "normal";
}
