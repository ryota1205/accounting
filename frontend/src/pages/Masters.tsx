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

  function load() {
    setRows(null); setError(null);
    api.listMasters(kind).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(load, [kind]);

  async function add() {
    if (!newName.trim()) return;
    try { await api.createMaster(kind, newName.trim()); setNewName(""); load(); }
    catch (e) { setError((e as Error).message); }
  }
  async function rename(m: Master) {
    const name = window.prompt("新しい名称", m.name);
    if (name && name.trim()) { await api.updateMaster(kind, m.id, name.trim(), m.active); load(); }
  }
  async function remove(m: Master) {
    if (window.confirm(`「${m.name}」を削除しますか？`)) { await api.deleteMaster(kind, m.id); load(); }
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
            <thead><tr><th>名称</th><th>状態</th><th></th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
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
      </div>
    </Layout>
  );
}
