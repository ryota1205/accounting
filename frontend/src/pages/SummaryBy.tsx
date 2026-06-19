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

type SortKey = "name" | "amount" | "instructor_fee" | "share";

export default function SummaryBy() {
  const { fiscalYear } = useFiscalYear();
  const [dim, setDim] = useState("instructor");
  const [rows, setRows] = useState<ByRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const frm = `${fiscalYear}-04-01`;
  const to = `${fiscalYear + 1}-03-31`;

  useEffect(() => {
    setRows(null); setError(null);
    api.by(dim, frm, to).then(setRows).catch((e) => setError(e.message));
  }, [dim, fiscalYear]);

  const toggleSort = (key: SortKey) =>
    setSort((p) => (p?.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const arrow = (key: SortKey) => (sort?.key !== key ? "⇅" : sort.dir === "asc" ? "▲" : "▼");

  const sortedRows = (() => {
    if (!rows || !sort) return rows;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) =>
      sort.key === "name"
        ? a.name.localeCompare(b.name, "ja") * sign
        : ((a[sort.key] as number) - (b[sort.key] as number)) * sign,
    );
  })();

  // クリックでソートできる見出しセル（コンポーネント化すると再マウントするため関数で生成）
  const sortTh = (k: SortKey, label: string, num?: boolean) => (
    <th
      className={num ? "num" : undefined}
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => toggleSort(k)}
    >
      {label}
      <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 3 }}>{arrow(k)}</span>
    </th>
  );

  return (
    <Layout title="軸別集計"
      actions={
        <select value={dim} onChange={(e) => setDim(e.target.value)}>
          {DIMS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      }>
      <div className="panel matrix by">
        {error ? <ErrorState message={error} />
          : sortedRows === null ? <Loading />
          : sortedRows.length === 0 ? <Empty />
          : (
          <table>
            <colgroup>
              <col className="c-name" />
              <col className="c-num" />
              {dim === "instructor" && <col className="c-num" />}
              <col className="c-share" />
            </colgroup>
            <thead>
              <tr>
                {sortTh("name", DIMS.find((d) => d.key === dim)?.label ?? "")}
                {sortTh("amount", "売上(税込)", true)}
                {dim === "instructor" && sortTh("instructor_fee", "講師料", true)}
                {sortTh("share", "シェア率", true)}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
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
