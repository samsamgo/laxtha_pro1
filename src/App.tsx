import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import LivePage from "./pages/LivePage";
import SummaryPage from "./pages/SummaryPage";

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout title="FX2 홈">
            <HomePage />
          </Layout>
        }
      />
      <Route
        path="/live"
        element={
          <Layout title="실시간 대시보드">
            <LivePage />
          </Layout>
        }
      />
      <Route
        path="/summary"
        element={
          <Layout title="측정 요약">
            <SummaryPage />
          </Layout>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
