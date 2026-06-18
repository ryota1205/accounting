import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { AnnualSummary } from "../api/types";
import { yen } from "../lib/format";

export default function AnnualMatrix() {
  const { fiscalYear } = useFiscalYear();
  const [data, setData] = useState<AnnualSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    api.annual(fiscalYear).then(setData).catch((e) => setError(e.message));
  }, [fiscalYear]);

  if (error) return <Layout title="年間売上管理表"><ErrorState message={error} /></Layout>;
  if (!data) return <Layout title="年間売上管理表"><Loading /></Layout>;
  if (data.rows.length === 0) return <Layout title="年間売上管理表"><Empty /></Layout>;

  return (
    <Layout title="年間売上管理表">
      <div className="panel matrix">
        <table>
          <thead>
            <tr>
              <th>企業名</th>
              {data.labels.map((l) => <th key={l} className="num">{l}</th>)}
              <th className="num">合計</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.client}>
                <td>{r.client}</td>
                {r.months.map((m, i) => <td key={i} className="num">{m ? yen(m) : "—"}</td>)}
                <td className="num"><strong>{yen(r.total)}</strong></td>
              </tr>
            ))}
            <tr>
              <td><strong>月計</strong></td>
              {data.month_totals.map((m, i) => <td key={i} className="num"><strong>{yen(m)}</strong></td>)}
              <td className="num"><strong>{yen(data.grand_total)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
