import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { homeFor } from "../lib/access";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const u = await login(username.trim(), password);
      navigate(homeFor(u.role), { replace: true });
    } catch (err) {
      setError((err as Error).message || "ログインに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-aura" aria-hidden="true" />
      <form className="login-card" onSubmit={submit}>
        <div className="login-head">
          <h1>研修売上管理</h1>
        </div>
        <div className="login-field">
          <label>ユーザーID</label>
          <input value={username} autoFocus autoComplete="username"
            onChange={(e) => setUsername(e.target.value)} placeholder="admin / staff" />
        </div>
        <div className="login-field">
          <label>パスワード</label>
          <input type="password" value={password} autoComplete="current-password"
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="login-error">{error}</div>}
        <button className="login-btn" type="submit" disabled={busy}>
          {busy ? "ログイン中…" : "ログイン"}
        </button>
      </form>
    </div>
  );
}
