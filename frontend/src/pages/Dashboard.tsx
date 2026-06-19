import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Layout } from "../components/Layout";
import { Card } from "../components/Card";
import { Loading, ErrorState } from "../components/States";
import { Link } from "react-router-dom";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { MonthlySummary, PLSummary, Deal } from "../api/types";
import { yen, pct } from "../lib/format";
import { unpaidAmount, paymentAlert } from "../lib/deal";

export default function Dashboard() {
  const { fiscalYear } = useFiscalYear();
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [pl, setPl] = useState<PLSummary | null>(null);
  const [unpaid, setUnpaid] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null); setMonthly(null);
    Promise.all([
      api.monthly(fiscalYear),
      api.pl(fiscalYear),
      api.listDeals({ fiscal_year: fiscalYear }),
    ]).then(([m, p, u]) => { setMonthly(m); setPl(p); setUnpaid(u); })
      .catch((e) => setError(e.message));
  }, [fiscalYear]);

  if (error) return <Layout title="ダッシュボード"><ErrorState message={error} /></Layout>;
  if (!monthly || !pl || !unpaid) return <Layout title="ダッシュボード"><Loading /></Layout>;

  const chartData = monthly.labels.map((l, i) => ({ name: l, 売上: monthly.current[i] }));
  const unpaidDeals = unpaid.filter((d) => d.payment_status !== "paid" && unpaidAmount(d) > 0);
  const unpaidTotal = unpaidDeals.reduce((s, d) => s + unpaidAmount(d), 0);

  // 未入金アラート（遅延：overdue + long_overdue）
  const today = new Date();
  const overdueDeals = unpaid.filter((d) =>
    ["overdue", "long_overdue"].includes(paymentAlert(d, today)));
  const overdueTotal = overdueDeals.reduce((s, d) => s + unpaidAmount(d), 0);

  // 前年同期比（年度開始4月〜「今月」までの累計・税込）。例: 6月なら 4〜6月を当年度/前年度で対比
  const nowMonth = new Date().getMonth() + 1;          // 1-12（実際の今月）
  const elapsed = ((nowMonth - 4 + 12) % 12) + 1;       // 4月起点の経過月数（6月=3）
  const ytd = (arr: (number | null)[]) =>
    arr.slice(0, elapsed).reduce<number>((s, v) => s + (v ?? 0), 0);
  const curYtd = ytd(monthly.current);
  const prevYtd = ytd(monthly.prev);
  const hasPrevYtd = monthly.prev.slice(0, elapsed).some((v) => v !== null);
  const ytdDiff = curYtd - prevYtd;
  const ytdRatio = prevYtd ? `${(curYtd / prevYtd * 100).toFixed(1)}%` : "—";
  const ytdColor = ytdDiff > 0 ? "var(--ok)" : ytdDiff < 0 ? "var(--danger)" : undefined;
  const rangeLabel = `4〜${monthly.labels[elapsed - 1]}`; // 例: "4〜6月"

  return (
    <Layout title="ダッシュボード">
      {overdueDeals.length > 0 && (
        <Link to="/payments" className="alert-banner">
          <span className="alert-banner-icon">!</span>
          <span>
            <strong>未入金アラート {overdueDeals.length}件</strong>
            　遅延中の未入金 {yen(overdueTotal)} があります。
          </span>
          <span className="alert-banner-cta">入金管理へ →</span>
        </Link>
      )}
      <div className="cards">
        <Card label={`${fiscalYear}年度 売上合計(税込)`} value={yen(monthly.total)} />
        <Card label="営業利益" value={yen(pl.operating_profit)} />
        <Card label="BEP達成率" value={pct(pl.bep_achievement)}
          sub={`損益分岐点 ${yen(pl.bep)}`} />
        <Card label="未入金合計" value={yen(unpaidTotal)} sub={`${unpaidDeals.length}件`} />
      </div>

      <div className="panel">
        <h3>前年同期比（{rangeLabel} 累計・税込）</h3>
        {!hasPrevYtd && <div className="hint">※ 前年度（{fiscalYear - 1}年度）データがありません。</div>}
        <div className="cards">
          <div className="card">
            <div className="label">{fiscalYear}年度 累計</div>
            <div className="value">{yen(curYtd)}</div>
          </div>
          <div className="card">
            <div className="label">{fiscalYear - 1}年度 同期</div>
            <div className="value">{yen(prevYtd)}</div>
          </div>
          <div className="card">
            <div className="label">前年差</div>
            <div className="value" style={{ color: ytdColor }}>{ytdDiff >= 0 ? "+" : ""}{yen(ytdDiff)}</div>
            <div className="label" style={{ color: ytdColor, fontWeight: ytdDiff !== 0 ? 600 : undefined }}>前年比 {ytdRatio}</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>月別売上</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tickMargin={12} tick={{ fontSize: 11 }} />
            <YAxis
              domain={[0, 10000000]}
              ticks={[0, 2000000, 4000000, 6000000, 8000000, 10000000]}
              tickFormatter={(v) => `${v / 10000}万`}
              tick={{ fontSize: 11 }}
            />
            <Tooltip formatter={(v: number) => yen(v)} />
            <Bar dataKey="売上" fill="#2563eb" maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="panel">
        <h3>入金予定（未入金・予定日が近い順）</h3>
        {unpaidDeals.length === 0 ? <div className="state">未入金はありません</div> : (
          <table>
            <thead><tr><th>入金予定日</th><th>企業名</th><th className="num">未入金額</th></tr></thead>
            <tbody>
              {[...unpaidDeals]
                .sort((a, b) => (a.payment_due ?? "9999").localeCompare(b.payment_due ?? "9999"))
                .slice(0, 10).map((d) => (
                <tr key={d.id}>
                  <td>{d.payment_due ?? "—"}</td><td>{d.client}</td>
                  <td className="num">{yen(unpaidAmount(d))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
