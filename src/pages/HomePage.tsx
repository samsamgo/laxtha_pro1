import { useNavigate } from "react-router-dom";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";
import type { DeviceMode, SessionSource } from "../types/fx2";

const modeCards: Array<{
  key: DeviceMode;
  title: string;
  body: string;
}> = [
  { key: "demo", title: "Demo", body: "내장 데모 흐름이나 앱 리모컨으로 가장 빠르게 시연할 수 있습니다." },
  { key: "bluetooth", title: "Bluetooth", body: "실장치 BLE 연동을 염두에 둔 시연 모드입니다. 현재는 공통 상태 구조로 검증합니다." },
  { key: "uart", title: "UART", body: "시리얼 장비 확장을 고려한 모드입니다. 오늘은 WebSocket 브리지 기준으로 검증합니다." }
];

const sourceCards: Array<{
  key: SessionSource;
  title: string;
  body: string;
}> = [
  { key: "remote", title: "앱 리모컨 / WebSocket", body: "모바일 앱과 연동해서 실시간으로 값을 밀어 넣는 본 시연 흐름입니다." },
  { key: "demo", title: "내장 데모", body: "앱이 없어도 웹 단독으로 흐름과 화면을 확인할 수 있는 로컬 시뮬레이션입니다." }
];

const connectionLabelMap = {
  waiting: "브리지 연결 시도 중",
  connected: "실시간 연결됨",
  disconnected: "연결 대기 중"
} as const;

export default function HomePage() {
  const navigate = useNavigate();
  const {
    state,
    selectedMode,
    sessionSource,
    websocketUrl,
    connectionStatus,
    setSelectedMode,
    setSessionSource,
    setWebsocketUrl,
    startSession
  } = useFx2RealtimeSession();

  const handleStart = () => {
    startSession();
    navigate("/live");
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_0.9fr]">
      <section className="rounded-[30px] border border-white/70 bg-white/85 p-6 shadow-card md:p-8">
        <div className="inline-flex rounded-full bg-blue-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-fx2-primary">
          FX2 Project Hub
        </div>
        <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight text-slate-950">
          연결 상태와 착용 상태를 한눈에 보여주는 락싸 전용 시연용 웹페이지
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-fx2-muted">
          일반 사용자도 바로 이해할 수 있도록, 측정 흐름은 단순하고 상태 표시는 분명하게 구성했습니다.
          오늘은 WebSocket 기반 앱 연동과 데모 시나리오를 완결하는 데 집중합니다.
        </p>

        <div className="mt-8 space-y-8">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-950">1. 장비 모드 선택</h3>
              <span className="text-sm text-fx2-muted">현재 선택: {selectedMode.toUpperCase()}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {modeCards.map((item) => {
                const active = item.key === selectedMode;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedMode(item.key)}
                    className={`rounded-[24px] border p-4 text-left transition ${
                      active
                        ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-300"
                        : "border-slate-200 bg-white text-slate-950 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-semibold uppercase tracking-[0.2em]">{item.title}</p>
                    <p className={`mt-3 text-sm leading-6 ${active ? "text-slate-200" : "text-fx2-muted"}`}>
                      {item.body}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-950">2. 실시간 입력 방식</h3>
              <span className="text-sm text-fx2-muted">{sessionSource === "remote" ? "앱 리모컨" : "내장 데모"}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {sourceCards.map((item) => {
                const active = item.key === sessionSource;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSessionSource(item.key)}
                    className={`rounded-[24px] border p-4 text-left transition ${
                      active
                        ? "border-fx2-primary bg-blue-50 shadow-md shadow-blue-100"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-base font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-fx2-muted">{item.body}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {sessionSource === "remote" ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">3. WebSocket 브리지 주소</h3>
                  <p className="mt-1 text-sm text-fx2-muted">실기기 앱은 보통 `ws://내PC아이피:8080/fx2` 로 입력하면 됩니다.</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-fx2-muted">
                  {connectionLabelMap[connectionStatus]}
                </span>
              </div>
              <input
                className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none ring-0 transition focus:border-fx2-primary"
                value={websocketUrl}
                onChange={(event) => setWebsocketUrl(event.target.value)}
                placeholder="ws://localhost:8080/fx2"
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleStart}
              className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5"
            >
              측정 시작하고 대시보드 열기
            </button>
            <p className="text-sm text-fx2-muted">웹과 앱을 동시에 열어도 같은 상태 구조를 공유합니다.</p>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="fx2-card">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fx2-primary">현재 상태</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-fx2-muted">연결 상태</span>
              <strong>{state.connected ? "연결됨" : "대기 중"}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fx2-muted">착용 상태</span>
              <strong>{state.wearStatus === "worn" ? "안정 착용" : state.wearStatus === "unstable" ? "불안정" : "미착용"}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fx2-muted">신호 품질</span>
              <strong>{state.signalQuality}%</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fx2-muted">심박수</span>
              <strong>{state.heartRate} bpm</strong>
            </div>
          </div>
        </section>

        <section className="fx2-card">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fx2-primary">오늘 시연 포인트</p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-fx2-muted">
            <li>좌뇌 / 우뇌 EEG 흐름이 동시에 살아 있는지 확인합니다.</li>
            <li>연결, 착용, 신호 품질 상태가 한눈에 읽히는지 점검합니다.</li>
            <li>앱 리모컨과 웹 대시보드가 실시간으로 같은 값을 보는지 검증합니다.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
