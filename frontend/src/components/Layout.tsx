import { NavLink } from "react-router-dom";
import { ReactNode } from "react";
import { useFiscalYear } from "../context/FiscalYearContext";

const MENU = [
  { to: "/dashboard", label: "ダッシュボード" },
  { to: "/monthly", label: "月次サマリー" },
  { to: "/deals", label: "案件一覧" },
  { to: "/annual", label: "年間売上管理表" },
  { to: "/summary", label: "軸別集計" },
  { to: "/pl", label: "損益・損益分岐点" },
  { to: "/sales", label: "営業管理" },
  { to: "/payments", label: "入金管理" },
  { to: "/masters", label: "マスタ管理" },
  { to: "/io", label: "Excel連携" },
];

const YEARS = [2025, 2026, 2027, 2028];

export function Layout({ title, children, actions }: {
  title: string; children: ReactNode; actions?: ReactNode;
}) {
  const { fiscalYear, setFiscalYear } = useFiscalYear();
  return (
    <div className="app">
      <aside className="side">
        <h1>研修売上管理</h1>
        <nav>
          {MENU.map((m) => (
            <NavLink key={m.to} to={m.to}
              className={({ isActive }) => (isActive ? "active" : "")}>
              {m.label}
            </NavLink>
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
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
