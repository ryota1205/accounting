import { Routes, Route, Navigate } from "react-router-dom";
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
import Masters from "./pages/Masters";
import ImportExport from "./pages/ImportExport";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/monthly" element={<MonthlySummary />} />
      <Route path="/deals" element={<Deals />} />
      <Route path="/deals/new" element={<DealForm />} />
      <Route path="/deals/:id/edit" element={<DealForm />} />
      <Route path="/annual" element={<AnnualMatrix />} />
      <Route path="/summary" element={<SummaryBy />} />
      <Route path="/pl" element={<ProfitLoss />} />
      <Route path="/sales" element={<SalesManagement />} />
      <Route path="/analysis" element={<Analysis />} />
      <Route path="/payments" element={<Payments />} />
      <Route path="/masters" element={<Masters />} />
      <Route path="/io" element={<ImportExport />} />
    </Routes>
  );
}
