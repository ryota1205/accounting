import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { Card } from "../components/Card";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { Analysis as AnalysisData, GroupRow } from "../api/types";
import { yen, pct } from "../lib/format";

type SortKey = "name" | "sales" | "gross" | "gross_rate" | "count";

function GroupTable({ title, rows, firstColLabel }: {
  title: string; rows: GroupRow[]; firstColLabel: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "sales", dir: "desc" });
  const toggle = (k: SortKey) =>
    setSort((p) => (p.key === k ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }));
  const sorted = [...rows].sort((a, b) => {
    const mul = sort.dir === "asc" ? 1 : -1;
    const av = a[sort.key]; const bv = b[sort.key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
    return String(av).localeCompare(String(bv), "ja") * mul;
  });
  const arrow = (k: SortKey) => (
    <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 3 }}>
      {sort.key === k ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
  );
  const cols: { k: SortKey; label: string; num?: boolean }[] = [
    { k: "name", label: firstColLabel }, { k: "sales", label: "売上", num: true },
    { k: "gross", label: "粗利", num: true }, { k: "gross_rate", label: "粗利率", num: true },
    { k: "count", label: "件数", num: true },
  ];
  return (
    <div className="panel matrix">
      <h3>{title}</h3>
      {rows.length === 0 ? <Empty /> : (
        <table>
          <thead><tr>{cols.map((c) => (
            <th key={c.k} className={c.num ? "num" : undefined}
              style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
              onClick={() => toggle(c.k)}>{c.label}{arrow(c.k)}</th>
          ))}</tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{yen(r.sales)}</td>
                <td className="num">{yen(r.gross)}</td>
                <td className="num">{pct(r.gross_rate)}</td>
                <td className="num">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Analysis() {
  const { fiscalYear } = useFiscalYear();
  const [data, setData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    api.analysis(fiscalYear).then(setData).catch((e) => setError(e.message));
  }, [fiscalYear]);

  if (error) return <Layout title="分析"><ErrorState message={error} /></Layout>;
  if (!data) return <Layout title="分析"><Loading /></Layout>;

  const y = data.yoy;
  const ratio = (cur: number, prev: number) => (prev !== 0 ? `${(cur / prev * 100).toFixed(1)}%` : "—");

  return (
    <Layout title="分析">
      <h3 style={{ margin: "4px 0 8px" }}>上位顧客への依存度</h3>
      <div className="cards">
        <Card label="上位1社 売上比率" value={pct(data.dependency.top1)} />
        <Card label="上位3社 売上比率" value={pct(data.dependency.top3)} />
        <Card label="上位5社 売上比率" value={pct(data.dependency.top5)} />
        <Card label="年度売上(税抜)合計" value={yen(data.dependency.total)} />
      </div>

      <h3 style={{ margin: "18px 0 8px" }}>新規／既存／リピート別</h3>
      <div className="cards">
        {data.by_customer_type.map((r) => (
          <Card key={r.type} label={r.type} value={yen(r.sales)} sub={`構成比 ${pct(r.share)}`} />
        ))}
      </div>

      <GroupTable title="顧客別" rows={data.by_client} firstColLabel="顧客名" />
      <GroupTable title="研修テーマ別" rows={data.by_theme} firstColLabel="研修テーマ" />

      <div className="panel matrix">
        <h3>前年同月比較（売上・粗利・受注件数）</h3>
        {!y.prev_has_data && <div className="hint">※ 前年度（{fiscalYear - 1}年度）データがありません。</div>}
        <table>
          <thead>
            <tr>
              <th>月</th>
              <th className="num">当年売上</th><th className="num">前年売上</th><th className="num">売上前年比</th>
              <th className="num">当年粗利</th><th className="num">前年粗利</th>
              <th className="num">当年受注</th><th className="num">前年受注</th>
            </tr>
          </thead>
          <tbody>
            {y.labels.map((l, i) => (
              <tr key={l}>
                <td>{l}</td>
                <td className="num">{yen(y.sales_cur[i])}</td>
                <td className="num">{yen(y.sales_prev[i])}</td>
                <td className="num">{ratio(y.sales_cur[i], y.sales_prev[i])}</td>
                <td className="num">{yen(y.gross_cur[i])}</td>
                <td className="num">{yen(y.gross_prev[i])}</td>
                <td className="num">{y.orders_cur[i]}</td>
                <td className="num">{y.orders_prev[i]}</td>
              </tr>
            ))}
            <tr>
              <td><strong>年間累計</strong></td>
              <td className="num"><strong>{yen(y.total_sales_cur)}</strong></td>
              <td className="num"><strong>{yen(y.total_sales_prev)}</strong></td>
              <td className="num"><strong>{ratio(y.total_sales_cur, y.total_sales_prev)}</strong></td>
              <td className="num"><strong>{yen(y.total_gross_cur)}</strong></td>
              <td className="num"><strong>{yen(y.total_gross_prev)}</strong></td>
              <td className="num"><strong>{y.total_orders_cur}</strong></td>
              <td className="num"><strong>{y.total_orders_prev}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
