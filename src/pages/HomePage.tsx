import { useEffect, useMemo, useState } from "react";
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
  poor: "부족",
} as const;

const modeCards: Array<{
  key: DeviceMode;
  title: string;
  body: string;
  badge: string;
}> = [
  {
    key: "demo",
    title: "Demo",
    body: "브라우저 내부에서 로컬 mock 신호를 만들어 UI와 차트를 빠르게 확인합니다.",
    badge: "로컬 시뮬레이션",
  },
  {
    key: "bluetooth",
    title: "Bluetooth",
    body: "Web Bluetooth API로 FX2 장치에서 JSON 신호를 직접 수신합니다.",
    badge: "Chrome / Edge",
  },
  {
    key: "uart",
    title: "UART",
    body: "Web Serial API로 USB-UART 연결의 바이너리 스트림을 그대로 표시합니다.",
    badge: "Chrome / Edge",
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

  const [bleSupported, setBleSupported] = useState(true);
  const [serialSupported, setSerialSupported] = useState(true);

  useEffect(() => {
    setBleSupported(typeof navigator !== "undefined" && "bluetooth" in navigator);
    setSerialSupported(typeof navigator !== "undefined" && "serial" in navigator);
  }, []);

  const selectedModeSupported =
    selectedMode === "demo" ||
    (selectedMode === "bluetooth" ? bleSupported : serialSupported);

  const isConnecting =
    selectedMode !== "demo" &&
    (hardwareStatus === "requesting" || hardwareStatus === "connecting");

  const unsupportedMessage = useMemo(() => {
    if (selectedMode === "bluetooth" && !bleSupported) {
      return "이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome 또는 Edge에서 다시 시도해 주세요.";
    }

    if (selectedMode === "uart" && !serialSupported) {
      return "이 브라우저는 Web Serial을 지원하지 않습니다. Chrome 또는 Edge에서 다시 시도해 주세요.";
    }

    return null;
  }, [bleSupported, selectedMode, serialSupported]);

  const handleStart = () => {
    if (!selectedModeSupported) {
      return;
    }

    startSession();
    navigate("/live");
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <section className="fx2-card fx2-outline lg:col-span-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2563EB]">
          FX2 Neuro Feedback
        </p>
        <h2 className="mt-3 text-3xl font-bold leading-tight text-[#111827] dark:text-white">
          FX2 장치 또는 데모 모드로
          <br />
          실시간 뇌파 데이터를 시각화합니다
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#6B7280] dark:text-slate-400">
          Demo 모드는 브라우저 내부 mock 생성기를 사용하고, Bluetooth 및 UART는
          Chrome 또는 Edge에서 실제 FX2 장치와 직접 연결됩니다.
        </p>

        <div className="mt-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#6B7280] dark:text-slate-400">
            장치 모드
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {modeCards.map((item) => {
              const active = item.key === selectedMode;
              const unsupported =
                (item.key === "bluetooth" && !bleSupported) ||
                (item.key === "uart" && !serialSupported);

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedMode(item.key)}
                  className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                    active
                      ? "border-[#2563EB] ring-2 ring-[#2563EB] shadow-md"
                      : "border-transparent bg-[#EAF0F8] hover:shadow-md dark:bg-slate-800"
                  } ${
                    active
                      ? "bg-[#EFF6FF] dark:bg-slate-900"
                      : "dark:text-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#111827] dark:text-white">
                      {item.title}
                    </p>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6B7280] dark:bg-slate-700 dark:text-slate-300">
                      {item.badge}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[#6B7280] dark:text-slate-400">
                    {item.body}
                  </p>
                  {unsupported ? (
                    <p className="mt-3 text-xs leading-5 text-[#EF4444]">
                      {item.key === "bluetooth"
                        ? "Web Bluetooth 미지원 브라우저입니다."
                        : "Web Serial 미지원 브라우저입니다."}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="fx2-surface mt-6 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#111827] dark:text-white">
              현재 연결 방식
            </p>
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#6B7280] dark:text-slate-400">
              {hardwareLabelMap[hardwareStatus]}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#6B7280] dark:text-slate-400">
            {selectedMode === "demo"
              ? "브라우저 내부 generator가 1초 간격으로 데모 신호를 보냅니다."
              : selectedMode === "bluetooth"
              ? "Bluetooth 권한 승인 후 FX2 BLE 신호를 직접 수신합니다."
              : "UART 권한 승인 후 0-255 바이너리 값을 단계형 차트로 표시합니다."}
          </p>
          {hardwareDetail ? (
            <p className="mt-2 text-xs leading-5 text-[#6B7280] dark:text-slate-400">
              {hardwareDetail}
            </p>
          ) : null}
          {unsupportedMessage ? (
            <p className="mt-2 text-xs leading-5 text-[#EF4444]">{unsupportedMessage}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleStart}
          disabled={!selectedModeSupported || isConnecting}
          className={`mt-8 inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-md transition-opacity duration-200 ${
            selectedModeSupported && !isConnecting
              ? "bg-[#2563EB] hover:opacity-90"
              : "cursor-not-allowed bg-gray-400 opacity-50"
          }`}
        >
          {isConnecting ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              연결 중...
            </>
          ) : (
            "실시간 측정 시작"
          )}
        </button>
      </section>

      <section className="fx2-card fx2-outline lg:col-span-4">
        <h3 className="fx2-title mb-5">현재 상태</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280] dark:text-slate-400">장치 모드</span>
            <span className="text-xs font-semibold text-[#111827] dark:text-white">
              {selectedMode.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280] dark:text-slate-400">
              하드웨어 상태
            </span>
            <span className="text-xs font-semibold text-[#111827] dark:text-white">
              {hardwareLabelMap[hardwareStatus]}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280] dark:text-slate-400">착용 상태</span>
            <span className="text-xs font-semibold text-[#111827] dark:text-white">
              {wearLabel[state.wearStatus]}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280] dark:text-slate-400">신호 품질</span>
            <span className="text-xs font-semibold text-[#111827] dark:text-white">
              {signalLabel[state.signalStatus]}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#6B7280] dark:text-slate-400">심박수</span>
            <span className="text-xs font-semibold text-[#111827] dark:text-white">
              {state.heartRate} bpm
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
