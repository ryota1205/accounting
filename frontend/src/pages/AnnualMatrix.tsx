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
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    api.annual(fiscalYear).then(setData).catch((e) => setError(e.message));
  }, [fiscalYear]);

  if (error) return <Layout title="年間売上管理表"><ErrorState message={error} /></Layout>;
  if (!data) return <Layout title="年間売上管理表"><Loading /></Layout>;
  if (data.rows.length === 0) return <Layout title="年間売上管理表"><Empty /></Layout>;

  const sortedRows = sortDir
    ? [...data.rows].sort((a, b) => a.client.localeCompare(b.client, "ja") * (sortDir === "asc" ? 1 : -1))
    : data.rows;

  return (
    <Layout title="年間売上管理表">
      <div className="panel matrix">
        <table>
          <thead>
            <tr>
              <th
                style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                onClick={() => setSortDir((p) => (p === "asc" ? "desc" : "asc"))}
              >
                企業名
                <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 3 }}>
                  {sortDir === "asc" ? "▲" : sortDir === "desc" ? "▼" : "⇅"}
                </span>
              </th>
              {data.labels.map((l) => <th key={l} className="num">{l}</th>)}
              <th className="num">合計</th>
            </tr>
            <tr>
              <th>月計</th>
              {data.month_totals.map((m, i) => <th key={i} className="num">{yen(m)}</th>)}
              <th className="num">{yen(data.grand_total)}</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.client}>
                <td>{r.client}</td>
                {r.months.map((m, i) => <td key={i} className="num">{m ? yen(m) : "—"}</td>)}
                <td className="num"><strong>{yen(r.total)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
