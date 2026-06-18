import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Layout } from "../components/Layout";
import { Card } from "../components/Card";
import { Loading, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { MonthlySummary, PLSummary, Deal } from "../api/types";
import { yen, pct } from "../lib/format";
import { unpaidAmount } from "../lib/deal";

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

  return (
    <Layout title="ダッシュボード">
      <div className="cards">
        <Card label={`${fiscalYear}年度 売上合計(税込)`} value={yen(monthly.total)} />
        <Card label="営業利益" value={yen(pl.operating_profit)} />
        <Card label="BEP達成率" value={pct(pl.bep_achievement)}
          sub={`損益分岐点 ${yen(pl.bep)}`} />
        <Card label="未入金合計" value={yen(unpaidTotal)} sub={`${unpaidDeals.length}件`} />
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
