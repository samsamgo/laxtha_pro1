import type {
  DeviceMode,
  Fx2BinaryFrame,
  Fx2IncomingMessage,
  Fx2SessionStats,
  Fx2State,
  SignalStatus,
  WearStatus,
} from "../types/fx2";

export const MAX_CHART_POINTS = 72000; // 20 min at 60 Hz hardware; months at 1 Hz demo

const METRIC_HISTORY_LIMIT = 180;
const LOG_HISTORY_LIMIT = 40;
// Single-copy append: avoids the double-allocation of [...arr, v].slice()
const appendValue = <T,>(history: T[], value: T, max: number): T[] => {
  const next = history.length < max ? history.slice() : history.slice(1);
  next.push(value);
  return next;
};

const roundToSingleDecimal = (value: number) => Math.round(value * 10) / 10;

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeTimestamp = (previousTimestamp: number | undefined, nextTimestamp: number) => {
  if (previousTimestamp === undefined) {
    return nextTimestamp;
  }

  return Math.max(nextTimestamp, previousTimestamp + 1);
};


const createEmptyStats = (): Fx2SessionStats => ({
  sampleCount: 0,
  averageHeartRate: 0,
  minHeartRate: 0,
  maxHeartRate: 0,
  averageSignalQuality: 0,
  connectionDrops: 0,
  unstableMoments: 0,
  notWornMoments: 0,
  ch1Sum: 0,
  ch2Sum: 0,
  ch1PeakAbs: 0,
  ch2PeakAbs: 0,
});

export const toWearStatus = (wearing: boolean, noise: boolean): WearStatus => {
  if (!wearing) {
    return "not_worn";
  }

  return noise ? "unstable" : "worn";
};

export const toSignalStatus = (quality: number): SignalStatus => {
  if (quality >= 80) {
    return "good";
  }

  if (quality >= 50) {
    return "normal";
  }

  return "poor";
};

export const createInitialFx2State = (mode: DeviceMode = "serial"): Fx2State => {
  const startedAt = new Date().toISOString();

  return {
    mode,
    connected: false,
    wearStatus: "worn",
    signalStatus: "good",
    heartRate: 72,
    signalQuality: 88,
    noise: false,
    ch1: [],
    ch2: [],
    timestamps: [],
    pc: [],
    ppg: [],
    sdppg: [],
    rrInterval: [],
    powerSpectrum: [],
    heartRateHistory: [],
    signalQualityHistory: [],
    sessionSeconds: 0,
    sessionStartedAt: startedAt,
    lastUpdated: startedAt,
    electrodeStatus: null,
    logs: ["세션이 준비됐습니다. 측정을 시작하면 실시간 데이터가 누적됩니다."],
    stats: createEmptyStats(),
  };
};

export const buildMessageFromState = (
  state: Fx2State,
  patch: Partial<Fx2IncomingMessage> = {}
): Fx2IncomingMessage => ({
  mode: patch.mode ?? state.mode,
  ch1: patch.ch1 ?? state.ch1[state.ch1.length - 1] ?? 0,
  ch2: patch.ch2 ?? state.ch2[state.ch2.length - 1] ?? 0,
  bpm: patch.bpm ?? state.heartRate,
  wearing: patch.wearing ?? state.wearStatus !== "not_worn",
  signalQuality: patch.signalQuality ?? state.signalQuality,
  connection: patch.connection ?? (state.connected ? "connected" : "disconnected"),
  noise: patch.noise ?? state.noise,
  pc: patch.pc ?? state.pc[state.pc.length - 1] ?? 0,
  electrodeStatus: patch.electrodeStatus ?? state.electrodeStatus ?? undefined,
  timestamp: patch.timestamp ?? Date.now(),
});


export const createMockMessage = (prev: Fx2State): Fx2IncomingMessage => {
  const timestamp = Date.now();
  const sampleIndex = prev.stats.sampleCount + 1;
  const baseline = prev.heartRate + (Math.random() - 0.5) * 3;
  const bpm = Math.max(58, Math.min(108, Math.round(baseline)));
  const wearing = sampleIndex % 29 !== 0;
  const noise = sampleIndex % 13 === 0 || !wearing;
  const signalQuality = Math.max(
    18,
    Math.min(99, Math.round((noise ? 42 : 88) + (Math.random() - 0.5) * 10))
  );
  const drift = sampleIndex / 4;

  return {
    mode: prev.mode,
    ch1: Math.sin(drift) * 1.8 + (Math.random() - 0.5) * 0.3,
    ch2: Math.cos(drift * 0.84) * 1.55 + (Math.random() - 0.5) * 0.28,
    bpm,
    wearing,
    signalQuality,
    connection: "connected",
    noise,
    timestamp,
    pc: sampleIndex % 32,
    ppg: Math.sin(drift * 1.1) * 0.5 + (Math.random() - 0.5) * 0.1,
    sdppg: Math.cos(drift * 1.3) * 0.3 + (Math.random() - 0.5) * 0.05,
    rrInterval: bpm > 0 ? Math.round(60000 / bpm) : 833,
    powerSpectrum: Math.abs(Math.sin(drift * 0.05)) * 80 + 100 + Math.random() * 5,
    electrodeStatus: wearing ? 0x38 : 0x00,
  };
};

const EEG_CENTER = 16384;
const EEG_SCALE = 0.03606;

export const parseUartBinaryFrame = (
  frame: Fx2BinaryFrame,
  fallbackState: Fx2State,
  timestamp = Date.now()
): Fx2IncomingMessage | null => {
  const wearing = Boolean(frame.pud0 & 0x40); // bit6 = sensor wearing

  const ch1 = (frame.ch1Raw - EEG_CENTER) * EEG_SCALE;
  const ch2 = (frame.ch2Raw - EEG_CENTER) * EEG_SCALE;
  const ppg = (frame.ch4Raw - EEG_CENTER) * EEG_SCALE;
  const sdppg = (frame.ch5Raw - EEG_CENTER) * EEG_SCALE;
  const rrInterval = frame.ch6Raw;
  const powerSpectrum = frame.ch3Raw / 10;

  const ppgOk = Boolean(frame.pud0 & 0x04);   // bit2 = PPG signal ok
  const noise = !frame.ppd || !wearing || !ppgOk;
  const bpm = frame.bpm > 0
    ? clampNumber(frame.bpm, 30, 220)
    : fallbackState.heartRate;
  const signalQuality = frame.ppd && wearing && ppgOk ? 88 : 42;

  return {
    mode: fallbackState.mode,
    ch1,
    ch2,
    bpm,
    wearing,
    signalQuality,
    connection: "connected",
    noise,
    timestamp,
    pc: frame.pc,
    ppg,
    sdppg,
    rrInterval,
    powerSpectrum,
    electrodeStatus: frame.electrodeStatus,
    ppd: frame.ppd,
  };
};

export const appendLog = (logs: string[], message: string): string[] =>
  appendValue(logs, message, LOG_HISTORY_LIMIT);

export const applyIncomingMessage = (message: Fx2IncomingMessage, prev: Fx2State): Fx2State => {
  const nextTimestamp = normalizeTimestamp(
    prev.timestamps[prev.timestamps.length - 1],
    message.timestamp
  );
  const wearStatus = toWearStatus(message.wearing, message.noise);
  const signalStatus = toSignalStatus(message.signalQuality);
  const sessionStartedAt = prev.sessionStartedAt ?? new Date(nextTimestamp).toISOString();
  const sessionStartedAtMs = Date.parse(sessionStartedAt);
  const nextSampleCount = prev.stats.sampleCount + 1;
  const averageHeartRate =
    (prev.stats.averageHeartRate * prev.stats.sampleCount + message.bpm) /
    nextSampleCount;
  const averageSignalQuality =
    (prev.stats.averageSignalQuality * prev.stats.sampleCount +
      message.signalQuality) /
    nextSampleCount;
  const ppgValue = message.ppg ?? (message.bpm / 100 + (message.signalQuality - 60) / 500);
  const sdppgValue = message.sdppg ?? 0;
  const rrIntervalValue = message.rrInterval ?? 0;
  const powerSpectrumValue = message.powerSpectrum ?? 0;
  const pcValue = message.pc ?? prev.pc[prev.pc.length - 1] ?? 0;

  return {
    ...prev,
    mode: message.mode,
    connected: message.connection === "connected",
    wearStatus,
    signalStatus,
    heartRate: message.bpm,
    signalQuality: message.signalQuality,
    noise: message.noise,
    electrodeStatus: message.electrodeStatus ?? prev.electrodeStatus,
    ch1: appendValue(prev.ch1, message.ch1, MAX_CHART_POINTS),
    ch2: appendValue(prev.ch2, message.ch2, MAX_CHART_POINTS),
    timestamps: appendValue(prev.timestamps, nextTimestamp, MAX_CHART_POINTS),
    pc: appendValue(prev.pc, pcValue, MAX_CHART_POINTS),
    ppg: appendValue(prev.ppg, ppgValue, MAX_CHART_POINTS),
    sdppg: appendValue(prev.sdppg, sdppgValue, MAX_CHART_POINTS),
    rrInterval: appendValue(prev.rrInterval, rrIntervalValue, MAX_CHART_POINTS),
    powerSpectrum: appendValue(prev.powerSpectrum, powerSpectrumValue, MAX_CHART_POINTS),
    heartRateHistory: appendValue(prev.heartRateHistory, message.bpm, METRIC_HISTORY_LIMIT),
    signalQualityHistory: appendValue(
      prev.signalQualityHistory,
      message.signalQuality,
      METRIC_HISTORY_LIMIT
    ),
    sessionSeconds: Math.max(
      0,
      Math.floor((nextTimestamp - sessionStartedAtMs) / 1000)
    ),
    sessionStartedAt,
    lastUpdated: new Date(nextTimestamp).toISOString(),
    logs: (() => {
      const isFirstSample = prev.stats.sampleCount === 0;
      const wearChanged = prev.wearStatus !== wearStatus;
      const signalChanged = prev.signalStatus !== signalStatus;
      if (!isFirstSample && !wearChanged && !signalChanged) return prev.logs;
      const wearLabels: Record<WearStatus, string> = { worn: "착용", unstable: "불안정", not_worn: "미착용" };
      const sigLabels: Record<SignalStatus, string> = { good: "양호", normal: "보통", poor: "불량" };
      const timeStr = new Date(nextTimestamp).toLocaleTimeString("ko-KR");
      if (isFirstSample) {
        return appendLog(prev.logs, `[${timeStr}] 첫 번째 샘플 — bpm=${message.bpm} 착용=${wearLabels[wearStatus]} 신호=${sigLabels[signalStatus]}`);
      }
      const changes: string[] = [];
      if (wearChanged) changes.push(`착용→${wearLabels[wearStatus]}`);
      if (signalChanged) changes.push(`신호→${sigLabels[signalStatus]}`);
      return appendLog(prev.logs, `[${timeStr}] ${changes.join(" ")} bpm=${message.bpm}`);
    })(),
    stats: {
      sampleCount: nextSampleCount,
      averageHeartRate: roundToSingleDecimal(averageHeartRate),
      minHeartRate:
        prev.stats.sampleCount === 0
          ? message.bpm
          : Math.min(prev.stats.minHeartRate, message.bpm),
      maxHeartRate:
        prev.stats.sampleCount === 0
          ? message.bpm
          : Math.max(prev.stats.maxHeartRate, message.bpm),
      averageSignalQuality: roundToSingleDecimal(averageSignalQuality),
      connectionDrops:
        prev.stats.connectionDrops +
        (prev.connected && message.connection !== "connected" ? 1 : 0),
      unstableMoments:
        prev.stats.unstableMoments + (wearStatus === "unstable" ? 1 : 0),
      notWornMoments:
        prev.stats.notWornMoments + (wearStatus === "not_worn" ? 1 : 0),
      ch1Sum: prev.stats.ch1Sum + message.ch1,
      ch2Sum: prev.stats.ch2Sum + message.ch2,
      ch1PeakAbs: Math.max(prev.stats.ch1PeakAbs, Math.abs(message.ch1)),
      ch2PeakAbs: Math.max(prev.stats.ch2PeakAbs, Math.abs(message.ch2)),
    },
  };
};

export interface Fx2SummarySnapshot {
  averageHeartRate: number;
  signalQualityAverage: number;
  leftChannelAverage: number;
  rightChannelAverage: number;
  leftPeak: number;
  rightPeak: number;
  balanceGap: number;
  stabilityScore: number;
  summaryText: string;
}

export const summarizeFx2State = (state: Fx2State): Fx2SummarySnapshot => {
  const n = state.stats.sampleCount;
  const leftChannelAverage = roundToSingleDecimal(n > 0 ? state.stats.ch1Sum / n : 0);
  const rightChannelAverage = roundToSingleDecimal(n > 0 ? state.stats.ch2Sum / n : 0);
  const leftPeak = roundToSingleDecimal(state.stats.ch1PeakAbs);
  const rightPeak = roundToSingleDecimal(state.stats.ch2PeakAbs);
  const balanceGap = roundToSingleDecimal(Math.abs(leftChannelAverage - rightChannelAverage));

  const stabilityPenalty =
    state.stats.connectionDrops * 10 +
    state.stats.unstableMoments * 2 +
    state.stats.notWornMoments * 3;
  const stabilityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        state.stats.averageSignalQuality -
          (stabilityPenalty / Math.max(n, 1)) * 10 +
          10
      )
    )
  );

  let summaryText = "연결 직후라 아직 충분한 데이터가 쌓이지 않았습니다.";

  if (n >= 3) {
    if (stabilityScore >= 85) {
      summaryText = "착용과 연결 상태가 안정적으로 유지되어 시연 흐름이 아주 좋습니다.";
    } else if (stabilityScore >= 65) {
      summaryText = "전반적으로는 안정적이지만 중간중간 신호 품질 저하가 감지됩니다.";
    } else {
      summaryText = "착용 또는 연결 안정성이 낮아 보여서 시연 전 상태 점검이 필요합니다.";
    }
  }

  return {
    averageHeartRate: state.stats.averageHeartRate,
    signalQualityAverage: state.stats.averageSignalQuality,
    leftChannelAverage,
    rightChannelAverage,
    leftPeak,
    rightPeak,
    balanceGap,
    stabilityScore,
    summaryText,
  };
};
