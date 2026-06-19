import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { canAccess, homeFor } from "../lib/access";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="state">読み込み中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccess(user.role, loc.pathname)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}
