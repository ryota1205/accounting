import { useEffect, useState, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { ErrorState, Loading } from "../components/States";
import { api } from "../api/client";
import { DealInput, Master, MasterKind, PaymentStatus } from "../api/types";
import { previewTax, previewBilling } from "../lib/calc";
import { yen, pct } from "../lib/format";
import {
  PAYMENT_STATUS_LABELS, PAYMENT_STATUS_OPTIONS, PROJECT_STATUS_OPTIONS,
  CUSTOMER_TYPES, CONFIDENCE_RANKS,
} from "../lib/deal";

const EMPTY: DealInput = {
  held_on: "", client: "", agency: "", training_name: "", instructor: "",
  fee: 0, transport: 0, other: 0, tax: null, billing: null, instructor_fee: 0,
  payment_due: "", support_staff: "", note: "",
  project_name: "", training_theme: "", direct_cost: null, allocated_fixed_cost: 0,
  expected_sales_amount: 0, confidence_rank: null, project_status: "受注",
  customer_type: null, lost_reason: "", invoice_date: "", invoice_amount: null,
  paid_amount: 0, payment_status: "uninvoiced", paid_on: "",
};

// 実施日(YYYY-MM-DD)から売上計上月＝その月の月末日(YYYY-MM-DD)を求める。
// 集計・グラフは revenue_month で行うため、実施日変更時にこれを追従させる。
function monthEndOf(iso: string): string {
  if (!iso) return "";
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return "";
  const last = new Date(y, m, 0).getDate(); // m月0日 = m月の末日
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

// 金額入力（カンマ区切り）
function MoneyInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input type="text" inputMode="numeric" placeholder="0"
      value={value ? value.toLocaleString("ja-JP") : ""}
      onChange={(e) => {
        const d = e.target.value.replace(/[^\d]/g, "");
        onChange(d === "" ? 0 : parseInt(d, 10));
      }} />
  );
}

// 金額入力（未設定=null 可。直接原価・請求金額など）
function MoneyInputN({ value, onChange, placeholder }: {
  value: number | null | undefined; onChange: (n: number | null) => void; placeholder?: string;
}) {
  return (
    <input type="text" inputMode="numeric" placeholder={placeholder ?? "未設定"}
      value={value != null ? value.toLocaleString("ja-JP") : ""}
      onChange={(e) => {
        const d = e.target.value.replace(/[^\d]/g, "");
        onChange(d === "" ? null : parseInt(d, 10));
      }} />
  );
}

function MasterField({ kind, label, value, onChange, options, required }: {
  kind: MasterKind; label: string; value: string;
  onChange: (v: string) => void; options: Master[]; required?: boolean;
}) {
  return (
    <div className="field">
      <label className={required ? "req" : ""}>{label}</label>
      <input list={`list-${kind}`} value={value}
        onChange={(e) => onChange(e.target.value)} placeholder="選択または入力" />
      <datalist id={`list-${kind}`}>
        {options.map((o) => <option key={o.id} value={o.name} />)}
      </datalist>
    </div>
  );
}

export default function DealForm() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const [form, setForm] = useState<DealInput>(EMPTY);
  const [clients, setClients] = useState<Master[]>([]);
  const [instructors, setInstructors] = useState<Master[]>([]);
  const [agencies, setAgencies] = useState<Master[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 詳細項目の開閉（新規は閉じてシンプルに、編集は既存データが見えるよう開く）
  const [showDetails, setShowDetails] = useState(editing);

  useEffect(() => {
    api.listMasters("clients").then(setClients).catch(() => {});
    api.listMasters("instructors").then(setInstructors).catch(() => {});
    api.listMasters("agencies").then(setAgencies).catch(() => {});
    api.listConfidenceRates()
      .then((rs) => setRates(Object.fromEntries(rs.map((r) => [r.rank, r.rate]))))
      .catch(() => {});
    if (editing) {
      api.getDeal(Number(id)).then((d) => {
        setForm({
          held_on: d.held_on, client: d.client, revenue_month: d.revenue_month,
          agency: d.agency ?? "", training_name: d.training_name ?? "",
          instructor: d.instructor ?? "", fee: d.fee, transport: d.transport,
          other: d.other, tax: null, billing: null,
          instructor_fee: d.instructor_fee, payment_due: d.payment_due ?? "",
          support_staff: d.support_staff ?? "", note: d.note ?? "",
          project_name: d.project_name ?? "", training_theme: d.training_theme ?? "",
          direct_cost: d.direct_cost, allocated_fixed_cost: d.allocated_fixed_cost,
          expected_sales_amount: d.expected_sales_amount, confidence_rank: d.confidence_rank,
          project_status: d.project_status, customer_type: d.customer_type,
          lost_reason: d.lost_reason ?? "", invoice_date: d.invoice_date ?? "",
          invoice_amount: d.invoice_amount, paid_amount: d.paid_amount,
          payment_status: d.payment_status, paid_on: d.paid_on ?? "",
        });
      }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    }
  }, [id]);

  const set = (k: keyof DealInput, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  // 自動計算プレビュー
  const taxShown = previewTax(form.fee);
  const billingShown = previewBilling(form.fee, form.transport, form.other, taxShown);
  const sales = form.fee + form.transport + form.other;
  const cost = form.direct_cost ?? form.instructor_fee;
  const gross = sales - cost;
  const grossRate = sales ? gross / sales : 0;
  const opProfit = gross - (form.allocated_fixed_cost ?? 0);
  const weighted = Math.round((form.expected_sales_amount ?? 0) *
    (form.confidence_rank ? rates[form.confidence_rank] ?? 0 : 0));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.held_on) { setError("実施日を入力してください"); return; }
    if (!form.client.trim()) { setError("企業名を入力してください"); return; }
    setSaving(true); setError(null);
    const clean = (v: string | null | undefined) => (v && v.trim() !== "" ? v.trim() : null);
    const payload: DealInput = {
      ...form,
      agency: clean(form.agency), training_name: clean(form.training_name),
      instructor: clean(form.instructor), support_staff: clean(form.support_staff),
      note: clean(form.note), payment_due: clean(form.payment_due),
      revenue_month: clean(form.revenue_month), project_name: clean(form.project_name),
      training_theme: clean(form.training_theme), lost_reason: clean(form.lost_reason),
      invoice_date: clean(form.invoice_date), paid_on: clean(form.paid_on),
    };
    try {
      if (editing) await api.updateDeal(Number(id), payload);
      else await api.createDeal(payload);
      navigate("/deals");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout title="案件編集"><Loading /></Layout>;

  return (
    <Layout title={editing ? "案件編集" : "案件登録"}>
      {error && <ErrorState message={error} />}
      <form className="panel dealform" onSubmit={submit}>
        <h3>基本情報</h3>
        <div className="form-grid">
          <MasterField kind="clients" label="顧客名（企業名）" value={form.client} required
            onChange={(v) => {
              const c = clients.find((x) => x.name === v);
              setForm((f) => ({ ...f, client: v, agency: c?.agency ? c.agency : f.agency }));
            }} options={clients} />
          <div className="field">
            <label>研修テーマ</label>
            <input value={form.training_theme ?? ""} onChange={(e) => set("training_theme", e.target.value)} />
          </div>
          <MasterField kind="instructors" label="講師" value={form.instructor ?? ""}
            onChange={(v) => set("instructor", v)} options={instructors} />
          <div className="field"><label className="req">実施予定日</label>
            <input type="date" value={form.held_on}
              onChange={(e) => setForm((f) => ({
                ...f, held_on: e.target.value, revenue_month: monthEndOf(e.target.value),
              }))} />
            <span className="hint">売上計上月＝実施日の月末で自動集計します</span></div>
          <div className="field"><label>研修費用</label>
            <MoneyInput value={form.fee} onChange={(n) => set("fee", n)} /></div>
          <div className="field"><label>講師料</label>
            <MoneyInput value={form.instructor_fee} onChange={(n) => set("instructor_fee", n)} /></div>
          <div className="field"><label>案件ステータス</label>
            <select value={form.project_status} onChange={(e) => set("project_status", e.target.value)}>
              {PROJECT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
        </div>

        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn sub sm" onClick={() => setShowDetails((v) => !v)}>
            {showDetails ? "詳細を閉じる ▴" : "詳細を入力 ▾"}
          </button>
        </div>

        {showDetails && (
          <>
            <h3 style={{ marginTop: 18 }}>案件情報（詳細）</h3>
            <div className="form-grid">
              <MasterField kind="agencies" label="代理店" value={form.agency ?? ""}
                onChange={(v) => set("agency", v)} options={agencies} />
              <div className="field">
                <label>案件名</label>
                <input value={form.project_name ?? ""} onChange={(e) => set("project_name", e.target.value)} />
              </div>
              <div className="field">
                <label>研修名</label>
                <input value={form.training_name ?? ""} onChange={(e) => set("training_name", e.target.value)} />
              </div>
              <div className="field">
                <label>サポートスタッフ</label>
                <input value={form.support_staff ?? ""} onChange={(e) => set("support_staff", e.target.value)} />
              </div>
              <div className="field">
                <label>新規／既存／リピート</label>
                <select value={form.customer_type ?? ""}
                  onChange={(e) => set("customer_type", e.target.value || null)}>
                  <option value="">（未設定＝自動判定）</option>
                  {CUSTOMER_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="hint">未設定なら保存時に企業×研修テーマで自動判定（新規/既存/リピート）。手動選択時はその値を優先。</span>
              </div>
            </div>

            <h3 style={{ marginTop: 18 }}>金額（詳細）</h3>
            <div className="form-grid">
              <div className="field"><label>交通費</label>
                <MoneyInput value={form.transport} onChange={(n) => set("transport", n)} /></div>
              <div className="field"><label>その他</label>
                <MoneyInput value={form.other} onChange={(n) => set("other", n)} /></div>
              <div className="field"><label>直接原価</label>
                <MoneyInputN value={form.direct_cost} onChange={(n) => set("direct_cost", n)}
                  placeholder="未設定=講師料を使用" />
                <span className="hint">未入力なら講師料を原価として使用</span></div>
              <div className="field"><label>固定費配賦額</label>
                <MoneyInput value={form.allocated_fixed_cost} onChange={(n) => set("allocated_fixed_cost", n)} /></div>
              <div className="field"><label>見込み売上</label>
                <MoneyInput value={form.expected_sales_amount} onChange={(n) => set("expected_sales_amount", n)} /></div>
            </div>

            <h3 style={{ marginTop: 18 }}>受注確度</h3>
            <div className="form-grid">
              <div className="field"><label>受注確度</label>
                <select value={form.confidence_rank ?? ""}
                  onChange={(e) => set("confidence_rank", (e.target.value || null))}>
                  <option value="">（未設定）</option>
                  {CONFIDENCE_RANKS.map((r) => (
                    <option key={r} value={r}>{r}（{Math.round((rates[r] ?? 0) * 100)}%）</option>
                  ))}
                </select></div>
              <div className="field"><label>失注理由</label>
                <input value={form.lost_reason ?? ""} onChange={(e) => set("lost_reason", e.target.value)} /></div>
            </div>

            <h3 style={{ marginTop: 18 }}>日程・入金</h3>
            <div className="form-grid">
              <div className="field"><label>請求日</label>
                <input type="date" value={form.invoice_date ?? ""} onChange={(e) => set("invoice_date", e.target.value)} /></div>
              <div className="field"><label>入金予定日</label>
                <input type="date" value={form.payment_due ?? ""} onChange={(e) => set("payment_due", e.target.value)} /></div>
              <div className="field"><label>入金日</label>
                <input type="date" value={form.paid_on ?? ""} onChange={(e) => set("paid_on", e.target.value)} /></div>
              <div className="field"><label>入金ステータス</label>
                <select value={form.payment_status}
                  onChange={(e) => set("payment_status", e.target.value as PaymentStatus)}>
                  {PAYMENT_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>
                  ))}
                </select></div>
              <div className="field"><label>請求金額</label>
                <MoneyInputN value={form.invoice_amount} onChange={(n) => set("invoice_amount", n)}
                  placeholder="未設定=請求額を使用" /></div>
              <div className="field"><label>入金済金額</label>
                <MoneyInput value={form.paid_amount} onChange={(n) => set("paid_amount", n)} /></div>
              <div className="field"><label>備考</label>
                <input value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} /></div>
            </div>
          </>
        )}

        <h3 style={{ marginTop: 18 }}>自動計算</h3>
        <div className="cards">
          <div className="card"><div className="label">消費税</div><div className="value">{yen(taxShown)}</div></div>
          <div className="card"><div className="label">請求額</div><div className="value">{yen(billingShown)}</div></div>
          <div className="card"><div className="label">売上金額(税抜)</div><div className="value">{yen(sales)}</div></div>
          <div className="card"><div className="label">粗利額</div><div className="value">{yen(gross)}</div></div>
          <div className="card"><div className="label">粗利率</div><div className="value">{pct(grossRate)}</div></div>
          <div className="card"><div className="label">営業利益見込み</div><div className="value">{yen(opProfit)}</div></div>
          <div className="card"><div className="label">確度加重後見込み</div><div className="value">{yen(weighted)}</div></div>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button className="btn" type="submit" disabled={saving}>{saving ? "保存中…" : "保存"}</button>
          <button className="btn sub" type="button" onClick={() => navigate("/deals")}>取消</button>
        </div>
      </form>
    </Layout>
  );
}
