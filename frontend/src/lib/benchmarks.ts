// 経営指標の「業界の一般的な目安（基準値）」の既定定義。
// これらは公的に確定した業界平均ではなく、研修業・中小サービス業で一般に
// 使われる経営判断の目安レンジ。すべて画面から編集でき、上書き値は
// Setting.benchmarks_json（キー→部分上書き）に保存する。

export type Direction = "higher" | "lower" | "band";
// higher: 大きいほど良い / lower: 小さいほど良い / band: 範囲内が良い

// 指標のゾーン定義。値は「率」は 0〜1、「金額」は円で保持する。
export interface Benchmark {
  key: string;
  label: string;
  unit: "pct" | "yen";      // 表示単位
  dir: Direction;
  // higher: [危険<warnLo] [注意 warnLo〜safeLo] [安全≥safeLo]
  // lower:  [安全≤safeHi] [注意 safeHi〜warnHi] [危険>warnHi]
  // band:   [安全 safeLo〜safeHi] を中心に、warnLo/warnHi までが注意、その外が危険
  safeLo?: number;   // 安全域の下限（higher, band）
  safeHi?: number;   // 安全域の上限（lower, band）
  warnLo?: number;   // 注意域の下限（higher の危険境界 / band の危険下限）
  warnHi?: number;   // 注意域の上限（lower の危険境界 / band の危険上限）
  note?: string;     // 補足（出典・考え方）
}

export type Category = { title: string; items: Benchmark[] };

// 万円 → 円
const man = (n: number) => n * 10000;

// カテゴリ①〜③の既定値（④ 資金・安全性は次弾）
export const DEFAULT_BENCHMARKS: Category[] = [
  {
    title: "① 収益性",
    items: [
      { key: "gross_rate", label: "粗利率", unit: "pct", dir: "higher",
        warnLo: 0.40, safeLo: 0.50,
        note: "外部講師利用の研修業で50%以上が目安（自社講師中心なら70%+）" },
      { key: "op_margin", label: "営業利益率", unit: "pct", dir: "higher",
        warnLo: 0.03, safeLo: 0.10,
        note: "(粗利−年間固定費)÷売上。10%以上が目安、赤字は危険" },
      { key: "bep_ratio", label: "損益分岐点比率", unit: "pct", dir: "lower",
        safeHi: 0.80, warnHi: 0.95,
        note: "年間固定費÷粗利。80%未満で余裕、95%以上は危険" },
      { key: "labor_share", label: "労働分配率（目標）", unit: "pct", dir: "band",
        warnLo: 0.35, safeLo: 0.40, safeHi: 0.55, warnHi: 0.65,
        note: "人件費÷粗利。40〜55%が目安。低すぎも人材流出リスク" },
    ],
  },
  {
    title: "② 成長性・安定性",
    items: [
      { key: "growth", label: "売上成長率（前年比）", unit: "pct", dir: "higher",
        warnLo: 0.0, safeLo: 0.10,
        note: "+10%以上で成長、マイナスは要改善" },
      { key: "repeat_ratio", label: "リピート売上比率", unit: "pct", dir: "higher",
        warnLo: 0.30, safeLo: 0.50,
        note: "50%以上で収益が安定" },
      { key: "top1_dep", label: "上位1社 売上依存度", unit: "pct", dir: "lower",
        safeHi: 0.30, warnHi: 0.50,
        note: "30%未満が健全、50%以上は依存リスク大" },
      { key: "new_ratio", label: "新規売上比率", unit: "pct", dir: "band",
        warnLo: 0.10, safeLo: 0.20, safeHi: 0.35, warnHi: 0.50,
        note: "20〜35%が健全。低いと先細り、高すぎると不安定" },
    ],
  },
  {
    title: "③ 生産性（従業員数が必要）",
    items: [
      { key: "sales_per_head", label: "一人当たり売上", unit: "yen", dir: "higher",
        warnLo: man(800), safeLo: man(1200),
        note: "中小サービス業の目安（編集可）" },
      { key: "gross_per_head", label: "一人当たり粗利", unit: "yen", dir: "higher",
        warnLo: man(600), safeLo: man(900),
        note: "付加価値生産性の目安（編集可）" },
      { key: "op_per_head", label: "一人当たり営業利益", unit: "yen", dir: "higher",
        warnLo: 0, safeLo: man(120),
        note: "1人当たりの稼ぐ力。赤字は危険（編集可）" },
    ],
  },
];

// benchmarks_json（部分上書き）を既定値にマージする。
// 形式: { [key]: { safeLo?, safeHi?, warnLo?, warnHi? } }
export function mergeBenchmarks(json?: string | null): Category[] {
  let overrides: Record<string, Partial<Benchmark>> = {};
  if (json) {
    try { overrides = JSON.parse(json) ?? {}; } catch { overrides = {}; }
  }
  return DEFAULT_BENCHMARKS.map((cat) => ({
    title: cat.title,
    items: cat.items.map((b) => {
      const o = overrides[b.key];
      return o ? { ...b, ...o } : b;
    }),
  }));
}

// 生産性カテゴリのキー（従業員数未設定なら丸ごと隠す判定に使う）
export const PRODUCTIVITY_KEYS = ["sales_per_head", "gross_per_head", "op_per_head"];
