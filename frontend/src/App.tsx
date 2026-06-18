import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Deals from "./pages/Deals";
import DealForm from "./pages/DealForm";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/deals" element={<Deals />} />
      <Route path="/deals/new" element={<DealForm />} />
      <Route path="/deals/:id/edit" element={<DealForm />} />
    </Routes>
  );
}
