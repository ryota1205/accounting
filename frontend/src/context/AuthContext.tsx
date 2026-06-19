import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, setToken, clearToken, getToken } from "../api/client";
import { AuthUser } from "../api/types";

type Ctx = {
  user: AuthUser | null;
  loading: boolean;                       // 起動時のトークン復元中
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => void;                // /me を再取得（パスワード変更後など）
};
const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // 起動時：トークンがあれば /me で復元
  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    const r = await api.login(username, password);
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };

  const logout = () => {
    clearToken();
    setUser(null);
    window.location.href = "/login";
  };

  const refreshUser = () => { api.me().then(setUser).catch(() => { /* noop */ }); };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
