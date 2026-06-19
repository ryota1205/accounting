import { useEffect, useRef, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { Deal } from "../api/types";
import { yen, pct } from "../lib/format";
import {
  PAYMENT_STATUS_LABELS, PROJECT_STATUS_OPTIONS, ALERT_LABELS, AlertKind,
  salesAmount, grossProfit, grossMarginRate, invoiceAmount, unpaidAmount,
  paymentDelayDays, paymentAlert,
} from "../lib/deal";

type Ctx = { today: Date };
type Col = {
  key: string; label: string; align?: "center" | "num";
  render: (d: Deal, c: Ctx) => ReactNode;
  sort?: (d: Deal, c: Ctx) => number | string;
};

const mmdd = (s: string | null) => (s ? s.slice(5) : "—");

const COLS: Col[] = [
  { key: "held_on", label: "実施予定", align: "center", render: (d) => mmdd(d.held_on), sort: (d) => d.held_on },
  { key: "client", label: "顧客名", render: (d) => d.client, sort: (d) => d.client },
  { key: "training_theme", label: "研修テーマ", render: (d) => d.training_theme ?? d.training_name ?? "—", sort: (d) => d.training_theme ?? "" },
  { key: "sales", label: "売上(税抜)", align: "num", render: (d) => yen(salesAmount(d)), sort: (d) => salesAmount(d) },
  { key: "gross", label: "粗利", align: "num", render: (d) => yen(grossProfit(d)), sort: (d) => grossProfit(d) },
  { key: "grossRate", label: "粗利率", align: "num", render: (d) => pct(grossMarginRate(d)), sort: (d) => grossMarginRate(d) },
  { key: "project_status", label: "案件状況", align: "center", render: (d) => d.project_status, sort: (d) => d.project_status },
  { key: "confidence", label: "確度", align: "center", render: (d) => d.confidence_rank ?? "—", sort: (d) => d.confidence_rank ?? "" },
  {
    key: "payment_status", label: "入金状況", align: "center",
    render: (d) => <span className={`badge pay ${d.payment_status}`}>{PAYMENT_STATUS_LABELS[d.payment_status]}</span>,
    sort: (d) => d.payment_status,
  },
  { key: "invoice", label: "請求金額", align: "num", render: (d) => yen(invoiceAmount(d)), sort: (d) => invoiceAmount(d) },
  { key: "paid", label: "入金済", align: "num", render: (d) => yen(d.paid_amount), sort: (d) => d.paid_amount },
  { key: "unpaid", label: "未入金", align: "num", render: (d) => yen(unpaidAmount(d)), sort: (d) => unpaidAmount(d) },
  { key: "payment_due", label: "入金予定", align: "center", render: (d) => mmdd(d.payment_due), sort: (d) => d.payment_due ?? "" },
  {
    key: "delay", label: "遅延日数", align: "num",
    render: (d, c) => { const n = paymentDelayDays(d, c.today); return n > 0 ? `${n}日` : "—"; },
    sort: (d, c) => paymentDelayDays(d, c.today),
  },
  {
    key: "alert", label: "入金アラート", align: "center",
    render: (d, c) => { const a = paymentAlert(d, c.today); return a === "normal" ? "—" : <span className={`badge alert ${a}`}>{ALERT_LABELS[a]}</span>; },
    sort: (d, c) => paymentAlert(d, c.today),
  },
];

export default function Deals() {
  const { fiscalYear } = useFiscalYear();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("");
  const [projStatus, setProjStatus] = useState("");
  const [pStatus, setPStatus] = useState("");
  const [alertFilter, setAlertFilter] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [maxH, setMaxH] = useState(500);

  const today = new Date();
  const ctx: Ctx = { today };

  function load() {
    setRows(null); setError(null);
    api.listDeals({ fiscal_year: fiscalYear, q: q || undefined })
      .then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, [fiscalYear]);

  useEffect(() => {
    function recompute() {
      const el = scrollRef.current;
      if (!el) return;
      setMaxH(Math.max(240, window.innerHeight - el.getBoundingClientRect().top - 44));
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [rows]);

  async function remove(id: number) {
    if (!window.confirm("この案件を削除しますか？")) return;
    await api.deleteDeal(id);
    load();
  }

  function toggleSort(key: string) {
    setSort((p) => (p && p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  // 絞り込み（クライアント側）
  let filtered = rows ?? [];
  if (month) filtered = filtered.filter((d) => d.revenue_month.slice(5, 7) === month.padStart(2, "0"));
  if (projStatus) filtered = filtered.filter((d) => d.project_status === projStatus);
  if (pStatus) filtered = filtered.filter((d) => d.payment_status === pStatus);
  if (alertFilter) filtered = filtered.filter((d) => paymentAlert(d, today) === alertFilter);

  // ソート
  let display = filtered;
  if (sort) {
    const col = COLS.find((c) => c.key === sort.key);
    if (col?.sort) {
      const mul = sort.dir === "asc" ? 1 : -1;
      display = [...filtered].sort((a, b) => {
        const av = col.sort!(a, ctx); const bv = col.sort!(b, ctx);
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
        return String(av).localeCompare(String(bv), "ja") * mul;
      });
    }
  }

  return (
    <Layout title="案件一覧"
      actions={<button className="btn" onClick={() => navigate("/deals/new")}>＋ 案件登録</button>}>
      <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input style={{ fontSize: 13, flex: 1, minWidth: 220 }} placeholder="顧客・案件・研修・講師で検索" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <select style={{ fontSize: 13 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">月: 全て</option>
          {[4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((m) => <option key={m} value={m}>{m}月</option>)}
        </select>
        <select style={{ fontSize: 13 }} value={projStatus} onChange={(e) => setProjStatus(e.target.value)}>
          <option value="">案件: 全て</option>
          {PROJECT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ fontSize: 13 }} value={pStatus} onChange={(e) => setPStatus(e.target.value)}>
          <option value="">入金: 全て</option>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select style={{ fontSize: 13 }} value={alertFilter} onChange={(e) => setAlertFilter(e.target.value)}>
          <option value="">アラート: 全て</option>
          {(["due_soon", "overdue", "long_overdue", "partial_remain"] as AlertKind[]).map((a) =>
            <option key={a} value={a}>{ALERT_LABELS[a]}</option>)}
        </select>
        <button className="btn sub sm" onClick={load}>検索</button>
      </div>
      <div className="panel">
        <div style={{ textAlign: "left", fontWeight: 700, fontSize: 26, marginBottom: 12 }}>{fiscalYear}年度</div>
        {error ? <ErrorState message={error} />
          : rows === null ? <Loading />
          : display.length === 0 ? <Empty />
          : (
          <div ref={scrollRef} className="table-scroll" style={{ maxHeight: maxH }}>
            <table className="sticky-head deals-grid">
              <thead>
                <tr>
                  {COLS.map((c, i) => (
                    <th key={c.key}
                      className={[c.align === "num" ? "num" : "", i < 2 ? `stickL stickL${i}` : ""].filter(Boolean).join(" ") || undefined}
                      style={{ textAlign: c.align === "center" ? "center" : undefined, cursor: c.sort ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}
                      onClick={() => c.sort && toggleSort(c.key)}>
                      {c.label}
                      {c.sort && <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 3 }}>
                        {sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>}
                    </th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {display.map((d) => (
                  <tr key={d.id}>
                    {COLS.map((c, i) => (
                      <td key={c.key}
                        className={[c.align === "num" ? "num" : "", i < 2 ? `stickL stickL${i}` : ""].filter(Boolean).join(" ") || undefined}
                        style={{ textAlign: c.align === "center" ? "center" : undefined }}>
                        {c.render(d, ctx)}
                      </td>
                    ))}
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
