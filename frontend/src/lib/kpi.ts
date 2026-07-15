// 分析画面の計算ロジック（純関数・テスト対象）。
import { Benchmark } from "./benchmarks";

export type Zone = "safe" | "warn" | "danger";

// 指標値をゾーン（安全/注意/危険）に分類する。
// value は率なら 0〜1、金額なら円。null/NaN は判定不能として null を返す。
export function classify(value: number | null | undefined, b: Benchmark): Zone | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const v = value;
  if (b.dir === "higher") {
    // 危険 < warnLo <= 注意 < safeLo <= 安全
    if (b.safeLo !== undefined && v >= b.safeLo) return "safe";
    if (b.warnLo !== undefined && v >= b.warnLo) return "warn";
    return "danger";
  }
  if (b.dir === "lower") {
    // 安全 <= safeHi < 注意 <= warnHi < 危険
    if (b.safeHi !== undefined && v <= b.safeHi) return "safe";
    if (b.warnHi !== undefined && v <= b.warnHi) return "warn";
    return "danger";
  }
  // band: safeLo〜safeHi=安全、warnLo〜warnHi=注意、その外=危険
  if (b.safeLo !== undefined && b.safeHi !== undefined && v >= b.safeLo && v <= b.safeHi) return "safe";
  if (b.warnLo !== undefined && b.warnHi !== undefined && v >= b.warnLo && v <= b.warnHi) return "warn";
  return "danger";
}

// ゾーンバー用に、現在値の位置を 0〜1 に正規化する。
// バーの範囲は [min, max] を指標の閾値から自動決定（外れ値はクランプ）。
export function markerPosition(value: number | null | undefined, b: Benchmark): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const bounds = barBounds(b);
  const { min, max } = bounds;
  if (max <= min) return null;
  const p = (value - min) / (max - min);
  return Math.max(0, Math.min(1, p));
}

// バーの表示範囲（閾値の内外に少し余白をとる）。
export function barBounds(b: Benchmark): { min: number; max: number } {
  const pts = [b.warnLo, b.safeLo, b.safeHi, b.warnHi].filter(
    (x): x is number => x !== undefined,
  );
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const span = hi - lo || Math.abs(hi) || 1;
  return { min: lo - span * 0.5, max: hi + span * 0.5 };
}

// 会計年度（4月開始）: ある日付が属する会計年度を返す。
export function fiscalYearOf(d: Date): number {
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1..12
  return m >= 4 ? y : y - 1;
}

// 表示中の年度における「経過月数」（年換算の分母）。
// 現在年度→4月から当月まで / 過去年度→12 / 未来年度→0。
export function elapsedMonths(fiscalYear: number, today: Date): number {
  const curFY = fiscalYearOf(today);
  if (fiscalYear < curFY) return 12;
  if (fiscalYear > curFY) return 0;
  const m = today.getMonth() + 1; // 1..12
  const fyMonth = m >= 4 ? m - 4 + 1 : m + 12 - 4 + 1; // 4月=1 ... 3月=12
  return fyMonth;
}

// 実績から年間見込みを算出（実績 ÷ 経過月 × 12）。経過0なら null。
export function annualize(actual: number, months: number): number | null {
  if (months <= 0) return null;
  return (actual / months) * 12;
}

export interface LaborInput {
  gross: number;          // 粗利（実績 or 見込み）
  laborShare: number;     // 労働分配率 0〜1
  headcount: number;      // 従業員数（役員除く）
  bonusMonths: number;    // 賞与月数（年間）
  execCompAnnual: number; // 役員報酬 年額（別枠）
}

export interface LaborResult {
  total: number;          // 適正人件費 総額
  employeePool: number;   // 社員原資（総額−役員報酬、0クランプ）
  perHeadAnnual: number | null;  // 1人当たり年収
  monthly: number | null;        // 月給
  bonus: number | null;          // 賞与（年間）
}

// 人件費の目安を算出。gross<=0 は総額0、headcount<=0 は1人当たりを null。
export function laborEstimate(inp: LaborInput): LaborResult {
  const total = Math.max(0, inp.gross) * inp.laborShare;
  const employeePool = Math.max(0, total - Math.max(0, inp.execCompAnnual));
  if (inp.headcount > 0) {
    const perHeadAnnual = employeePool / inp.headcount;
    const monthly = perHeadAnnual / (12 + Math.max(0, inp.bonusMonths));
    const bonus = monthly * Math.max(0, inp.bonusMonths);
    return { total, employeePool, perHeadAnnual, monthly, bonus };
  }
  return { total, employeePool, perHeadAnnual: null, monthly: null, bonus: null };
}
