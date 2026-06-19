import { useEffect, useState, ReactNode } from "react";
import { Layout } from "../components/Layout";
import { Loading, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { MonthSummary, Deal } from "../api/types";
import { yen, pct } from "../lib/format";
import { unpaidAmount, paymentAlert } from "../lib/deal";

function fiscalMonths(fy: number): string[] {
  const out: string[] = [];
  for (let m = 4; m <= 12; m++) out.push(`${fy}-${String(m).padStart(2, "0")}`);
  for (let m = 1; m <= 3; m++) out.push(`${fy + 1}-${String(m).padStart(2, "0")}`);
  return out;
}

function MetricCard({ label, value, sub, tone }: {
  label: string; value: string; sub?: ReactNode; tone?: "pos" | "neg";
}) {
  const color = tone === "pos" ? "var(--ok)" : tone === "neg" ? "var(--danger)" : undefined;
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value" style={{ color }}>{value}</div>
      {sub}
    </div>
  );
}

export default function MonthlySummary() {
  const { fiscalYear } = useFiscalYear();
  const months = fiscalMonths(fiscalYear);
  const [ym, setYm] = useState(months.includes("2026-06") ? "2026-06" : months[0]);
  const [data, setData] = useState<MonthSummary | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fixedInput, setFixedInput] = useState(0);
  const [savingMsg, setSavingMsg] = useState("");

  // 年度を変えたら、その年度内の月へ補正
  useEffect(() => {
    if (!months.includes(ym)) setYm(months[0]);
  }, [fiscalYear]); // eslint-disable-line

  function load() {
    setData(null); setError(null);
    Promise.all([api.monthSummary(ym), api.listDeals({ fiscal_year: fiscalYear }), api.getMonthlyFixedCost(ym)])
      .then(([m, ds, fc]) => { setData(m); setDeals(ds); setFixedInput(fc.fixed_cost_amount); })
      .catch((e) => setError(e.message));
  }
  useEffect(load, [ym, fiscalYear]);

  async function saveFixed() {
    setSavingMsg("保存中…");
    try { await api.putMonthlyFixedCost(ym, fixedInput); setSavingMsg("保存しました"); load(); }
    catch (e) { setSavingMsg(""); setError((e as Error).message); }
  }

  if (error) return <Layout title="月次サマリー"><ErrorState message={error} /></Layout>;
  if (!data) return <Layout title="月次サマリー"><Loading /></Layout>;

  const c = data.current;
  const py = data.prev_year;
  const hasPY = data.prev_year_has_data;

  // 前年比：プラスは緑、マイナスは赤、増減なしはグレー
  const yoyStyle = (n: number) => ({
    color: n > 0 ? "var(--ok)" : n < 0 ? "var(--danger)" : undefined,
    fontWeight: n !== 0 ? 600 : undefined,
  });

  const yoyAmount = (cur: number, prev: number): ReactNode => {
    if (!hasPY) return <div className="label">前年データなし</div>;
    const diff = cur - prev;
    const ratio = prev !== 0 ? `${(cur / prev * 100).toFixed(1)}%` : "—";
    return <div className="label" style={yoyStyle(diff)}>前年比 {ratio}<br />前年差 {diff >= 0 ? "+" : ""}{yen(diff)}</div>;
  };
  const yoyCount = (cur: number, prev: number): ReactNode => {
    if (!hasPY) return <div className="label">前年データなし</div>;
    const diff = cur - prev;
    const ratio = prev !== 0 ? `${(cur / prev * 100).toFixed(1)}%` : "—";
    return <div className="label" style={yoyStyle(diff)}>前年比 {ratio}<br />前年差 {diff >= 0 ? "+" : ""}{diff}件</div>;
  };
  const yoyRate = (cur: number, prev: number): ReactNode => {
    if (!hasPY) return <div className="label">前年データなし</div>;
    const ptv = (cur - prev) * 100;
    return <div className="label" style={yoyStyle(ptv)}>前年差 {ptv >= 0 ? "+" : ""}{ptv.toFixed(1)}pt</div>;
  };

  // 入金アラート（現在・今日基準、年度内の案件）
  const today = new Date();
  const cnt = (k: string) => deals.filter((d) => paymentAlert(d, today) === k).length;
  const unpaidDeals = deals.filter((d) => d.payment_status !== "paid" && unpaidAmount(d) > 0);
  const unpaidTotal = unpaidDeals.reduce((s, d) => s + unpaidAmount(d), 0);
  const overdueTotal = deals
    .filter((d) => ["overdue", "long_overdue"].includes(paymentAlert(d, today)))
    .reduce((s, d) => s + unpaidAmount(d), 0);

  return (
    <Layout title="月次サマリー"
      actions={
        <select value={ym} onChange={(e) => setYm(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      }>
      <div className="panel" style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>当月の固定費</label>
          <input type="text" inputMode="numeric" style={{ fontSize: 13 }}
            value={fixedInput ? fixedInput.toLocaleString("ja-JP") : ""}
            onChange={(e) => setFixedInput(Number(e.target.value.replace(/[^\d]/g, "")) || 0)} />
          <span className="hint">未設定なら年度の月額固定費を使用</span>
        </div>
        <button className="btn" onClick={saveFixed}>固定費を保存</button>
        <span className="hint">{savingMsg}</span>
      </div>

      <h3 style={{ margin: "18px 0 8px" }}>{ym} 業績</h3>
      <div className="cards">
        <MetricCard label="売上実績（税抜）" value={yen(c.sales)} sub={yoyAmount(c.sales, py.sales)} />
        <MetricCard label="粗利額" value={yen(c.gross_profit)} sub={yoyAmount(c.gross_profit, py.gross_profit)} />
        <MetricCard label="粗利率" value={pct(c.gross_rate)} sub={yoyRate(c.gross_rate, py.gross_rate)} />
        <MetricCard label="固定費" value={yen(c.fixed_cost)} />
        <MetricCard label="損益分岐点" value={yen(c.bep)} />
        <MetricCard
          label={c.bep_diff >= 0 ? "黒字余力" : "不足額"}
          value={yen(Math.abs(c.bep_diff))}
          tone={c.bep_diff >= 0 ? "pos" : "neg"}
          sub={<div className="label">売上実績 − 損益分岐点</div>} />
        <MetricCard label="入金予定額" value={yen(c.invoice_total)} />
        <MetricCard label="未入金額" value={yen(c.unpaid_total)} tone={c.unpaid_total > 0 ? "neg" : undefined} />
        <MetricCard label="見込み売上" value={yen(c.expected_sales)} sub={yoyAmount(c.expected_sales, py.expected_sales)} />
        <MetricCard label="確度加重後 見込み" value={yen(c.weighted_forecast)} />
        <MetricCard label="受注件数" value={`${c.order_count} 件`} sub={yoyCount(c.order_count, py.order_count)} />
        <MetricCard label="平均案件単価" value={yen(c.avg_price)} sub={yoyAmount(c.avg_price, py.avg_price)} />
      </div>

      <h3 style={{ margin: "18px 0 8px" }}>入金アラート（現在）</h3>
      <div className="cards">
        <MetricCard label="入金予定間近" value={`${cnt("due_soon")} 件`} />
        <MetricCard label="入金遅延" value={`${cnt("overdue")} 件`} tone={cnt("overdue") ? "neg" : undefined} />
        <MetricCard label="長期未入金" value={`${cnt("long_overdue")} 件`} tone={cnt("long_overdue") ? "neg" : undefined} />
        <MetricCard label="一部入金残あり" value={`${cnt("partial_remain")} 件`} />
        <MetricCard label="未入金総額" value={yen(unpaidTotal)} />
        <MetricCard label="遅延中の未入金総額" value={yen(overdueTotal)} tone={overdueTotal ? "neg" : undefined} />
      </div>
    </Layout>
  );
}
