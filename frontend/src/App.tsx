import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Deals from "./pages/Deals";
import DealForm from "./pages/DealForm";
import AnnualMatrix from "./pages/AnnualMatrix";
import SummaryBy from "./pages/SummaryBy";
import ProfitLoss from "./pages/ProfitLoss";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/deals" element={<Deals />} />
      <Route path="/deals/new" element={<DealForm />} />
      <Route path="/deals/:id/edit" element={<DealForm />} />
      <Route path="/annual" element={<AnnualMatrix />} />
      <Route path="/summary" element={<SummaryBy />} />
      <Route path="/pl" element={<ProfitLoss />} />
    </Routes>
  );
}
