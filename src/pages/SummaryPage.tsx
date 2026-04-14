import { useFx2Realtime } from "../hooks/useFx2Realtime";

const formatDuration = (seconds: number) => {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

const statusSummary = {
  worn: "착용 상태가 안정적으로 유지되었습니다.",
  unstable: "중간에 착용 상태 흔들림이 감지되었습니다.",
  not_worn: "미착용 구간이 있습니다. 다음 측정 시 착용 상태를 확인하세요."
};

export default function SummaryPage() {
  const { state } = useFx2Realtime({ mode: "mock", fallbackToMockOnDisconnect: true });

  return (
    <div className="grid grid-cols-1 gap-cardGap lg:grid-cols-12">
      <section className="fx2-card lg:col-span-8">
        <h2 className="fx2-title mb-4">측정 요약</h2>
        <p className="mb-8 text-lg leading-relaxed text-fx2-text">{statusSummary[state.wearStatus]}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="fx2-muted">세션 시간</p>
            <p className="mt-2 text-xl font-semibold">{formatDuration(state.sessionSeconds)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="fx2-muted">마지막 심박수</p>
            <p className="mt-2 text-xl font-semibold">{state.heartRate} bpm</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="fx2-muted">착용 상태</p>
            <p className="mt-2 text-xl font-semibold">{state.wearStatus}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="fx2-muted">신호 품질</p>
            <p className="mt-2 text-xl font-semibold">{state.signalStatus}</p>
          </div>
        </div>
      </section>

      <section className="fx2-card lg:col-span-4">
        <h3 className="fx2-title mb-4">상태 요약</h3>
        <ul className="space-y-3 text-sm text-fx2-muted">
          <li>• EEG 좌/우 채널 모두 기준 범위 내 진폭 유지</li>
          <li>• 연결 상태 끊김 없이 연속 수집</li>
          <li>• 노이즈 지표 평균 5% 이하</li>
          <li>• 다음 측정 권장: 20분 후</li>
        </ul>
      </section>
    </div>
  );
}
