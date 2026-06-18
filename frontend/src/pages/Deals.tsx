import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { Deal } from "../api/types";
import { yen } from "../lib/format";

export default function Deals() {
  const { fiscalYear } = useFiscalYear();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

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
      <div className="panel matrix">
        <div style={{ textAlign: "left", fontWeight: 700, fontSize: 26, marginBottom: 12 }}>
          {fiscalYear}年度
        </div>
        {error ? <ErrorState message={error} />
          : rows === null ? <Loading />
          : rows.length === 0 ? <Empty />
          : (
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "center" }}>売上月</th>
                <th style={{ textAlign: "center" }}>実施日</th>
                <th>企業名</th><th>研修名</th><th>講師</th>
                <th className="num">研修費用</th><th className="num">請求額</th>
                <th style={{ textAlign: "center" }}>入金予定</th><th>入金</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td style={{ textAlign: "center" }}>{parseInt(d.revenue_month.slice(5, 7), 10)}</td>
                  <td style={{ textAlign: "center" }}>{d.held_on.slice(5)}</td>
                  <td>{d.client}</td>
                  <td>{d.training_name ?? "—"}</td>
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
        )}
      </div>
    </Layout>
  );
}
