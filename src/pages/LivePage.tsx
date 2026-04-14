import LineChartCard from "../components/LineChartCard";
import StatusCard from "../components/StatusCard";
import { useFx2Realtime } from "../hooks/useFx2Realtime";

const DEFAULT_WS_URL = "ws://localhost:8080/fx2";

const normalizeWebSocketUrl = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return DEFAULT_WS_URL;
  }

  const normalizedInput = /^wss?:\/\//.test(trimmed) ? trimmed : `ws://${trimmed}`;

  try {
    const url = new URL(normalizedInput);

    if (url.pathname === "/" || !url.pathname) {
      url.pathname = "/fx2";
    }

    return url.toString();
  } catch {
    if (normalizedInput.endsWith("/fx2")) {
      return normalizedInput;
    }

    return `${normalizedInput.replace(/\/+$/, "")}/fx2`;
  }
};

const WS_URL = normalizeWebSocketUrl(import.meta.env.VITE_FX2_WS_URL || DEFAULT_WS_URL);

const formatDuration = (seconds: number) => {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

export default function LivePage() {
  const { state, connectionStatus, activeMode, switchToMock, switchToWebSocket } = useFx2Realtime({
    mode: "websocket",
    websocketUrl: WS_URL,
    fallbackToMockOnDisconnect: true
  });

  return (
    <div className="grid grid-cols-1 gap-cardGap xl:grid-cols-dashboard">
      <LineChartCard title="좌측 EEG (CH1)" values={state.ch1} color="#2563EB" />
      <LineChartCard title="우측 EEG (CH2)" values={state.ch2} color="#06B6D4" />

      <StatusCard title="심박수" value={`${state.heartRate} bpm`} hint="최근 5초 평균" tone="primary" />
      <StatusCard title="착용 상태" value={state.wearStatus === "worn" ? "안정적" : "확인 필요"} hint="센서 밀착 기준" tone="secondary" />
      <StatusCard title="신호 품질" value={state.signalStatus.toUpperCase()} hint="노이즈 지수 3%" />
      <StatusCard title="연결 상태" value={state.connected ? "Connected" : "Disconnected"} hint={`socket: ${connectionStatus}`} />

      <section className="fx2-card col-span-12 sm:col-span-6 xl:col-span-3">
        <h2 className="fx2-muted mb-3">세션 시간</h2>
        <p className="fx2-value">{formatDuration(state.sessionSeconds)}</p>
        <p className="fx2-muted mt-3">업데이트 {new Date(state.lastUpdated).toLocaleTimeString()}</p>
      </section>

      <section className="fx2-card col-span-12 sm:col-span-6 xl:col-span-3">
        <h2 className="fx2-muted mb-3">데모 제어 패널</h2>
        <p className="mb-3 text-xs text-fx2-muted">active mode: {activeMode}</p>
        <p className="mb-3 break-all text-xs text-fx2-muted">endpoint: {WS_URL}</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <button onClick={switchToWebSocket} className="rounded-xl bg-fx2-primary px-3 py-2 font-semibold text-white">WS 재연결</button>
          <button onClick={switchToMock} className="rounded-xl bg-slate-100 px-3 py-2 font-semibold text-fx2-text">Mock 전환</button>
          <button className="rounded-xl bg-fx2-secondary px-3 py-2 font-semibold text-white">이벤트 기록</button>
          <button className="rounded-xl bg-slate-100 px-3 py-2 font-semibold text-fx2-text">초기화</button>
        </div>
      </section>

      <section className="fx2-card col-span-12 xl:col-span-6">
        <h2 className="fx2-title mb-4">이벤트 로그</h2>
        <ul className="space-y-2 text-sm text-fx2-muted">
          {state.logs.slice().reverse().slice(0, 8).map((log) => (
            <li key={log} className="rounded-xl bg-slate-50 px-3 py-2">{log}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
