import { useEffect, useMemo, useRef, useState } from "react";
import EEGChartV2 from "../components/EEGChartV2";
import HiddenDemoPanel from "../components/HiddenDemoPanel";
import LineChartCard from "../components/LineChartCard";
import { useFx2RealtimeSession } from "../context/Fx2RealtimeContext";

const formatDuration = (seconds: number) => {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

const wearLabel = {
  worn: "안정적",
  unstable: "불안정",
  not_worn: "미착용",
} as const;

const signalLabel = {
  good: "좋음",
  normal: "보통",
  poor: "나쁨",
} as const;

interface CompactStatusItemProps {
  icon: string;
  label: string;
  value: string;
  iconClassName: string;
  valueClassName?: string;
}

function CompactStatusItem({
  icon,
  label,
  value,
  iconClassName,
  valueClassName = "text-[#111827]",
}: CompactStatusItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-card">
      <span
        className={`inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${iconClassName}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-none text-[#111827]">
          <span className={valueClassName}>{value}</span>
        </p>
        <p className="mt-1 text-xs text-[#6B7280]">{label}</p>
      </div>
    </div>
  );
}

export default function LivePage() {
  const {
    state,
    summary,
    selectedMode,
    hardwareDetail,
    stopSession,
    disconnectHardware,
    pushManualUpdate,
    applyPreset,
  } = useFx2RealtimeSession();

  const [panelOpen, setPanelOpen] = useState(false);
  const [windowSeconds, setWindowSeconds] = useState<10 | 30 | 60>(30);
  const [paused, setPaused] = useState(false);
  const [ch1Visible, setCh1Visible] = useState(true);
  const [ch2Visible, setCh2Visible] = useState(true);
  const [chartTheme, setChartTheme] = useState<"light" | "dark">("light");
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const logContainerRef = useRef<HTMLUListElement | null>(null);

  const visibleLogs = useMemo(
    () => state.logs.slice().reverse().slice(0, 10),
    [state.logs]
  );

  useEffect(() => {
    if (!autoScrollLogs) {
      return;
    }

    logContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [autoScrollLogs, visibleLogs]);

  return (
    <>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid gap-3 md:grid-cols-2 xl:flex xl:flex-1 xl:flex-nowrap">
              <CompactStatusItem
                icon="♥"
                label="심박수"
                value={`${state.heartRate} bpm`}
                iconClassName="bg-red-50 text-[#EF4444]"
                valueClassName="text-[#111827]"
              />
              <CompactStatusItem
                icon="◎"
                label="착용"
                value={wearLabel[state.wearStatus]}
                iconClassName={
                  state.wearStatus === "worn"
                    ? "bg-green-50 text-[#22C55E]"
                    : state.wearStatus === "unstable"
                    ? "bg-amber-50 text-[#F59E0B]"
                    : "bg-red-50 text-[#EF4444]"
                }
                valueClassName={
                  state.wearStatus === "worn"
                    ? "text-[#22C55E]"
                    : state.wearStatus === "unstable"
                    ? "text-[#F59E0B]"
                    : "text-[#EF4444]"
                }
              />
              <CompactStatusItem
                icon="≈"
                label="신호"
                value={`${state.signalQuality}% · ${signalLabel[state.signalStatus]}`}
                iconClassName={
                  state.signalStatus === "good"
                    ? "bg-green-50 text-[#22C55E]"
                    : state.signalStatus === "normal"
                    ? "bg-amber-50 text-[#F59E0B]"
                    : "bg-red-50 text-[#EF4444]"
                }
                valueClassName={
                  state.signalStatus === "good"
                    ? "text-[#22C55E]"
                    : state.signalStatus === "normal"
                    ? "text-[#F59E0B]"
                    : "text-[#EF4444]"
                }
              />
              <CompactStatusItem
                icon="⏱"
                label="세션시간"
                value={formatDuration(state.sessionSeconds)}
                iconClassName="bg-blue-50 text-[#2563EB]"
                valueClassName="text-[#2563EB]"
              />
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => setPanelOpen((current) => !current)}
                className="rounded-full bg-[#EAF0F8] px-4 py-2 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#2563EB] hover:text-white"
              >
                {panelOpen ? "데모 패널 숨기기" : "데모 패널 열기"}
              </button>
              <button
                type="button"
                onClick={disconnectHardware}
                className="rounded-full bg-[#EAF0F8] px-4 py-2 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white"
              >
                장치 연결 해제
              </button>
              <button
                type="button"
                onClick={stopSession}
                className="rounded-full bg-red-50 px-4 py-2 text-xs font-semibold text-[#EF4444] transition-colors duration-200 hover:bg-[#EF4444] hover:text-white"
              >
                측정 종료
              </button>
            </div>
          </div>

          {hardwareDetail ? (
            <p className="text-xs text-[#6B7280]">{hardwareDetail}</p>
          ) : null}
        </section>

        <div className="w-full">
          <EEGChartV2
            ch1={state.ch1}
            ch2={state.ch2}
            timestamps={state.timestamps}
            mode={selectedMode}
            windowSeconds={windowSeconds}
            paused={paused}
            ch1Visible={ch1Visible}
            ch2Visible={ch2Visible}
            theme={chartTheme}
            onPauseToggle={() => setPaused((current) => !current)}
            onWindowChange={setWindowSeconds}
            onCh1Toggle={() => setCh1Visible((current) => !current)}
            onCh2Toggle={() => setCh2Visible((current) => !current)}
            onThemeToggle={() =>
              setChartTheme((current) => (current === "light" ? "dark" : "light"))
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <section className="fx2-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="fx2-title">이벤트 로그</h2>
                <p className="mt-1 text-xs text-[#6B7280]">
                  최신 항목 우선 · 최대 10개 표시
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoScrollLogs((current) => !current)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                  autoScrollLogs
                    ? "bg-[#2563EB] text-white"
                    : "bg-[#EAF0F8] text-[#6B7280] hover:bg-[#2563EB] hover:text-white"
                }`}
              >
                자동 스크롤
              </button>
            </div>

            <ul
              ref={logContainerRef}
              className="max-h-[240px] space-y-2 overflow-y-auto pr-1"
            >
              {visibleLogs.map((log, index) => (
                <li
                  key={`${log}-${index}`}
                  className="rounded-2xl bg-[#EAF0F8] px-3 py-2 text-xs leading-5 text-[#6B7280]"
                >
                  {log}
                </li>
              ))}
            </ul>
          </section>

          <LineChartCard
            title="심박 추이"
            subtitle={`평균 ${summary.averageHeartRate || state.heartRate} bpm · 안정성 ${summary.stabilityScore}/100`}
            values={state.heartRateHistory}
            color="#2563EB"
          />
        </div>
      </div>

      <HiddenDemoPanel
        open={panelOpen}
        state={state}
        onClose={() => setPanelOpen(false)}
        onPatch={(patch) => pushManualUpdate(patch)}
        onApplyPreset={applyPreset}
      />
    </>
  );
}
