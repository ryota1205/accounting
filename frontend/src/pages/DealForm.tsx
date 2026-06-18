import { useEffect, useState, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { ErrorState, Loading } from "../components/States";
import { api } from "../api/client";
import { DealInput, Master, MasterKind } from "../api/types";
import { previewTax, previewBilling } from "../lib/calc";
import { yen } from "../lib/format";

const EMPTY: DealInput = {
  held_on: "", client: "", agency: "", training_name: "", instructor: "",
  fee: 0, transport: 0, other: 0, tax: null, billing: null,
  instructor_fee: 0, payment_due: "", support_staff: "", note: "",
};

// 金額入力（3桁カンマ区切り表示）
function MoneyInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value ? value.toLocaleString("ja-JP") : ""}
      placeholder="0"
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onChange(digits === "" ? 0 : parseInt(digits, 10));
      }}
    />
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
        onChange={(e) => onChange(e.target.value)}
        placeholder="選択または入力" />
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
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listMasters("clients").then(setClients).catch(() => {});
    api.listMasters("instructors").then(setInstructors).catch(() => {});
    api.listMasters("agencies").then(setAgencies).catch(() => {});
    if (editing) {
      api.getDeal(Number(id)).then((d) => {
        setForm({
          held_on: d.held_on, client: d.client, revenue_month: d.revenue_month,
          agency: d.agency ?? "", training_name: d.training_name ?? "",
          instructor: d.instructor ?? "", fee: d.fee, transport: d.transport,
          other: d.other, tax: null, billing: null,
          instructor_fee: d.instructor_fee, payment_due: d.payment_due ?? "",
          support_staff: d.support_staff ?? "", note: d.note ?? "",
        });
      }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    }
  }, [id]);

  const set = (k: keyof DealInput, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const autoTax = previewTax(form.fee);
  const taxShown = form.tax ?? autoTax;
  const billingShown = form.billing ?? previewBilling(form.fee, form.transport, form.other, taxShown);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.held_on) { setError("実施日を入力してください"); return; }
    if (!form.client.trim()) { setError("企業名を入力してください"); return; }
    setSaving(true); setError(null);
    // 空文字の任意項目は null にする（特に日付の "" は 422 になるため）
    const clean = (v: string | null | undefined) => (v && v.trim() !== "" ? v.trim() : null);
    const payload: DealInput = {
      ...form,
      agency: clean(form.agency),
      training_name: clean(form.training_name),
      instructor: clean(form.instructor),
      support_staff: clean(form.support_staff),
      note: clean(form.note),
      payment_due: clean(form.payment_due),
      revenue_month: clean(form.revenue_month),
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
        <div className="form-grid">
          <div className="field">
            <label className="req">実施日</label>
            <input type="date" value={form.held_on} onChange={(e) => set("held_on", e.target.value)} />
          </div>
          <MasterField kind="agencies" label="代理店" value={form.agency ?? ""}
            onChange={(v) => set("agency", v)} options={agencies} />
          <MasterField kind="clients" label="企業名" value={form.client} required
            onChange={(v) => {
              const c = clients.find((x) => x.name === v);
              setForm((f) => ({ ...f, client: v, agency: c?.agency ? c.agency : f.agency }));
            }} options={clients} />
          <div className="field">
            <label>研修名</label>
            <input value={form.training_name ?? ""} onChange={(e) => set("training_name", e.target.value)} />
          </div>
          <MasterField kind="instructors" label="講師" value={form.instructor ?? ""}
            onChange={(v) => set("instructor", v)} options={instructors} />
          <div className="field">
            <label>サポートスタッフ</label>
            <input value={form.support_staff ?? ""} onChange={(e) => set("support_staff", e.target.value)} />
          </div>
          <div className="field">
            <label>研修費用</label>
            <MoneyInput value={form.fee} onChange={(n) => set("fee", n)} />
          </div>
          <div className="field">
            <label>交通費</label>
            <MoneyInput value={form.transport} onChange={(n) => set("transport", n)} />
          </div>
          <div className="field">
            <label>その他</label>
            <MoneyInput value={form.other} onChange={(n) => set("other", n)} />
          </div>
          <div className="field">
            <label>講師料（変動費）</label>
            <MoneyInput value={form.instructor_fee} onChange={(n) => set("instructor_fee", n)} />
          </div>
          <div className="field">
            <label>入金予定日</label>
            <input type="date" value={form.payment_due ?? ""} onChange={(e) => set("payment_due", e.target.value)} />
          </div>
          <div className="field">
            <label>備考</label>
            <input value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
          </div>
        </div>
        <div className="cards" style={{ marginTop: 8 }}>
          <div className="card"><div className="label">消費税(自動)</div><div className="value">{yen(taxShown)}</div></div>
          <div className="card"><div className="label">請求額(自動)</div><div className="value">{yen(billingShown)}</div></div>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
          <button className="btn sub" type="button" onClick={() => navigate("/deals")}>取消</button>
        </div>
      </form>
    </Layout>
  );
}
