import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { Deal } from "../api/types";
import { yen } from "../lib/format";

export default function Payments() {
  const { fiscalYear } = useFiscalYear();
  const [status, setStatus] = useState("unpaid");
  const [rows, setRows] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setRows(null); setError(null);
    api.listPayments(status, fiscalYear).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, [status, fiscalYear]);

  async function pay(id: number) {
    await api.markPaid(id);
    load();
  }

  const total = rows?.reduce((s, d) => s + d.billing, 0) ?? 0;

  return (
    <Layout title="入金管理"
      actions={
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="unpaid">未入金</option>
          <option value="paid">入金済</option>
        </select>
      }>
      <div className="cards">
        <div className="card"><div className="label">{status === "unpaid" ? "未入金" : "入金済"} 合計</div>
          <div className="value">{yen(total)}</div>
          <div className="label">{rows?.length ?? 0}件</div></div>
      </div>
      <div className="panel matrix">
        {error ? <ErrorState message={error} />
          : rows === null ? <Loading />
          : rows.length === 0 ? <Empty label="該当する案件はありません" />
          : (
          <table>
            <thead>
              <tr>
                <th>入金予定日</th><th>企業名</th><th>研修名</th>
                <th className="num">請求額</th><th>入金日</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{d.payment_due ?? "—"}</td>
                  <td>{d.client}</td>
                  <td>{d.training_name ?? "—"}</td>
                  <td className="num">{yen(d.billing)}</td>
                  <td>{d.paid_on ?? "—"}</td>
                  <td>{d.payment_status === "unpaid" &&
                    <button className="btn sm" onClick={() => pay(d.id)}>入金済みにする</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
