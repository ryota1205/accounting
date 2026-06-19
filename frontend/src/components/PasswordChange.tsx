import { useState, FormEvent } from "react";
import { api } from "../api/client";

export function PasswordChange({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (next.length < 6) { setError("新しいパスワードは6文字以上にしてください"); return; }
    if (next !== confirm) { setError("確認用パスワードが一致しません"); return; }
    setBusy(true);
    try {
      await api.changePassword(cur, next);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3 style={{ margin: "0 0 12px" }}>パスワード変更</h3>
        {done ? (
          <>
            <div className="login-error" style={{ background: "#dcfce7", color: "var(--ok)", borderColor: "#bbf7d0" }}>
              変更しました。
            </div>
            <button className="btn" type="button" onClick={onClose} style={{ width: "100%", marginTop: 8 }}>閉じる</button>
          </>
        ) : (
          <>
            <div className="field"><label>現在のパスワード</label>
              <input type="password" value={cur} autoFocus onChange={(e) => setCur(e.target.value)} /></div>
            <div className="field"><label>新しいパスワード（6文字以上）</label>
              <input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
            <div className="field"><label>新しいパスワード（確認）</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            {error && <div className="login-error">{error}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="btn" type="submit" disabled={busy}>{busy ? "変更中…" : "変更する"}</button>
              <button className="btn sub" type="button" onClick={onClose}>取消</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
