import { useEffect, useState, ReactNode } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { SalesFunnel } from "../api/types";
import { pct } from "../lib/format";

function fiscalMonths(fy: number): string[] {
  const out: string[] = [];
  for (let m = 4; m <= 12; m++) out.push(`${fy}-${String(m).padStart(2, "0")}`);
  for (let m = 1; m <= 3; m++) out.push(`${fy + 1}-${String(m).padStart(2, "0")}`);
  return out;
}

function Card({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub}
    </div>
  );
}

export default function SalesManagement() {
  const { fiscalYear } = useFiscalYear();
  const months = fiscalMonths(fiscalYear);
  const [ym, setYm] = useState(months.includes("2026-06") ? "2026-06" : months[0]);
  const [data, setData] = useState<SalesFunnel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inq, setInq] = useState(0);
  const [first, setFirst] = useState(0);
  const [savingMsg, setSavingMsg] = useState("");

  useEffect(() => { if (!months.includes(ym)) setYm(months[0]); }, [fiscalYear]); // eslint-disable-line

  function load() {
    setData(null); setError(null);
    Promise.all([api.salesFunnel(ym), api.getSalesActivity(ym)])
      .then(([f, a]) => { setData(f); setInq(a.inquiries); setFirst(a.first_meetings); })
      .catch((e) => setError(e.message));
  }
  useEffect(load, [ym, fiscalYear]);

  async function saveActivity() {
    setSavingMsg("保存中…");
    try { await api.putSalesActivity(ym, inq, first); setSavingMsg("保存しました"); load(); }
    catch (e) { setSavingMsg(""); setError((e as Error).message); }
  }

  if (error) return <Layout title="営業管理"><ErrorState message={error} /></Layout>;
  if (!data) return <Layout title="営業管理"><Loading /></Layout>;

  const c = data.current;
  const py = data.prev_year;
  const hasPY = data.prev_year_has_data;

  const yoyCount = (cur: number, prev: number): ReactNode => {
    if (!hasPY) return <div className="label">前年データなし</div>;
    const diff = cur - prev;
    const ratio = prev !== 0 ? `${(cur / prev * 100).toFixed(1)}%` : "—";
    return <div className="label">前年比 {ratio} / 前年差 {diff >= 0 ? "+" : ""}{diff}件</div>;
  };
  const yoyRate = (cur: number, prev: number): ReactNode => {
    if (!hasPY) return <div className="label">前年データなし</div>;
    const ptv = (cur - prev) * 100;
    return <div className="label">前年差 {ptv >= 0 ? "+" : ""}{ptv.toFixed(1)}pt</div>;
  };

  return (
    <Layout title="営業管理"
      actions={
        <select value={ym} onChange={(e) => setYm(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      }>
      <div className="panel" style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>問い合わせ数（手入力）</label>
          <input type="number" style={{ fontSize: 13, width: 120 }} value={inq}
            onChange={(e) => setInq(Number(e.target.value) || 0)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>初回相談数（手入力）</label>
          <input type="number" style={{ fontSize: 13, width: 120 }} value={first}
            onChange={(e) => setFirst(Number(e.target.value) || 0)} />
        </div>
        <button className="btn" onClick={saveActivity}>保存</button>
        <span className="hint">{savingMsg}　※案件ステータスからの自動分も合算して集計します</span>
      </div>

      <h3 style={{ margin: "18px 0 8px" }}>{ym} 営業ファネル</h3>
      <div className="cards">
        <Card label="問い合わせ数" value={`${c.inquiries} 件`} sub={yoyCount(c.inquiries, py.inquiries)} />
        <Card label="初回相談数" value={`${c.first_meetings} 件`} sub={yoyCount(c.first_meetings, py.first_meetings)} />
        <Card label="提案数" value={`${c.proposals} 件`} sub={yoyCount(c.proposals, py.proposals)} />
        <Card label="受注数" value={`${c.orders} 件`} sub={yoyCount(c.orders, py.orders)} />
        <Card label="失注数" value={`${c.lost} 件`} sub={yoyCount(c.lost, py.lost)} />
        <Card label="受注率" value={pct(c.win_rate)} sub={yoyRate(c.win_rate, py.win_rate)} />
      </div>

      <div className="panel matrix">
        <h3>失注理由別 件数</h3>
        {c.lost_reasons.length === 0 ? <Empty label="失注はありません" /> : (
          <table>
            <thead><tr><th>失注理由</th><th className="num">件数</th></tr></thead>
            <tbody>
              {c.lost_reasons.map((r) => (
                <tr key={r.reason}><td>{r.reason}</td><td className="num">{r.count}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
