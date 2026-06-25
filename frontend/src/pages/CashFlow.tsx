import { useEffect, useState } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Layout } from "../components/Layout";
import { Loading, ErrorState } from "../components/States";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";
import { PaymentItem, CashFlowSummary } from "../api/types";
import { yen, man } from "../lib/format";

// 年度の i 番目（0=4月 … 11=翌3月）の "YYYY-MM" を返す
function ymOf(fy: number, i: number): string {
  const m = ((3 + i) % 12) + 1;
  const y = m >= 4 ? fy : fy + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

const MONTH_LABELS = ["4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月"];

export default function CashFlow() {
  const { fiscalYear } = useFiscalYear();
  const [items, setItems] = useState<PaymentItem[]>([]);
  // grid[itemId][i] = 金額（文字列で保持し、入力中の空欄を許容）
  const [grid, setGrid] = useState<Record<number, string[]>>({});
  const [opening, setOpening] = useState<string>("");
  const [basis, setBasis] = useState<"billing" | "paid">("billing");
  const [cf, setCf] = useState<CashFlowSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingMsg, setSavingMsg] = useState("");

  function loadGrid(its: PaymentItem[], amounts: Record<string, Record<string, number>>) {
    const g: Record<number, string[]> = {};
    its.forEach((it) => {
      g[it.id] = Array.from({ length: 12 }, (_, i) => {
        const v = amounts[String(it.id)]?.[ymOf(fiscalYear, i)] ?? 0;
        return v ? String(v) : "";
      });
    });
    setGrid(g);
  }

  function reload() {
    setError(null);
    Promise.all([
      api.listPaymentItems(),
      api.getSchedule(fiscalYear),
      api.getSetting(fiscalYear),
      api.cashflow(fiscalYear, basis),
    ])
      .then(([its, sched, setting, summary]) => {
        setItems(its);
        loadGrid(its, sched.amounts);
        setOpening(setting.opening_balance ? String(setting.opening_balance) : "");
        setCf(summary);
      })
      .catch((e) => setError((e as Error).message));
  }
  useEffect(reload, [fiscalYear]);

  // basis 切替時は推移だけ取り直す（入力中のgridは保持）
  useEffect(() => {
    api.cashflow(fiscalYear, basis).then(setCf).catch((e) => setError((e as Error).message));
  }, [basis, fiscalYear]);

  const num = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

  function setCell(itemId: number, i: number, value: string) {
    setGrid((prev) => {
      const row = [...(prev[itemId] ?? Array(12).fill(""))];
      row[i] = value;
      return { ...prev, [itemId]: row };
    });
  }

  async function saveOpening() {
    setSavingMsg("保存中…");
    try {
      await api.putOpeningBalance(fiscalYear, num(opening));
      setSavingMsg("期首残高を保存しました");
      const summary = await api.cashflow(fiscalYear, basis);
      setCf(summary);
    } catch (e) { setSavingMsg(""); setError((e as Error).message); }
  }

  async function saveSchedule() {
    setSavingMsg("保存中…");
    try {
      const cells = items.flatMap((it) =>
        (grid[it.id] ?? Array(12).fill("")).map((s, i) => ({
          item_id: it.id, ym: ymOf(fiscalYear, i), amount: num(s),
        })),
      );
      await api.putSchedule(fiscalYear, cells);
      setSavingMsg("大型支払いを保存しました");
      const summary = await api.cashflow(fiscalYear, basis);
      setCf(summary);
    } catch (e) { setSavingMsg(""); setError((e as Error).message); }
  }

  async function addItem() {
    const name = window.prompt("追加する項目名を入力してください（例: 法人税）");
    if (!name) return;
    try { await api.createPaymentItem(name.trim()); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function renameItem(it: PaymentItem) {
    const name = window.prompt("項目名を変更", it.name);
    if (!name || name.trim() === it.name) return;
    try { await api.updatePaymentItem(it.id, name.trim()); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function removeItem(it: PaymentItem) {
    const hasAmount = (grid[it.id] ?? []).some((s) => num(s) > 0);
    const msg = hasAmount
      ? `「${it.name}」には金額が入力されています。削除しますか？（推移には反映されなくなります）`
      : `「${it.name}」を削除しますか？`;
    if (!window.confirm(msg)) return;
    try { await api.deletePaymentItem(it.id); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  if (error) return <Layout title="資金繰り"><ErrorState message={error} /></Layout>;
  if (!cf) return <Layout title="資金繰り"><Loading /></Layout>;

  const colTotal = (i: number) => items.reduce((s, it) => s + num((grid[it.id] ?? [])[i] ?? ""), 0);
  const rowTotal = (itemId: number) => (grid[itemId] ?? []).reduce((s, v) => s + num(v), 0);
  const grand = items.reduce((s, it) => s + rowTotal(it.id), 0);

  const chartData = MONTH_LABELS.map((l, i) => ({
    name: l, 累計残高: cf.balance[i], 大型支払い: cf.big_payment[i],
  }));

  return (
    <Layout title="資金繰り">
      {/* 期首残高 */}
      <div className="panel" style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 20 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>期首残高（年度開始時点の手元資金）</label>
          <input type="text" inputMode="numeric" style={{ fontSize: 13 }}
            value={opening ? Number(num(opening)).toLocaleString("ja-JP") : ""}
            onChange={(e) => setOpening(e.target.value)} placeholder="0" />
        </div>
        <button className="btn" onClick={saveOpening}>期首残高を保存</button>
        <span className="hint">{savingMsg}</span>
      </div>

      {/* 大型支払い表 */}
      <div className="panel matrix flush">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px" }}>
          <h3 style={{ margin: 0 }}>年間の大型支払い（税・社会保険など）</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sub sm" onClick={addItem}>＋ 項目を追加</button>
            <button className="btn" onClick={saveSchedule}>まとめて保存</button>
          </div>
        </div>
        <table className="cashflow-table">
          <thead>
            <tr>
              <th style={{ whiteSpace: "nowrap" }}>項目</th>
              {MONTH_LABELS.map((l) => <th key={l} className="num">{l}</th>)}
              <th className="num">合計</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {it.name}
                  <span className="row-actions">
                    <button className="link-btn" title="名称変更" onClick={() => renameItem(it)}>✎</button>
                    <button className="link-btn danger" title="削除" onClick={() => removeItem(it)}>🗑</button>
                  </span>
                </td>
                {Array.from({ length: 12 }, (_, i) => (
                  <td key={i} className="num">
                    <input className="cell-input" type="text" inputMode="numeric"
                      value={(grid[it.id] ?? [])[i] ? Number(num((grid[it.id] ?? [])[i])).toLocaleString("ja-JP") : ""}
                      onChange={(e) => setCell(it.id, i, e.target.value)} placeholder="—" />
                  </td>
                ))}
                <td className="num"><strong>{yen(rowTotal(it.id))}</strong></td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={14} className="hint" style={{ padding: 16 }}>
                項目がありません。「＋ 項目を追加」で消費税・社会保険料などを登録してください。
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>月計</th>
              {Array.from({ length: 12 }, (_, i) => <th key={i} className="num">{yen(colTotal(i))}</th>)}
              <th className="num">{yen(grand)}</th>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 資金残高の推移 */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>資金残高の推移</h3>
          <div className="seg">
            <button className={basis === "billing" ? "active" : ""} onClick={() => setBasis("billing")}>請求ベース</button>
            <button className={basis === "paid" ? "active" : ""} onClick={() => setBasis("paid")}>入金ベース</button>
          </div>
        </div>
        <div className="hint" style={{ marginBottom: 10, fontSize: 11 }}>
          残高 = 期首残高 ＋ 各月の（入金 − 大型支払い − 固定費 − 原価）の累計。
          固定費・原価は支払時期データが無いため売上月で概算。
          {cf.undated_inflow > 0 && `　※入金日未入力の入金 ${yen(cf.undated_inflow)} は推移に未反映。`}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} padding={{ left: 12, right: 12 }} />
            <YAxis tickFormatter={man} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => yen(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 2" />
            <Bar dataKey="大型支払い" fill="#f59e0b" />
            <Line dataKey="累計残高" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 内訳テーブル */}
      <div className="panel matrix flush">
        <table className="cashflow-table">
          <thead>
            <tr><th>　</th>{MONTH_LABELS.map((l) => <th key={l} className="num">{l}</th>)}</tr>
          </thead>
          <tbody>
            <tr><td>入金(+)</td>{cf.inflow.map((v, i) => <td key={i} className="num">{v ? yen(v) : "—"}</td>)}</tr>
            <tr><td>固定費(−)</td>{cf.fixed_cost.map((v, i) => <td key={i} className="num">{v ? yen(v) : "—"}</td>)}</tr>
            <tr><td>原価(−)</td>{cf.cost.map((v, i) => <td key={i} className="num">{v ? yen(v) : "—"}</td>)}</tr>
            <tr><td>大型支払(−)</td>{cf.big_payment.map((v, i) => (
              <td key={i} className="num" style={{ color: v ? "var(--danger)" : undefined }}>{v ? yen(v) : "—"}</td>
            ))}</tr>
            <tr><td>月次収支</td>{cf.net.map((v, i) => (
              <td key={i} className="num" style={{ color: v < 0 ? "var(--danger)" : "var(--ok)" }}>{yen(v)}</td>
            ))}</tr>
            <tr><td><strong>累計残高</strong></td>{cf.balance.map((v, i) => (
              <td key={i} className="num"><strong style={{ color: v < 0 ? "var(--danger)" : undefined }}>{yen(v)}</strong></td>
            ))}</tr>
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
