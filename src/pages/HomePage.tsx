import { useNavigate } from "react-router-dom";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";
import type { DeviceMode, SessionSource } from "../types/fx2";

const wearLabel = {
  worn: "착용 중",
  unstable: "불안정",
  not_worn: "미착용",
} as const;

const signalLabel = {
  good: "좋음",
  normal: "보통",
  poor: "나쁨",
} as const;

const modeCards: Array<{
  key: DeviceMode;
  title: string;
  body: string;
}> = [
  {
    key: "demo",
    title: "Demo",
    body: "웹 단독으로 차트와 상태 흐름을 확인하는 로컬 시뮬레이션입니다.",
  },
  {
    key: "bluetooth",
    title: "Bluetooth",
    body: "스마트폰 앱이 Bluetooth 시나리오 값을 웹으로 보내는 원격 제어 모드입니다.",
  },
  {
    key: "uart",
    title: "UART",
    body: "스마트폰 앱이 UART 시나리오 값을 웹으로 보내는 원격 제어 모드입니다.",
  },
];

const sourceCards: Array<{
  key: SessionSource;
  title: string;
  body: string;
}> = [
  {
    key: "remote",
    title: "앱/웹 동기화",
    body: "WebSocket 브리지에 연결해 앱과 웹이 같은 값을 공유합니다.",
  },
  {
    key: "demo",
    title: "로컬 전용",
    body: "현재 브라우저 안에서만 값을 처리하고, 외부 브리지는 사용하지 않습니다.",
  },
];

const hardwareLabelMap = {
  idle: "대기",
  requesting: "권한 요청 중",
  connecting: "장치 연결 중",
  connected: "장치 연결됨",
  unsupported: "브라우저 미지원",
  error: "연결 오류",
} as const;

const connectionLabelMap = {
  waiting: "브리지 연결 시도 중",
  connected: "브리지 연결됨",
  disconnected: "브리지 미연결",
} as const;

export default function HomePage() {
  const navigate = useNavigate();
  const {
    state,
    selectedMode,
    sessionSource,
    websocketUrl,
    connectionStatus,
    hardwareStatus,
    hardwareDetail,
    setSelectedMode,
    setSessionSource,
    setWebsocketUrl,
    startSession,
  } = useFx2RealtimeSession();

  const handleStart = () => {
    startSession();
    navigate("/live");
  };

  return (
    <div className="grid grid-cols-1 gap-cardGap lg:grid-cols-12">
      <section className="fx2-card lg:col-span-8">
        <p className="text-sm font-semibold text-fx2-primary">
          FX2 Neuro Feedback
        </p>
        <h2 className="mt-2 text-3xl font-semibold leading-tight text-fx2-text">
          스마트폰 앱이 보내는 값을 웹 차트에 바로 반영하는 실시간 리모컨 대시보드
        </h2>
        <p className="mt-4 max-w-2xl text-fx2-muted">
          지금 단계에서는 FX2 없이도 앱과 웹만으로 동작하도록 정리했습니다.
          앱에서 Bluetooth 또는 UART 시나리오를 선택하고 값을 보내면, 웹이
          같은 세션을 받아 차트와 상태를 갱신합니다.
        </p>

        <div className="mt-8 grid gap-4 xl:grid-cols-2">
          <div>
            <p className="mb-3 text-sm font-semibold text-fx2-text">
              장치 모드
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {modeCards.map((item) => {
                const active = item.key === selectedMode;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedMode(item.key)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-fx2-primary bg-blue-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-fx2-text">
                      {item.title}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-fx2-muted">
                      {item.body}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-fx2-text">
              동기화 범위
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {sourceCards.map((item) => {
                const active = item.key === sessionSource;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSessionSource(item.key)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-fx2-primary bg-blue-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-fx2-text">
                      {item.title}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-fx2-muted">
                      {item.body}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {sessionSource === "remote" ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-fx2-text">
                WebSocket 브리지 주소
              </p>
              <span className="text-xs font-semibold text-fx2-muted">
                {connectionLabelMap[connectionStatus]}
              </span>
            </div>
            <input
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-fx2-text outline-none transition focus:border-fx2-primary"
              value={websocketUrl}
              onChange={(event) => setWebsocketUrl(event.target.value)}
              placeholder="ws://192.168.0.10:8080/fx2"
            />
            <p className="mt-2 text-xs leading-6 text-fx2-muted">
              휴대폰 실기기에서는 `localhost` 대신 컴퓨터의 같은 네트워크 IP를
              넣어 주세요.
            </p>
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-fx2-text">현재 검증 방식</p>
            <span className="text-xs font-semibold text-fx2-muted">
              {sessionSource === "remote" ? "앱 리모컨 우선" : hardwareLabelMap[hardwareStatus]}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-fx2-muted">
            {sessionSource === "remote"
              ? "웹은 브리지에만 연결하고, 스마트폰 앱이 보낸 Bluetooth/UART 시나리오 값을 그대로 표시합니다."
              : selectedMode === "demo"
              ? "로컬 데모 모드에서는 웹 안에서만 값을 생성합니다."
              : selectedMode === "bluetooth"
              ? "브라우저 단독 실험 시에는 Web Bluetooth를 사용할 수 있습니다."
              : "브라우저 단독 실험 시에는 Web Serial을 사용할 수 있습니다."}
          </p>
          {hardwareDetail ? (
            <p className="mt-2 text-xs leading-6 text-fx2-muted">
              {hardwareDetail}
            </p>
          ) : null}
        </div>

        <button
          onClick={handleStart}
          className="mt-8 inline-flex items-center rounded-2xl bg-fx2-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
        >
          실시간 측정 시작
        </button>
      </section>

      <section className="fx2-card lg:col-span-4">
        <h3 className="fx2-title mb-4">현재 상태</h3>
        <div className="space-y-3 text-sm">
          <p className="flex justify-between">
            <span className="text-fx2-muted">장치 모드</span>
            <strong>{selectedMode.toUpperCase()}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-fx2-muted">동기화 범위</span>
            <strong>{sessionSource === "remote" ? "앱/웹 동기화" : "로컬 전용"}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-fx2-muted">브리지 상태</span>
            <strong>{connectionLabelMap[connectionStatus]}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-fx2-muted">하드웨어 상태</span>
            <strong>{sessionSource === "remote" ? "앱 리모컨 사용" : hardwareLabelMap[hardwareStatus]}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-fx2-muted">착용 상태</span>
            <strong>{wearLabel[state.wearStatus]}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-fx2-muted">신호 품질</span>
            <strong>{signalLabel[state.signalStatus]}</strong>
          </p>
          <p className="flex justify-between">
            <span className="text-fx2-muted">심박수</span>
            <strong>{state.heartRate} bpm</strong>
          </p>
        </div>
      </section>
    </div>
  );
}
