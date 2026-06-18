import { useEffect, useState } from "react";
import {
  ComposedChart, LineChart, Line, Bar, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer,
} from "recharts";
import { Layout } from "../components/Layout";
import { Card } from "../components/Card";
import { Loading, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { PLSummary, MonthlySummary, Deal } from "../api/types";
import { yen, pct } from "../lib/format";

// 前年同月比グラフでクリックした月の実施企業を表示するテーブル
function MonthDealsTable({ title, deals }: { title: string; deals: Deal[] }) {
  const total = deals.reduce((s, d) => s + d.billing, 0);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
        {title}　{deals.length}件 / 計 {yen(total)}
      </div>
      {deals.length === 0 ? <div className="state">実施なし</div> : (
        <table>
          <thead>
            <tr><th>実施日</th><th>企業名</th><th>研修名</th><th>講師</th><th className="num">請求額</th></tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id}>
                <td>{d.held_on}</td>
                <td>{d.client}</td>
                <td>{d.training_name ?? "—"}</td>
                <td>{d.instructor ?? "—"}</td>
                <td className="num">{yen(d.billing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// 年間BEP図用: 0 と (現売上 or BEP の大きい方×1.1) の2点で直線を引く
function bepLineData(pl: PLSummary) {
  const maxX = Math.max(pl.net_sales, pl.bep) * 1.1 || 1;
  const pts = [0, maxX];
  return pts.map((x) => ({
    sales: Math.round(x),
    売上線: Math.round(x),
    総費用線: Math.round(pl.annual_fixed + (1 - pl.cm_ratio) * x),
  }));
}

export default function ProfitLoss() {
  const { fiscalYear } = useFiscalYear();
  const [pl, setPl] = useState<PLSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [fixed, setFixed] = useState<number>(0);
  const [savingMsg, setSavingMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [monthDeals, setMonthDeals] = useState<{ cur: Deal[]; prev: Deal[] } | null>(null);
  const [monthErr, setMonthErr] = useState<string | null>(null);

  function reload() {
    setError(null); setPl(null);
    Promise.all([api.pl(fiscalYear), api.monthly(fiscalYear), api.getSetting(fiscalYear)])
      .then(([p, m, s]) => { setPl(p); setMonthly(m); setFixed(s.monthly_fixed_cost); })
      .catch((e) => setError(e.message));
  }
  useEffect(reload, [fiscalYear]);

  // 選択された月の「当年度／前年度」実施企業を取得（既存の deals API を流用）
  useEffect(() => {
    if (selectedMonth === null) { setMonthDeals(null); return; }
    setMonthDeals(null); setMonthErr(null);
    Promise.all([
      api.listDeals({ fiscal_year: fiscalYear, month: selectedMonth }),
      api.listDeals({ fiscal_year: fiscalYear - 1, month: selectedMonth }),
    ])
      .then(([cur, prev]) => setMonthDeals({ cur, prev }))
      .catch((e) => setMonthErr((e as Error).message));
  }, [selectedMonth, fiscalYear]);

  async function saveFixed() {
    setSavingMsg("保存中…");
    try { await api.putSetting(fiscalYear, fixed); setSavingMsg("保存しました"); reload(); }
    catch (e) { setSavingMsg(""); setError((e as Error).message); }
  }

  if (error) return <Layout title="損益・損益分岐点"><ErrorState message={error} /></Layout>;
  if (!pl || !monthly) return <Layout title="損益・損益分岐点"><Loading /></Layout>;

  const bepData = bepLineData(pl);
  const cumData = pl.monthly_labels.map((l, i) => ({
    name: l, 累計売上: pl.cum_net[i], 累計総費用: pl.cum_total_cost[i],
  }));
  const yoyData = monthly.labels.map((l, i) => ({
    name: l, 当年度: monthly.current[i], 前年度: monthly.prev[i],
  }));
  const gmData = pl.monthly_labels.map((l, i) => ({
    name: l, 粗利率: Math.round(pl.gross_margin_rate[i] * 1000) / 10,
  }));
  const hasPrev = monthly.prev.some((v) => v !== null);

  return (
    <Layout title="損益・損益分岐点">
      <div className="panel" style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>月額固定費（人件費・家賃など）</label>
          <input type="number" value={fixed} onChange={(e) => setFixed(Number(e.target.value) || 0)} />
          <span className="hint">年間固定費 = 月額 × 12</span>
        </div>
        <button className="btn" onClick={saveFixed}>固定費を保存</button>
        <span className="hint">{savingMsg}</span>
      </div>

      <div className="cards">
        <Card label="売上(税抜)" value={yen(pl.net_sales)} />
        <Card label="変動費(講師料)" value={yen(pl.variable)} />
        <Card label="固定費(年間)" value={yen(pl.annual_fixed)} />
        <Card label="限界利益率" value={pct(pl.cm_ratio)} sub={`限界利益 ${yen(pl.contribution_margin)}`} />
        <Card label="営業利益" value={yen(pl.operating_profit)} />
        <Card label="損益分岐点売上高" value={yen(pl.bep)} />
        <Card label="BEP達成率" value={pct(pl.bep_achievement)} />
        <Card label="安全余裕率" value={pct(pl.safety_margin_ratio)} />
      </div>

      <div className="panel">
        <h3>損益分岐点（年間）</h3>
        {pl.annual_fixed === 0 && <div className="hint">※ 月額固定費が未設定です。上で設定すると損益分岐点が計算されます。</div>}
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={bepData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="sales" tickFormatter={(v) => `${Math.round(v / 10000)}万`} />
            <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}万`} />
            <Tooltip formatter={(v: number) => yen(v)} labelFormatter={(v) => `売上 ${yen(Number(v))}`} />
            <Legend />
            <Line dataKey="売上線" stroke="#2563eb" dot={false} />
            <Line dataKey="総費用線" stroke="#dc2626" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h3>月次累計の黒字転換点</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={cumData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}万`} />
            <Tooltip formatter={(v: number) => yen(v)} />
            <Legend />
            <Line dataKey="累計売上" stroke="#2563eb" />
            <Line dataKey="累計総費用" stroke="#dc2626" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h3>前年同月比</h3>
        {!hasPrev && <div className="hint">※ 前年度（{fiscalYear - 1}年度）データがありません。</div>}
        <div className="hint">グラフの月をクリックすると、その月の実施企業を下に表示します。</div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
            data={yoyData}
            onClick={(state) => {
              const lbl = (state as { activeLabel?: string } | null)?.activeLabel;
              if (lbl) setSelectedMonth(parseInt(lbl, 10));
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => `${Math.round(v / 10000)}万`} />
            <Tooltip formatter={(v: number) => yen(v)} />
            <Legend />
            <Bar dataKey="当年度" fill="#2563eb" style={{ cursor: "pointer" }} />
            <Line dataKey="前年度" stroke="#d97706" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="panel matrix">
        <h3>{selectedMonth === null ? "実施企業（月別明細）" : `${selectedMonth}月の実施企業`}</h3>
        {selectedMonth === null ? (
          <div className="hint">前年同月比グラフの棒をクリックすると、その月の実施企業を表示します。</div>
        ) : monthErr ? (
          <ErrorState message={monthErr} />
        ) : monthDeals === null ? (
          <Loading />
        ) : (
          <>
            <MonthDealsTable title={`当年度（${fiscalYear}年度）`} deals={monthDeals.cur} />
            <MonthDealsTable title={`前年度（${fiscalYear - 1}年度）`} deals={monthDeals.prev} />
          </>
        )}
      </div>

      <div className="panel">
        <h3>粗利率推移</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={gmData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Line dataKey="粗利率" stroke="#16a34a" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel matrix">
        <h3>得意先トップ5</h3>
        <table>
          <thead><tr><th>順位</th><th>企業名</th><th className="num">売上(税抜)</th><th className="num">シェア率</th></tr></thead>
          <tbody>
            {pl.top_clients.map((c, i) => (
              <tr key={c.name}>
                <td>{i + 1}</td><td>{c.name}</td>
                <td className="num">{yen(c.amount)}</td><td className="num">{pct(c.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
