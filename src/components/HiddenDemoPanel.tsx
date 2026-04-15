import type { Fx2State } from "../types/fx2";

type DemoPreset = "balanced" | "weakSignal" | "notWorn" | "disconnected" | "reset";

interface HiddenDemoPanelProps {
  open: boolean;
  state: Fx2State;
  onClose: () => void;
  onPatch: (patch: {
    ch1?: number;
    ch2?: number;
    bpm?: number;
    wearing?: boolean;
    signalQuality?: number;
    connection?: "connected" | "disconnected";
    noise?: boolean;
  }) => void;
  onApplyPreset: (preset: DemoPreset) => void;
}

const rangeInputClassName =
  "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#EAF0F8] accent-[#2563EB]";

const ToggleButton = ({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
      active
        ? "bg-[#2563EB] text-white"
        : "bg-[#EAF0F8] text-[#6B7280] hover:bg-[#2563EB] hover:text-white"
    }`}
  >
    {label}
  </button>
);

export default function HiddenDemoPanel({
  open,
  state,
  onClose,
  onPatch,
  onApplyPreset,
}: HiddenDemoPanelProps) {
  return (
    <aside
      className={`fixed right-4 top-[88px] z-40 w-[min(360px,calc(100vw-32px))] rounded-card bg-white p-5 shadow-lg transition duration-300 ${
        open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[110%] opacity-0"
      }`}
    >
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#2563EB]">
            Hidden Demo Panel
          </p>
          <h3 className="mt-1.5 text-lg font-semibold text-[#111827]">시연용 수동 제어</h3>
          <p className="mt-1 text-xs text-[#6B7280]">
            앱 없이도 라이브 화면을 검증할 수 있는 비상 제어 패널입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-[#EAF0F8] px-3 py-1 text-xs font-semibold text-[#6B7280] hover:bg-[#2563EB] hover:text-white transition-colors duration-200"
        >
          닫기
        </button>
      </div>

      <div className="space-y-5">
        <label className="block">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[#111827]">좌뇌 EEG</span>
            <span className="text-xs font-semibold text-[#2563EB]">
              {state.ch1[state.ch1.length - 1]?.toFixed(2) ?? "0.00"}
            </span>
          </div>
          <input
            className={rangeInputClassName}
            type="range"
            min="-2.5"
            max="2.5"
            step="0.05"
            value={state.ch1[state.ch1.length - 1] ?? 0}
            onChange={(event) => onPatch({ ch1: Number(event.target.value) })}
          />
        </label>

        <label className="block">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[#111827]">우뇌 EEG</span>
            <span className="text-xs font-semibold text-[#06B6D4]">
              {state.ch2[state.ch2.length - 1]?.toFixed(2) ?? "0.00"}
            </span>
          </div>
          <input
            className={rangeInputClassName}
            type="range"
            min="-2.5"
            max="2.5"
            step="0.05"
            value={state.ch2[state.ch2.length - 1] ?? 0}
            onChange={(event) => onPatch({ ch2: Number(event.target.value) })}
          />
        </label>

        <label className="block">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[#111827]">심박수</span>
            <span className="text-xs font-semibold text-[#111827]">
              {state.heartRate} bpm
            </span>
          </div>
          <input
            className={rangeInputClassName}
            type="range"
            min="48"
            max="128"
            step="1"
            value={state.heartRate}
            onChange={(event) => onPatch({ bpm: Number(event.target.value) })}
          />
        </label>

        <label className="block">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[#111827]">신호 품질</span>
            <span className="text-xs font-semibold text-[#111827]">
              {state.signalQuality}%
            </span>
          </div>
          <input
            className={rangeInputClassName}
            type="range"
            min="0"
            max="100"
            step="1"
            value={state.signalQuality}
            onChange={(event) => onPatch({ signalQuality: Number(event.target.value) })}
          />
        </label>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[#111827]">착용 / 연결 / 노이즈</p>
          <div className="flex flex-wrap gap-2">
            <ToggleButton
              active={state.wearStatus !== "not_worn"}
              onClick={() => onPatch({ wearing: state.wearStatus === "not_worn" })}
              label={state.wearStatus === "not_worn" ? "미착용" : "착용 중"}
            />
            <ToggleButton
              active={state.connected}
              onClick={() =>
                onPatch({ connection: state.connected ? "disconnected" : "connected" })
              }
              label={state.connected ? "연결됨" : "연결 끊김"}
            />
            <ToggleButton
              active={!state.noise}
              onClick={() => onPatch({ noise: !state.noise })}
              label={state.noise ? "노이즈 있음" : "노이즈 적음"}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[#111827]">프리셋</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-2xl bg-[#2563EB] px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              onClick={() => onApplyPreset("balanced")}
            >
              안정 측정
            </button>
            <button
              type="button"
              className="rounded-2xl bg-[#06B6D4] px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              onClick={() => onApplyPreset("weakSignal")}
            >
              약한 신호
            </button>
            <button
              type="button"
              className="rounded-2xl bg-[#F59E0B] px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              onClick={() => onApplyPreset("notWorn")}
            >
              미착용
            </button>
            <button
              type="button"
              className="rounded-2xl bg-[#EF4444] px-3 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              onClick={() => onApplyPreset("disconnected")}
            >
              연결 끊김
            </button>
          </div>
          <button
            type="button"
            onClick={() => onApplyPreset("reset")}
            className="w-full rounded-2xl bg-[#EAF0F8] px-3 py-2.5 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#2563EB] hover:text-white"
          >
            세션 상태 초기화
          </button>
        </div>
      </div>
    </aside>
  );
}
