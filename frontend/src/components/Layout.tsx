import { NavLink } from "react-router-dom";
import { ReactNode, useState } from "react";
import { useFiscalYear } from "../context/FiscalYearContext";
import { useAlerts } from "../context/AlertsContext";
import { useAuth } from "../context/AuthContext";
import { canAccess } from "../lib/access";
import { PasswordChange } from "./PasswordChange";

// 線アイコン（Lucide風）。依存追加なしのインラインSVG。
function Icon({ name }: { name: string }) {
  const p: Record<string, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
    deals: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    pl: <><path d="M3 17l6-6 4 4 7-8" /><path d="M21 7v5M21 7h-5" /></>,
    sales: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" /></>,
    analysis: <><path d="M12 3v9l7 4" /><path d="M21 12a9 9 0 1 1-9-9" /></>,
    payments: <><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10h20M7 15h4" /></>,
    cash: <><path d="M3 6h18v12H3z" /><circle cx="12" cy="12" r="2.5" /><path d="M7 9v6M17 9v6" /></>,
    masters: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
    io: <><path d="M14 2v6h6" /><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" /><path d="M9 14l3 3 3-3M12 11v6" /></>,
  };
  return (
    <svg className="nav-ico" viewBox="0 0 24 24" width="18" height="18" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {p[name]}
    </svg>
  );
}

const MENU_GROUPS: { title?: string; items: { to: string; label: string; icon: string }[] }[] = [
  { items: [
    { to: "/dashboard", label: "ダッシュボード", icon: "dashboard" },
  ] },
  { title: "売上・案件", items: [
    { to: "/monthly", label: "月次サマリー", icon: "calendar" },
    { to: "/deals", label: "案件一覧", icon: "deals" },
    { to: "/annual", label: "年間売上管理表", icon: "table" },
    { to: "/summary", label: "軸別集計", icon: "chart" },
  ] },
  { title: "分析", items: [
    { to: "/pl", label: "損益・損益分岐点", icon: "pl" },
    { to: "/sales", label: "営業管理", icon: "sales" },
    { to: "/analysis", label: "分析", icon: "analysis" },
  ] },
  { title: "入金", items: [
    { to: "/payments", label: "入金管理", icon: "payments" },
    { to: "/cashflow", label: "資金繰り", icon: "cash" },
  ] },
  { title: "設定・連携", items: [
    { to: "/masters", label: "マスタ管理", icon: "masters" },
    { to: "/io", label: "Excel連携", icon: "io" },
  ] },
];

const YEARS = [2025, 2026, 2027, 2028];

export function Layout({ title, children, actions }: {
  title: string; children: ReactNode; actions?: ReactNode;
}) {
  const { fiscalYear, setFiscalYear } = useFiscalYear();
  const { alertCount } = useAlerts();
  const { user, logout, refreshUser } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);
  const forcePw = !!user?.must_change_password;

  // ロールでメニューを出し分け（空になったグループは隠す）
  const groups = MENU_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((m) => !user || canAccess(user.role, m.to)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark">研</span>
          <span className="brand-text">研修売上管理</span>
        </div>
        <nav>
          {groups.map((g, gi) => (
            <div className="nav-group" key={gi}>
              {g.title && <div className="nav-group-title">{g.title}</div>}
              {g.items.map((m) => (
                <NavLink key={m.to} to={m.to}
                  className={({ isActive }) => (isActive ? "active" : "")}>
                  <Icon name={m.icon} />
                  <span>{m.label}</span>
                  {m.to === "/payments" && alertCount > 0 && (
                    <span className="nav-badge">{alertCount}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <h2>{title}</h2>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {actions}
            <select value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))}>
              {YEARS.map((y) => <option key={y} value={y}>{y}年度</option>)}
            </select>
            {user && (
              <div className="topbar-user">
                <span>{user.name}</span>
                <button className="btn sub sm" onClick={() => setPwOpen(true)}>パスワード</button>
                <button className="btn sub sm" onClick={logout}>ログアウト</button>
              </div>
            )}
          </div>
        </div>
        {children}
      </main>
      {forcePw
        ? <PasswordChange forced onChanged={refreshUser} />
        : pwOpen && <PasswordChange onClose={() => setPwOpen(false)} />}
    </div>
  );
}
