import { useNavigate } from "react-router-dom";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";
import type { DeviceMode } from "../types/fx2";

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
    body: "Web Bluetooth API로 FX2 장치에서 직접 데이터를 수신합니다.",
  },
  {
    key: "uart",
    title: "UART",
    body: "Web Serial API로 USB-UART를 통해 FX2 장치에서 직접 데이터를 수신합니다.",
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

export default function HomePage() {
  const navigate = useNavigate();
  const {
    state,
    selectedMode,
    hardwareStatus,
    hardwareDetail,
    setSelectedMode,
    startSession,
  } = useFx2RealtimeSession();

  const handleStart = () => {
    startSession();
    navigate("/live");
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">

      {/* ── Main card ── */}
      <section className="fx2-card lg:col-span-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#2563EB]">
          FX2 Neuro Feedback
        </p>
        <h2 className="mt-3 text-3xl font-bold leading-tight text-[#111827]">
          FX2 장치 또는 로컬 시뮬레이션으로
          <br />
          실시간 뇌파 데이터를 시각화합니다
        </h2>
        <p className="mt-4 max-w-2xl text-sm text-[#6B7280]">
          Demo 모드는 브라우저 안에서 시뮬레이션 데이터를 생성합니다.
          Bluetooth 또는 UART 모드에서는 실제 FX2 장치가 필요합니다.
        </p>

        {/* Mode selection */}
        <div className="mt-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#6B7280]">
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
                  className={`rounded-2xl p-4 text-left transition-all duration-200 ${
                    active
                      ? "bg-[#EFF6FF] shadow-md ring-2 ring-[#2563EB] ring-opacity-40"
                      : "bg-[#EAF0F8] shadow-sm hover:shadow-md"
                  }`}
                >
                  <p className="text-sm font-semibold text-[#111827]">{item.title}</p>
                  <p className="mt-2 text-xs leading-5 text-[#6B7280]">{item.body}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Info block */}
        <div className="mt-6 rounded-2xl bg-[#EAF0F8] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#111827]">현재 검증 방식</p>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#6B7280]">
              {hardwareLabelMap[hardwareStatus]}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#6B7280]">
            {selectedMode === "demo"
              ? "로컬 데모 모드에서는 웹 안에서만 값을 생성합니다."
              : selectedMode === "bluetooth"
              ? "브라우저 단독 실험 시에는 Web Bluetooth를 사용할 수 있습니다."
              : "브라우저 단독 실험 시에는 Web Serial을 사용할 수 있습니다."}
          </p>
          {hardwareDetail ? (
            <p className="mt-2 text-xs leading-5 text-[#6B7280]">{hardwareDetail}</p>
          ) : null}
        </div>

        <button
          onClick={handleStart}
          className="mt-8 inline-flex items-center rounded-2xl bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white shadow-md transition-opacity duration-200 hover:opacity-90"
        >
          실시간 측정 시작
        </button>
      </section>

      {/* ── Status sidebar ── */}
      <section className="fx2-card lg:col-span-4">
        <h3 className="fx2-title mb-5">현재 상태</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280]">장치 모드</span>
            <span className="text-xs font-semibold text-[#111827]">{selectedMode.toUpperCase()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280]">하드웨어 상태</span>
            <span className="text-xs font-semibold text-[#111827]">{hardwareLabelMap[hardwareStatus]}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280]">착용 상태</span>
            <span className="text-xs font-semibold text-[#111827]">{wearLabel[state.wearStatus]}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280]">신호 품질</span>
            <span className="text-xs font-semibold text-[#111827]">{signalLabel[state.signalStatus]}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280]">심박수</span>
            <span className="text-xs font-semibold text-[#111827]">{state.heartRate} bpm</span>
          </div>
        </div>
      </section>

    </div>
  );
}
