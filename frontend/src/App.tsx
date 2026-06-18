import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Layout title="ダッシュボード">準備中</Layout>} />
    </Routes>
  );
}
