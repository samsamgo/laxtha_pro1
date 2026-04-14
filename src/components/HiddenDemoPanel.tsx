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

const rangeInputClassName = "h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-fx2-primary";

const ToggleButton = ({
  active,
  onClick,
  label
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
      active ? "bg-fx2-primary text-white" : "bg-slate-100 text-fx2-muted hover:bg-slate-200"
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
  onApplyPreset
}: HiddenDemoPanelProps) {
  return (
    <aside
      className={`fixed right-4 top-[96px] z-40 w-[min(360px,calc(100vw-32px))] rounded-[28px] border border-slate-200 bg-white/96 p-5 shadow-2xl shadow-slate-300/35 backdrop-blur transition duration-300 ${
        open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[110%] opacity-0"
      }`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fx2-primary">Hidden Demo Panel</p>
          <h3 className="mt-2 text-lg font-semibold text-fx2-text">시연용 수동 제어</h3>
          <p className="mt-1 text-sm text-fx2-muted">앱 없이도 라이브 화면을 검증할 수 있는 비상 제어 패널입니다.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-fx2-muted hover:bg-slate-200"
        >
          닫기
        </button>
      </div>

      <div className="space-y-4">
        <label className="block">
          <div className="mb-2 flex items-center justify-between text-sm font-medium text-fx2-text">
            <span>좌뇌 EEG</span>
            <span>{state.ch1[state.ch1.length - 1]?.toFixed(2) ?? "0.00"}</span>
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
          <div className="mb-2 flex items-center justify-between text-sm font-medium text-fx2-text">
            <span>우뇌 EEG</span>
            <span>{state.ch2[state.ch2.length - 1]?.toFixed(2) ?? "0.00"}</span>
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
          <div className="mb-2 flex items-center justify-between text-sm font-medium text-fx2-text">
            <span>심박수</span>
            <span>{state.heartRate} bpm</span>
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
          <div className="mb-2 flex items-center justify-between text-sm font-medium text-fx2-text">
            <span>신호 품질</span>
            <span>{state.signalQuality}%</span>
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
          <p className="text-sm font-medium text-fx2-text">착용 / 연결 / 노이즈</p>
          <div className="flex flex-wrap gap-2">
            <ToggleButton
              active={state.wearStatus !== "not_worn"}
              onClick={() => onPatch({ wearing: state.wearStatus === "not_worn" })}
              label={state.wearStatus === "not_worn" ? "미착용" : "착용 중"}
            />
            <ToggleButton
              active={state.connected}
              onClick={() => onPatch({ connection: state.connected ? "disconnected" : "connected" })}
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
          <p className="text-sm font-medium text-fx2-text">프리셋</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="rounded-2xl bg-fx2-primary px-3 py-3 text-sm font-semibold text-white" onClick={() => onApplyPreset("balanced")}>
              안정 측정
            </button>
            <button type="button" className="rounded-2xl bg-fx2-secondary px-3 py-3 text-sm font-semibold text-white" onClick={() => onApplyPreset("weakSignal")}>
              약한 신호
            </button>
            <button type="button" className="rounded-2xl bg-amber-500 px-3 py-3 text-sm font-semibold text-slate-950" onClick={() => onApplyPreset("notWorn")}>
              미착용
            </button>
            <button type="button" className="rounded-2xl bg-rose-500 px-3 py-3 text-sm font-semibold text-white" onClick={() => onApplyPreset("disconnected")}>
              연결 끊김
            </button>
          </div>
          <button
            type="button"
            onClick={() => onApplyPreset("reset")}
            className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm font-semibold text-fx2-text hover:bg-slate-50"
          >
            세션 상태 초기화
          </button>
        </div>
      </div>
    </aside>
  );
}
