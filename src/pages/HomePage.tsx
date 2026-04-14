import { Link } from "react-router-dom";
import { useFx2Realtime } from "../hooks/useFx2Realtime";

const wearLabel = {
  worn: "착용 중",
  unstable: "불안정",
  not_worn: "미착용"
};

const signalLabel = {
  good: "좋음",
  normal: "보통",
  poor: "나쁨"
};

const modeLabel = {
  demo: "데모",
  bluetooth: "블루투스",
  uart: "UART"
};

export default function HomePage() {
  const { state, connectionStatus, activeMode } = useFx2Realtime({
    mode: "mock",
    fallbackToMockOnDisconnect: true
  });

  return (
    <div className="grid grid-cols-1 gap-cardGap lg:grid-cols-12">
      <section className="fx2-card lg:col-span-8">
        <p className="text-sm font-semibold text-fx2-primary">FX2 Neuro Feedback</p>
        <h2 className="mt-2 text-3xl font-semibold leading-tight text-fx2-text">정확한 생체 신호를 직관적인 대시보드로 확인하세요.</h2>
        <p className="mt-4 max-w-2xl text-fx2-muted">
          FX2 데모 대시보드는 EEG/PPG 핵심 지표를 한 화면에서 확인하고, 연결 상태부터 착용 품질까지 빠르게 파악할 수 있도록 구성되어 있습니다.
        </p>
        <Link
          to="/live"
          className="mt-8 inline-flex items-center rounded-2xl bg-fx2-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
        >
          실시간 측정 시작
        </Link>
      </section>

      <section className="fx2-card lg:col-span-4">
        <h3 className="fx2-title mb-4">현재 상태</h3>
        <div className="space-y-3 text-sm">
          <p className="flex justify-between"><span className="text-fx2-muted">연결 상태</span><strong>{state.connected ? "연결됨" : "연결 해제"}</strong></p>
          <p className="flex justify-between"><span className="text-fx2-muted">실시간 소스</span><strong>{activeMode}</strong></p>
          <p className="flex justify-between"><span className="text-fx2-muted">소켓 상태</span><strong>{connectionStatus}</strong></p>
          <p className="flex justify-between"><span className="text-fx2-muted">모드</span><strong>{modeLabel[state.mode]}</strong></p>
          <p className="flex justify-between"><span className="text-fx2-muted">착용 상태</span><strong>{wearLabel[state.wearStatus]}</strong></p>
          <p className="flex justify-between"><span className="text-fx2-muted">신호 품질</span><strong>{signalLabel[state.signalStatus]}</strong></p>
          <p className="flex justify-between"><span className="text-fx2-muted">심박수</span><strong>{state.heartRate} bpm</strong></p>
        </div>
      </section>
    </div>
  );
}
