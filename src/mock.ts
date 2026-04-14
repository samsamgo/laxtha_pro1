import type { Fx2State } from "./types/fx2";

const sineWave = (phase: number, amp = 1) =>
  Array.from({ length: 42 }, (_, i) => Math.sin((i + phase) / 3) * amp + (Math.random() - 0.5) * 0.35);

export const fx2State: Fx2State = {
  mode: "demo",
  connected: true,
  wearStatus: "worn",
  signalStatus: "good",
  heartRate: 72,
  ch1: sineWave(2, 1.8),
  ch2: sineWave(8, 1.5),
  ppg: sineWave(12, 1),
  sessionSeconds: 427,
  lastUpdated: new Date().toISOString(),
  logs: [
    "[13:21:08] 장치 연결 완료",
    "[13:21:10] EEG 채널 안정화",
    "[13:21:14] PPG 신호 정상",
    "[13:21:19] 데모 측정 시작"
  ]
};
