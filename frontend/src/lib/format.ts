export function yen(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

// 万円単位（カンマ区切り）。グラフ軸ラベル用。例: 34320000 -> "3,432万"
export function man(n: number): string {
  return Math.round(n / 10000).toLocaleString("ja-JP") + "万";
}

export function pct(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined) return "—";
  return (ratio * 100).toFixed(digits) + "%";
}

export function ymd(s: string | null | undefined): string {
  if (!s) return "—";
  return s;
}
