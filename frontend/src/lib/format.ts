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
  return s;
}
