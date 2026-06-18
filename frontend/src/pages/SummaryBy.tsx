import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { ByRow } from "../api/types";
import { yen, pct } from "../lib/format";

const DIMS = [
  { key: "instructor", label: "講師別" },
  { key: "agency", label: "代理店別" },
  { key: "client", label: "クライアント別" },
];

export default function SummaryBy() {
  const { fiscalYear } = useFiscalYear();
  const [dim, setDim] = useState("instructor");
  const [rows, setRows] = useState<ByRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const frm = `${fiscalYear}-04-01`;
  const to = `${fiscalYear + 1}-03-31`;

  useEffect(() => {
    setRows(null); setError(null);
    api.by(dim, frm, to).then(setRows).catch((e) => setError(e.message));
  }, [dim, fiscalYear]);

  return (
    <Layout title="軸別集計"
      actions={
        <select value={dim} onChange={(e) => setDim(e.target.value)}>
          {DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      }>
      <div className="panel matrix">
        {error ? <ErrorState message={error} />
          : rows === null ? <Loading />
          : rows.length === 0 ? <Empty />
          : (
          <table>
            <thead>
              <tr>
                <th>{DIMS.find((d) => d.key === dim)?.label}</th>
                <th className="num">売上(税込)</th>
                {dim === "instructor" && <th className="num">講師料</th>}
                <th className="num">シェア率</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num">{yen(r.amount)}</td>
                  {dim === "instructor" && <td className="num">{yen(r.instructor_fee)}</td>}
                  <td className="num">{pct(r.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
