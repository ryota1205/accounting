import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MonthlySummary from "./pages/MonthlySummary";
import Deals from "./pages/Deals";
import DealForm from "./pages/DealForm";
import AnnualMatrix from "./pages/AnnualMatrix";
import SummaryBy from "./pages/SummaryBy";
import ProfitLoss from "./pages/ProfitLoss";
import SalesManagement from "./pages/SalesManagement";
import Analysis from "./pages/Analysis";
import Payments from "./pages/Payments";
import CashFlow from "./pages/CashFlow";
import Masters from "./pages/Masters";
import ImportExport from "./pages/ImportExport";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { homeFor } from "./lib/access";

// ルート "/" はロール別ホームへ
function RootRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : "/login"} replace />;
}

// 認証＋権限ガードでページを包む
const guard = (el: JSX.Element) => <ProtectedRoute>{el}</ProtectedRoute>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={guard(<RootRedirect />)} />
      <Route path="/dashboard" element={guard(<Dashboard />)} />
      <Route path="/monthly" element={guard(<MonthlySummary />)} />
      <Route path="/deals" element={guard(<Deals />)} />
      <Route path="/deals/new" element={guard(<DealForm />)} />
      <Route path="/deals/:id/edit" element={guard(<DealForm />)} />
      <Route path="/annual" element={guard(<AnnualMatrix />)} />
      <Route path="/summary" element={guard(<SummaryBy />)} />
      <Route path="/pl" element={guard(<ProfitLoss />)} />
      <Route path="/sales" element={guard(<SalesManagement />)} />
      <Route path="/analysis" element={guard(<Analysis />)} />
      <Route path="/payments" element={guard(<Payments />)} />
      <Route path="/cashflow" element={guard(<CashFlow />)} />
      <Route path="/masters" element={guard(<Masters />)} />
      <Route path="/io" element={guard(<ImportExport />)} />
    </Routes>
  );
}
