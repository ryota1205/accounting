import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { Card } from "../components/Card";
import { useFiscalYear } from "../context/FiscalYearContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { Analysis as AnalysisData, GroupRow, Setting } from "../api/types";
import { yen, pct, man } from "../lib/format";
import {
  Benchmark, Category, mergeBenchmarks, PRODUCTIVITY_KEYS,
} from "../lib/benchmarks";
import {
  Zone, classify, markerPosition, elapsedMonths, annualize, laborEstimate,
} from "../lib/kpi";

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

// 指標値の表示（率=% / 金額=万円）
function fmtVal(v: number | null, unit: "pct" | "yen"): string {
  if (v === null || Number.isNaN(v)) return "—";
  return unit === "pct" ? pct(v) : man(v);
}

// 目安（安全域）のテキスト
function targetText(b: Benchmark): string {
  const f = (x?: number) => (x === undefined ? "" : b.unit === "pct" ? pct(x, 0) : man(x));
  if (b.dir === "higher") return `${f(b.safeLo)}以上`;
  if (b.dir === "lower") return `${f(b.safeHi)}以下`;
  return `${f(b.safeLo)}〜${f(b.safeHi)}`;
}

const ZONE_LABEL: Record<Zone, string> = { safe: "安全", warn: "注意", danger: "危険" };

// 安全/注意/危険の3色帯＋現在値マーカー
function ZoneBar({ value, b }: { value: number | null; b: Benchmark }) {
  const pos = markerPosition(value, b);
  // 向きに応じて色の並び（左→右）を決める。higher/band は右が安全、lower は右が危険。
  const order: Zone[] = b.dir === "lower"
    ? ["safe", "warn", "danger"]
    : b.dir === "band"
      ? ["danger", "safe", "danger"] // 中央が安全（簡易表現）
      : ["danger", "warn", "safe"];
  return (
    <div className="zbar" title={value === null ? "判定不能" : ""}>
      {order.map((z, i) => <span key={i} className={`zseg ${z}`} />)}
      {pos !== null && <span className="zmark" style={{ left: `${pos * 100}%` }} />}
    </div>
  );
}

function MetricRow({ b, value }: { b: Benchmark; value: number | null }) {
  const zone = classify(value, b);
  return (
    <tr>
      <td className="cell-wrap">{b.label}
        {b.note && <span className="metric-note" title={b.note}>ⓘ</span>}
      </td>
      <td className="num"><strong>{fmtVal(value, b.unit)}</strong></td>
      <td style={{ minWidth: 120 }}><ZoneBar value={value} b={b} /></td>
      <td style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{targetText(b)}</td>
      <td>{zone
        ? <span className={`zbadge ${zone}`}>{ZONE_LABEL[zone]}</span>
        : <span style={{ color: "var(--muted)" }}>—</span>}</td>
    </tr>
  );
}

// ===== 経営前提・閾値の編集モーダル（admin） =====
function EditModal({ fy, settings, cats, onClose, onSaved }: {
  fy: number; settings: Setting; cats: Category[];
  onClose: () => void; onSaved: () => void;
}) {
  // 経営前提（表示単位：労働分配率=%、役員報酬=円）
  const [laborPct, setLaborPct] = useState(String(Math.round(settings.labor_share * 1000) / 10));
  const [headcount, setHeadcount] = useState(String(settings.headcount || 0));
  const [bonus, setBonus] = useState(String(settings.bonus_months ?? 2));
  const [execYen, setExecYen] = useState(String(settings.exec_comp_annual || 0));
  // 閾値ドラフト：key -> { bound -> 表示値(文字列) }
  const boundsOf = (b: Benchmark): (keyof Benchmark)[] =>
    b.dir === "higher" ? ["warnLo", "safeLo"]
      : b.dir === "lower" ? ["safeHi", "warnHi"]
        : ["warnLo", "safeLo", "safeHi", "warnHi"];
  const toDisp = (v: number, unit: "pct" | "yen") => unit === "pct" ? Math.round(v * 1000) / 10 : Math.round(v / 10000);
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>(() => {
    const d: Record<string, Record<string, string>> = {};
    cats.forEach((c) => c.items.forEach((b) => {
      d[b.key] = {};
      boundsOf(b).forEach((k) => {
        const v = b[k] as number | undefined;
        if (v !== undefined) d[b.key][k] = String(toDisp(v, b.unit));
      });
    }));
    return d;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setBound = (key: string, bound: string, val: string) =>
    setDraft((p) => ({ ...p, [key]: { ...p[key], [bound]: val } }));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      // 閾値ドラフトを内部単位（率=0〜1 / 金額=円）に戻して overrides を作る
      const overrides: Record<string, Record<string, number>> = {};
      cats.forEach((c) => c.items.forEach((b) => {
        const o: Record<string, number> = {};
        boundsOf(b).forEach((k) => {
          const s = draft[b.key]?.[k as string];
          if (s !== undefined && s !== "") {
            const n = Number(s);
            if (!Number.isNaN(n)) o[k as string] = b.unit === "pct" ? n / 100 : n * 10000;
          }
        });
        if (Object.keys(o).length) overrides[b.key] = o;
      }));
      await api.putAnalysisSetting(fy, {
        labor_share: Math.max(0, Math.min(1, (Number(laborPct) || 0) / 100)),
        headcount: Math.max(0, Number(headcount) || 0),
        bonus_months: Math.max(0, Number(bonus) || 0),
        exec_comp_annual: Math.max(0, Math.round(Number(execYen) || 0)),
        benchmarks_json: JSON.stringify(overrides),
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗しました");
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ width: 560, maxHeight: "85vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 12px" }}>基準・経営前提の編集（{fy}年度）</h3>

        <div className="edit-sec-title">経営前提（人件費の目安）</div>
        <div className="form-grid">
          <div className="field">
            <label>労働分配率（%）</label>
            <input value={laborPct} onChange={(e) => setLaborPct(e.target.value)} inputMode="decimal" />
          </div>
          <div className="field">
            <label>従業員数（役員除く）</label>
            <input value={headcount} onChange={(e) => setHeadcount(e.target.value)} inputMode="decimal" />
          </div>
          <div className="field">
            <label>賞与 月数（年間）</label>
            <input value={bonus} onChange={(e) => setBonus(e.target.value)} inputMode="decimal" />
          </div>
          <div className="field">
            <label>役員報酬 年額（円・別枠／任意）</label>
            <input value={execYen} onChange={(e) => setExecYen(e.target.value)} inputMode="numeric" />
            <span className="hint">= {yen(Number(execYen) || 0)}（人件費総額から差し引きます。不要なら0）</span>
          </div>
        </div>

        <div className="edit-sec-title">基準値（ゾーン閾値）</div>
        <p className="hint" style={{ marginTop: 0 }}>
          率は%、金額は万円で入力。空欄は既定値。※これらは確定した業界平均ではなく一般的な目安です。
        </p>
        {cats.map((c) => (
          <div key={c.title} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 0" }}>{c.title}</div>
            {c.items.map((b) => (
              <div key={b.key} className="edit-bound-row">
                <span className="edit-bound-name">{b.label}</span>
                {boundsOf(b).map((k) => (
                  <label key={k as string} className="edit-bound-field">
                    <span>{BOUND_LABEL[k as string]}</span>
                    <input value={draft[b.key]?.[k as string] ?? ""}
                      onChange={(e) => setBound(b.key, k as string, e.target.value)}
                      inputMode="decimal" />
                  </label>
                ))}
              </div>
            ))}
          </div>
        ))}

        {err && <div className="login-error" style={{ color: "var(--danger)", background: "#fef2f2" }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn sub" onClick={onClose} disabled={saving}>キャンセル</button>
          <button className="btn" onClick={save} disabled={saving}>{saving ? "保存中…" : "保存する"}</button>
        </div>
      </div>
    </div>
  );
}

const BOUND_LABEL: Record<string, string> = {
  warnLo: "危険境界(下)", safeLo: "安全下限", safeHi: "安全上限", warnHi: "危険境界(上)",
};

export default function Analysis() {
  const { fiscalYear } = useFiscalYear();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState<AnalysisData | null>(null);
  const [settings, setSettings] = useState<Setting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = () => {
    setError(null);
    Promise.all([api.analysis(fiscalYear), api.getSetting(fiscalYear)])
      .then(([a, s]) => { setData(a); setSettings(s); })
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    setData(null); setSettings(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear]);

  const cats = useMemo(() => mergeBenchmarks(settings?.benchmarks_json), [settings?.benchmarks_json]);

  // 指標値の算出（年間見込みベース：期中でも通年で健全性を見る）
  const { values, hasHeadcount, labor } = useMemo(() => {
    if (!data || !settings) return { values: {} as Record<string, number | null>, hasHeadcount: false, labor: null };
    const today = new Date();
    const months = elapsedMonths(fiscalYear, today);
    const salesActual = data.dependency.total;
    const grossActual = data.yoy.total_gross_cur;
    const salesBasis = annualize(salesActual, months) ?? salesActual;
    const grossBasis = annualize(grossActual, months) ?? grossActual;
    const annualFixed = settings.monthly_fixed_cost * 12;
    const opBasis = grossBasis - annualFixed;
    const head = settings.headcount || 0;
    const typeShare = (t: string) => data.by_customer_type.find((r) => r.type === t)?.share ?? null;
    const prev = data.yoy.total_sales_prev;

    const v: Record<string, number | null> = {
      gross_rate: salesBasis > 0 ? grossBasis / salesBasis : null,
      op_margin: salesBasis > 0 ? opBasis / salesBasis : null,
      bep_ratio: grossBasis > 0 ? annualFixed / grossBasis : null,
      labor_share: settings.labor_share,
      growth: data.yoy.prev_has_data && prev > 0 ? (salesBasis - prev) / prev : null,
      repeat_ratio: typeShare("リピート"),
      top1_dep: data.dependency.top1,
      new_ratio: typeShare("新規"),
      sales_per_head: head > 0 ? salesBasis / head : null,
      gross_per_head: head > 0 ? grossBasis / head : null,
      op_per_head: head > 0 ? opBasis / head : null,
    };

    // 人件費の目安（実績・見込み）
    const grossProj = annualize(grossActual, months);
    const mk = (gross: number) => laborEstimate({
      gross, laborShare: settings.labor_share, headcount: head,
      bonusMonths: settings.bonus_months, execCompAnnual: settings.exec_comp_annual,
    });
    return {
      values: v,
      hasHeadcount: head > 0,
      labor: {
        actual: mk(grossActual),
        proj: grossProj !== null ? mk(grossProj) : null,
        head,
        annualFixed,
      },
    };
  }, [data, settings, fiscalYear]);

  if (error) return <Layout title="分析"><ErrorState message={error} /></Layout>;
  if (!data || !settings) return <Layout title="分析"><Loading /></Layout>;

  const y = data.yoy;
  const ratio = (cur: number, prev: number) => (prev !== 0 ? `${(cur / prev * 100).toFixed(1)}%` : "—");
  const yoyColor = (cur: number, prev: number) =>
    cur === 0 && prev === 0
      ? undefined
      : { color: cur >= prev ? "var(--ok)" : "var(--danger)", fontWeight: 600 };

  return (
    <Layout title="分析">
      <h3 style={{ margin: "4px 0 8px" }}>上位顧客への依存度</h3>
      <div className="cards">
        <Card label="上位1社 売上比率" value={pct(data.dependency.top1)} />
        <Card label="上位3社 売上比率" value={pct(data.dependency.top3)} />
        <Card label="上位5社 売上比率" value={pct(data.dependency.top5)} />
        <Card label="年度売上(税抜)合計" value={yen(data.dependency.total)} />
      </div>

      <h3 style={{ margin: "18px 0 8px" }}>新規／既存／リピート別（売上構成比）</h3>
      <div className="cards">
        {(() => {
          const order = ["新規", "既存", "リピート"];
          const map = new Map(data.by_customer_type.map((r) => [r.type, r]));
          const extras = data.by_customer_type.filter((r) => !order.includes(r.type)).map((r) => r.type);
          return [...order, ...extras].map((t) => {
            const r = map.get(t);
            return <Card key={t} label={t} value={pct(r?.share ?? 0)} sub={yen(r?.sales ?? 0)} />;
          });
        })()}
      </div>

      <GroupTable title="顧客別" rows={data.by_client} firstColLabel="顧客名" />
      <GroupTable title="研修テーマ別" rows={data.by_theme} firstColLabel="研修テーマ" />

      {/* ===== 経営指標と基準値 ===== */}
      <div className="panel matrix">
        <div className="recur-head">
          <h3>経営指標と基準値</h3>
          {isAdmin && (
            <button className="btn sub sm" style={{ marginLeft: "auto" }}
              onClick={() => setEditing(true)}>基準を編集</button>
          )}
        </div>
        <div className="legend">
          <span><span className="dot" style={{ background: "var(--ok)" }} />安全</span>
          <span><span className="dot" style={{ background: "var(--warn)" }} />注意</span>
          <span><span className="dot" style={{ background: "var(--danger)" }} />危険</span>
          <span style={{ color: "var(--muted)" }}>※ 年間見込みベース。基準は一般的な目安で確定した業界平均ではありません。</span>
        </div>
        {cats.map((c) => {
          const isProd = c.items.some((b) => PRODUCTIVITY_KEYS.includes(b.key));
          if (isProd && !hasHeadcount) {
            return (
              <div key={c.title} style={{ marginTop: 8 }}>
                <div className="metric-cat">{c.title}</div>
                <div className="hint" style={{ padding: "4px 2px" }}>
                  従業員数を設定すると表示されます（{isAdmin ? "「基準を編集」から入力" : "管理者が設定"}）。
                </div>
              </div>
            );
          }
          return (
            <div key={c.title} style={{ marginTop: 8 }}>
              <div className="metric-cat">{c.title}</div>
              <table>
                <thead><tr>
                  <th>指標</th><th className="num">当年値</th><th>安全←→危険</th><th>目安</th><th>判定</th>
                </tr></thead>
                <tbody>
                  {c.items.map((b) => <MetricRow key={b.key} b={b} value={values[b.key] ?? null} />)}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* ===== 人件費の目安（労働分配率ベース） ===== */}
      <div className="panel matrix">
        <div className="recur-head">
          <h3>人件費の目安（労働分配率ベース）</h3>
          {isAdmin && (
            <button className="btn sub sm" style={{ marginLeft: "auto" }}
              onClick={() => setEditing(true)}>前提を編集</button>
          )}
        </div>
        <div className="hint" style={{ marginTop: 0 }}>
          労働分配率 {pct(settings.labor_share, 0)}／従業員数 {settings.headcount || "未設定"}人／
          賞与 {settings.bonus_months}ヶ月／役員報酬 {settings.exec_comp_annual ? yen(settings.exec_comp_annual) : "なし"}。
          粗利×労働分配率を人件費原資とした目安です（確定値ではありません）。
        </div>
        {labor && labor.actual.total > 0 && labor.actual.employeePool === 0 && settings.exec_comp_annual > 0 && (
          <div className="alert-banner" style={{ marginTop: 10, marginBottom: 0 }}>
            <span className="alert-banner-icon">!</span>
            <span>役員報酬（{yen(settings.exec_comp_annual)}）が人件費原資（{yen(labor.actual.total)}）を上回っているため、
              社員原資が0になっています。「前提を編集」で役員報酬の金額（円単位）をご確認ください。</span>
          </div>
        )}
        <table>
          <thead><tr>
            <th>項目</th><th className="num">実績ベース</th><th className="num">年間見込みベース</th>
          </tr></thead>
          <tbody>
            <tr>
              <td>適正人件費 総額</td>
              <td className="num">{yen(labor?.actual.total ?? null)}</td>
              <td className="num">{labor?.proj ? yen(labor.proj.total) : "—"}</td>
            </tr>
            <tr>
              <td>社員原資（役員報酬 別枠後）</td>
              <td className="num">{yen(labor?.actual.employeePool ?? null)}</td>
              <td className="num">{labor?.proj ? yen(labor.proj.employeePool) : "—"}</td>
            </tr>
            {hasHeadcount ? (
              <>
                <tr>
                  <td>1人当たり 年収目安</td>
                  <td className="num">{yen(labor?.actual.perHeadAnnual ?? null)}</td>
                  <td className="num">{labor?.proj?.perHeadAnnual != null ? yen(labor.proj.perHeadAnnual) : "—"}</td>
                </tr>
                <tr>
                  <td>月給目安</td>
                  <td className="num">{yen(labor?.actual.monthly ?? null)}</td>
                  <td className="num">{labor?.proj?.monthly != null ? yen(labor.proj.monthly) : "—"}</td>
                </tr>
                <tr>
                  <td>賞与目安（年間）</td>
                  <td className="num">{yen(labor?.actual.bonus ?? null)}</td>
                  <td className="num">{labor?.proj?.bonus != null ? yen(labor.proj.bonus) : "—"}</td>
                </tr>
              </>
            ) : (
              <tr>
                <td colSpan={3} className="hint" style={{ padding: "10px 2px" }}>
                  従業員数を設定すると、1人当たり年収・月給・賞与の目安が表示されます。
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="hint" style={{ marginBottom: 0 }}>
          ※ 目安であり保証ではありません。実際の給与・賞与の決定は労務・税務の専門家にご相談ください。
        </p>
      </div>

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
                <td className="num" style={yoyColor(y.sales_cur[i], y.sales_prev[i])}>{yen(y.sales_cur[i])}</td>
                <td className="num">{yen(y.sales_prev[i])}</td>
                <td className="num" style={yoyColor(y.sales_cur[i], y.sales_prev[i])}>{ratio(y.sales_cur[i], y.sales_prev[i])}</td>
                <td className="num" style={yoyColor(y.gross_cur[i], y.gross_prev[i])}>{yen(y.gross_cur[i])}</td>
                <td className="num">{yen(y.gross_prev[i])}</td>
                <td className="num" style={yoyColor(y.orders_cur[i], y.orders_prev[i])}>{y.orders_cur[i]}</td>
                <td className="num">{y.orders_prev[i]}</td>
              </tr>
            ))}
            <tr>
              <td><strong>年間累計</strong></td>
              <td className="num" style={yoyColor(y.total_sales_cur, y.total_sales_prev)}><strong>{yen(y.total_sales_cur)}</strong></td>
              <td className="num"><strong>{yen(y.total_sales_prev)}</strong></td>
              <td className="num" style={yoyColor(y.total_sales_cur, y.total_sales_prev)}><strong>{ratio(y.total_sales_cur, y.total_sales_prev)}</strong></td>
              <td className="num" style={yoyColor(y.total_gross_cur, y.total_gross_prev)}><strong>{yen(y.total_gross_cur)}</strong></td>
              <td className="num"><strong>{yen(y.total_gross_prev)}</strong></td>
              <td className="num" style={yoyColor(y.total_orders_cur, y.total_orders_prev)}><strong>{y.total_orders_cur}</strong></td>
              <td className="num"><strong>{y.total_orders_prev}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {editing && isAdmin && (
        <EditModal fy={fiscalYear} settings={settings} cats={cats}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }} />
      )}
    </Layout>
  );
}
