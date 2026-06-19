import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { useAlerts } from "../context/AlertsContext";
import { api } from "../api/client";
import { Deal } from "../api/types";
import { yen } from "../lib/format";
import {
  PAYMENT_STATUS_LABELS, ALERT_LABELS, AlertKind,
  invoiceAmount, unpaidAmount, paymentDelayDays, paymentAlert,
} from "../lib/deal";

export default function Payments() {
  const { fiscalYear } = useFiscalYear();
  const { refresh: refreshAlerts } = useAlerts();
  const [rows, setRows] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pStatus, setPStatus] = useState("");
  const [alertFilter, setAlertFilter] = useState("");
  const [sortBy, setSortBy] = useState<"due" | "delay">("due");

  const today = new Date();

  function load() {
    setRows(null); setError(null);
    api.listDeals({ fiscal_year: fiscalYear }).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, [fiscalYear]);

  async function pay(id: number) {
    await api.markPaid(id);
    load();
    refreshAlerts();
  }

  let list = (rows ?? []).filter((d) => d.payment_status !== "paid");
  if (pStatus) list = list.filter((d) => d.payment_status === pStatus);
  if (alertFilter) list = list.filter((d) => paymentAlert(d, today) === alertFilter);
  list = [...list].sort((a, b) => {
    if (sortBy === "delay") return paymentDelayDays(b, today) - paymentDelayDays(a, today);
    return (a.payment_due ?? "9999").localeCompare(b.payment_due ?? "9999");
  });

  const unpaidTotal = list.reduce((s, d) => s + unpaidAmount(d), 0);
  const overdueTotal = list
    .filter((d) => ["overdue", "long_overdue"].includes(paymentAlert(d, today)))
    .reduce((s, d) => s + unpaidAmount(d), 0);

  return (
    <Layout title="入金管理"
      actions={
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "due" | "delay")}>
          <option value="due">入金予定日が近い順</option>
          <option value="delay">遅延日数が大きい順</option>
        </select>
      }>
      <div className="cards">
        <div className="card"><div className="label">未入金総額</div><div className="value">{yen(unpaidTotal)}</div>
          <div className="label">{list.length}件</div></div>
        <div className="card"><div className="label err">遅延中の未入金総額</div>
          <div className="value err">{yen(overdueTotal)}</div></div>
      </div>
      <div className="panel" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select style={{ fontSize: 13 }} value={pStatus} onChange={(e) => setPStatus(e.target.value)}>
          <option value="">入金状況: 全て（未入金のみ）</option>
          {Object.entries(PAYMENT_STATUS_LABELS).filter(([k]) => k !== "paid")
            .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select style={{ fontSize: 13 }} value={alertFilter} onChange={(e) => setAlertFilter(e.target.value)}>
          <option value="">アラート: 全て</option>
          {(["due_soon", "overdue", "long_overdue", "partial_remain"] as AlertKind[]).map((a) =>
            <option key={a} value={a}>{ALERT_LABELS[a]}</option>)}
        </select>
      </div>
      <div className="panel matrix">
        {error ? <ErrorState message={error} />
          : rows === null ? <Loading />
          : list.length === 0 ? <Empty label="未入金の案件はありません" />
          : (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "center" }}>入金予定日</th>
                <th style={{ maxWidth: 150 }}>顧客名</th><th>研修</th>
                <th className="num">請求金額</th><th className="num">入金済</th><th className="num">未入金</th>
                <th style={{ textAlign: "center" }}>遅延日数</th><th style={{ textAlign: "center" }}>アラート</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const a = paymentAlert(d, today);
                const delay = paymentDelayDays(d, today);
                return (
                  <tr key={d.id}>
                    <td style={{ textAlign: "center" }}>{d.payment_due ?? "—"}</td>
                    <td style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }} title={d.client}>{d.client}</td>
                    <td>{d.training_theme ?? d.training_name ?? "—"}</td>
                    <td className="num">{yen(invoiceAmount(d))}</td>
                    <td className="num">{yen(d.paid_amount)}</td>
                    <td className="num">{yen(unpaidAmount(d))}</td>
                    <td style={{ textAlign: "center" }}>{delay > 0 ? `${delay}日` : "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      {a === "normal" ? "—" : <span className={`badge alert ${a}`}>{ALERT_LABELS[a]}</span>}
                    </td>
                    <td><button className="btn sm" onClick={() => pay(d.id)}>入金済みにする</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
