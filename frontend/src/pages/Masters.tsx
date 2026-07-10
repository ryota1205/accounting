import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Loading, Empty, ErrorState } from "../components/States";
import { api } from "../api/client";
import { Master, MasterKind } from "../api/types";

const KINDS: { key: MasterKind; label: string }[] = [
  { key: "clients", label: "企業" },
  { key: "instructors", label: "講師" },
  { key: "agencies", label: "代理店" },
];

export default function Masters() {
  const [kind, setKind] = useState<MasterKind>("clients");
  const [rows, setRows] = useState<Master[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [agencyOptions, setAgencyOptions] = useState<Master[]>([]);

  function load() {
    setRows(null); setError(null);
    api.listMasters(kind).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, [kind]);
  useEffect(() => { api.listMasters("agencies").then(setAgencyOptions).catch(() => {}); }, [kind]);

  async function add() {
    if (!newName.trim()) return;
    try { await api.createMaster(kind, newName.trim()); setNewName(""); load(); }
    catch (e) { setError((e as Error).message); }
  }
  async function rename(m: Master) {
    const name = window.prompt("新しい名称", m.name);
    if (name && name.trim()) {
      await api.updateMaster(kind, m.id, name.trim(), m.active, m.agency, m.address, m.url, m.industry);
      load();
    }
  }
  async function remove(m: Master) {
    if (window.confirm(`「${m.name}」を削除しますか？`)) { await api.deleteMaster(kind, m.id); load(); }
  }
  async function saveAgency(m: Master, agency: string) {
    const v = agency.trim();
    if ((m.agency ?? "") === v) return;
    try { await api.updateMaster("clients", m.id, m.name, m.active, v || null, m.address, m.url, m.industry); load(); }
    catch (e) { setError((e as Error).message); }
  }
  async function saveIndustry(m: Master, industry: string) {
    const v = industry.trim();
    if ((m.industry ?? "") === v) return;
    try { await api.updateMaster("clients", m.id, m.name, m.active, m.agency, m.address, m.url, v || null); load(); }
    catch (e) { setError((e as Error).message); }
  }
  async function saveAddress(m: Master, address: string) {
    const v = address.trim();
    if ((m.address ?? "") === v) return;
    try { await api.updateMaster("clients", m.id, m.name, m.active, m.agency, v || null, m.url, m.industry); load(); }
    catch (e) { setError((e as Error).message); }
  }
  async function saveUrl(m: Master, url: string) {
    const v = url.trim();
    if ((m.url ?? "") === v) return;
    try { await api.updateMaster("clients", m.id, m.name, m.active, m.agency, m.address, v || null, m.industry); load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <Layout title="マスタ管理"
      actions={
        <select value={kind} onChange={(e) => setKind(e.target.value as MasterKind)}>
          {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      }>
      <div className="panel" style={{ display: "flex", gap: 10 }}>
        <input placeholder="新規名称を入力" value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn" onClick={add}>＋ 追加</button>
      </div>
      <div className="panel matrix">
        {error ? <ErrorState message={error} />
          : rows === null ? <Loading />
          : rows.length === 0 ? <Empty />
          : (
          <table>
            <thead>
              <tr>
                <th>名称</th>
                {kind === "clients" && <th>代理店</th>}
                {kind === "clients" && <th>業種</th>}
                {kind === "clients" && <th>住所</th>}
                {kind === "clients" && <th>URL</th>}
                <th>状態</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  {kind === "clients" && (
                    <td>
                      <input
                        list="agencyOptions"
                        style={{ fontSize: 13, padding: "4px 8px", minWidth: 160 }}
                        placeholder="代理店を選択/入力"
                        defaultValue={m.agency ?? ""}
                        onBlur={(e) => saveAgency(m, e.target.value)}
                      />
                    </td>
                  )}
                  {kind === "clients" && (
                    <td>
                      <input
                        key={`ind-${m.id}-${m.industry ?? ""}`}
                        list="industryOptions"
                        style={{ fontSize: 13, padding: "4px 8px", minWidth: 140 }}
                        placeholder="業種を入力"
                        defaultValue={m.industry ?? ""}
                        onBlur={(e) => saveIndustry(m, e.target.value)}
                      />
                    </td>
                  )}
                  {kind === "clients" && (
                    <td>
                      <input
                        key={`addr-${m.id}-${m.address ?? ""}`}
                        style={{ fontSize: 13, padding: "4px 8px", minWidth: 240 }}
                        placeholder="本社所在地（郵便番号付き）"
                        defaultValue={m.address ?? ""}
                        onBlur={(e) => saveAddress(m, e.target.value)}
                      />
                    </td>
                  )}
                  {kind === "clients" && (
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          key={`url-${m.id}-${m.url ?? ""}`}
                          style={{ fontSize: 13, padding: "4px 8px", minWidth: 200 }}
                          placeholder="https://…"
                          defaultValue={m.url ?? ""}
                          onBlur={(e) => saveUrl(m, e.target.value)}
                        />
                        {m.url && (
                          <a href={m.url} target="_blank" rel="noreferrer"
                            title="サイトを開く" style={{ fontSize: 13 }}>↗</a>
                        )}
                      </div>
                    </td>
                  )}
                  <td>{m.active ? "有効" : "無効"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn sub sm" onClick={() => rename(m)}>名称変更</button>
                    <button className="btn sub sm" onClick={() => remove(m)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <datalist id="agencyOptions">
          {agencyOptions.map((a) => <option key={a.id} value={a.name} />)}
        </datalist>
        <datalist id="industryOptions">
          {["情報通信（IT・システム）", "通信", "電機・精密機器", "自動車・輸送機器",
            "機械・重工業", "化学", "医薬・バイオ", "建設・エンジニアリング",
            "鉄道・運輸", "電力・エネルギー", "金融・保険", "証券",
            "商社・卸売", "小売", "食品", "製造業", "コンサルティング",
            "教育・研修", "人材・研修", "マスコミ・出版", "アニメ・エンタメ",
            "不動産", "医療・病院", "官公庁・自治体", "独立行政法人",
            "業界団体・財団", "農業・種苗"].map((v) => <option key={v} value={v} />)}
        </datalist>
      </div>
    </Layout>
  );
}
