import { useState } from "react";
import { Layout } from "../components/Layout";
import { useFiscalYear } from "../context/FiscalYearContext";
import { api } from "../api/client";

export default function ImportExport() {
  const { fiscalYear } = useFiscalYear();
  const [file, setFile] = useState<File | null>(null);
  const [wipe, setWipe] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function doImport() {
    if (!file) { setMsg("ファイルを選択してください"); return; }
    if (wipe && !window.confirm("既存データを全件洗い替えします。よろしいですか？")) return;
    setBusy(true); setMsg("取り込み中…");
    try {
      const r = await api.importExcel(file, wipe);
      setMsg(`取り込み完了: ${r.imported}件`);
    } catch (e) {
      setMsg(`エラー: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Excel連携">
      <div className="panel">
        <h3>取り込み（既存Excel → システム）</h3>
        <p className="hint">「①案件日付別管理」シートを読み込みます。初回は洗い替えを推奨。</p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} />
            既存データを洗い替え
          </label>
          <button className="btn" onClick={doImport} disabled={busy}>取り込む</button>
        </div>
        {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      </div>
      <div className="panel">
        <h3>出力（システム → Excel）</h3>
        <p className="hint">{fiscalYear}年度の案件をExcelで書き出します。</p>
        <a className="btn" href={api.exportUrl(fiscalYear)}>Excelをダウンロード</a>
      </div>
    </Layout>
  );
}
