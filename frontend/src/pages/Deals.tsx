import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { Deal } from "../api/types";
import { yen } from "../lib/format";

type SortKey = "revenue_month" | "held_on" | "client" | "training_name" | "instructor" | "payment_status";

export default function Deals() {
  const { fiscalYear } = useFiscalYear();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [maxH, setMaxH] = useState(500);

  // テーブルのスクロール領域を画面内に収める高さに調整（横スクロールバーを常に表示）
  useEffect(() => {
    function recompute() {
      const el = scrollRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setMaxH(Math.max(240, window.innerHeight - top - 44));
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [rows]);

  function toggleSort(key: SortKey) {
    setSort((p) => (p && p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function load() {
    setRows(null); setError(null);
    api.listDeals({ fiscal_year: fiscalYear, payment_status: status || undefined, q: q || undefined })
      .then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, [fiscalYear, status]);

  async function remove(id: number) {
    if (!window.confirm("この案件を削除しますか？")) return;
    await api.deleteDeal(id);
    load();
  }

  const sortedRows = rows && sort
    ? [...rows].sort((a, b) => {
        const mul = sort.dir === "asc" ? 1 : -1;
        return String(a[sort.key] ?? "").localeCompare(String(b[sort.key] ?? ""), "ja") * mul;
      })
    : rows;

  const sortTh = (key: SortKey, label: string, align: "left" | "center" = "left") => (
    <th
      style={{ textAlign: align, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => toggleSort(key)}
    >
      {label}
      <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 3 }}>
        {sort?.key === key ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </th>
  );

  return (
    <Layout title="案件一覧"
      actions={<button className="btn" onClick={() => navigate("/deals/new")}>＋ 案件登録</button>}>
      <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input style={{ fontSize: 13, flex: 1 }} placeholder="企業・研修・講師で検索" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()} />
        <select style={{ fontSize: 13 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">入金: すべて</option>
          <option value="unpaid">未入金</option>
          <option value="paid">入金済</option>
        </select>
        <button className="btn sub sm" onClick={load}>検索</button>
      </div>
      <div className="panel">
        <div style={{ textAlign: "left", fontWeight: 700, fontSize: 26, marginBottom: 12 }}>
          {fiscalYear}年度
        </div>
        {error ? <ErrorState message={error} />
          : rows === null ? <Loading />
          : rows.length === 0 ? <Empty />
          : (
          <div ref={scrollRef} className="table-scroll" style={{ maxHeight: maxH }}>
          <table className="sticky-head">
            <thead>
              <tr>
                {sortTh("revenue_month", "売上月", "center")}
                {sortTh("held_on", "実施日", "center")}
                {sortTh("client", "企業名")}
                {sortTh("training_name", "研修名")}
                {sortTh("instructor", "講師")}
                <th className="num">研修費用</th><th className="num">請求額</th>
                <th style={{ textAlign: "center" }}>入金予定</th>
                {sortTh("payment_status", "入金", "center")}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows!.map((d) => (
                <tr key={d.id}>
                  <td style={{ textAlign: "center" }}>{parseInt(d.revenue_month.slice(5, 7), 10)}</td>
                  <td style={{ textAlign: "center" }}>{d.held_on.slice(5)}</td>
                  <td className="cell-wrap" style={{ maxWidth: 220 }}>{d.client}</td>
                  <td className="cell-wrap" style={{ maxWidth: 200 }}>{d.training_name ?? "—"}</td>
                  <td>{d.instructor ?? "—"}</td>
                  <td className="num">{yen(d.fee)}</td>
                  <td className="num">{yen(d.billing)}</td>
                  <td style={{ textAlign: "center" }}>{d.payment_due ? d.payment_due.slice(5) : "—"}</td>
                  <td><span className={`badge ${d.payment_status}`}>
                    {d.payment_status === "paid" ? "入金済" : "未入金"}</span></td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn sub sm" onClick={() => navigate(`/deals/${d.id}/edit`)}>編集</button>
                    <button className="btn sub sm" onClick={() => remove(d.id)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
