import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Fx2RealtimeProvider } from "./context/Fx2RealtimeContext";
import HomePage from "./pages/HomePage";
import LivePage from "./pages/LivePage";
import SummaryPage from "./pages/SummaryPage";

export default function App() {
  return (
    <Fx2RealtimeProvider>
      <Routes>
        <Route
          path="/"
          element={
            <Layout title="연결 시작 화면">
              <HomePage />
            </Layout>
          }
        />
        <Route
          path="/live"
          element={
            <Layout title="실시간 측정 대시보드">
              <LivePage />
            </Layout>
          }
        />
        <Route
          path="/summary"
          element={
            <Layout title="결과 요약 화면">
              <SummaryPage />
            </Layout>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Fx2RealtimeProvider>
  );
}
