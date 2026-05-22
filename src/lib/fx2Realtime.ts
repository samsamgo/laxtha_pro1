import type {
  DeviceMode,
  Fx2BinaryFrame,
  Fx2IncomingMessage,
  Fx2SessionStats,
  Fx2State,
  SignalStatus,
  WearStatus,
} from "../types/fx2";
import { toKstIso } from "./timeFormat";

export const MAX_CHART_POINTS = 300000; // 20 min at 250 Hz hardware (memory ~= 24MB across all arrays)

const METRIC_HISTORY_LIMIT = 180;
const LOG_HISTORY_LIMIT = 40;
const HARDWARE_TIMESTAMP_STEP_MS = 1000 / 250;
const PCD_BUFFER_LENGTH = 32;
// Single-copy append: avoids the double-allocation of [...arr, v].slice()
const appendValue = <T,>(history: T[], value: T, max: number): T[] => {
  const next = history.length < max ? history.slice() : history.slice(1);
  next.push(value);
  return next;
};

const roundToSingleDecimal = (value: number) => Math.round(value * 10) / 10;

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const createEmptyPcdBuffer = () => Array<number | null>(PCD_BUFFER_LENGTH).fill(null);

const updatePcdBuffer = (
  buffer: (number | null)[],
  pc: number,
  pcd: number
): (number | null)[] => {
  const next = buffer.length === PCD_BUFFER_LENGTH ? buffer.slice() : createEmptyPcdBuffer();
  next[pc & 0x1f] = pcd;
  return next;
};

const isSaturated = (value: number | null) =>
  value !== null && (value <= 16 || value >= 239);

const normalizeTimestamp = (previousTimestamp: number | undefined, nextTimestamp: number) => {
  if (previousTimestamp === undefined) {
    return nextTimestamp;
  }

  return Math.max(nextTimestamp, previousTimestamp + HARDWARE_TIMESTAMP_STEP_MS);
};


const createEmptyStats = (): Fx2SessionStats => ({
  sampleCount: 0,
  bpmSampleCount: 0,
  bpmSum: 0,
  eegSampleCount: 0,
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
  const startedAt = toKstIso(Date.now());

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
    pcStep: [],
    ppg: [],
    sdppg: [],
    rrInterval: [],
    powerSpectrum: [],
    heartbeatEvents: [],
    eegValidSamples: [],
    ppgValidSamples: [],
    batteryPercentSamples: [],
    ch1SaturationSamples: [],
    ch2SaturationSamples: [],
    bpmSamples: [],
    wearSamples: [],
    signalSamples: [],
    heartRateHistory: [],
    signalQualityHistory: [],
    heartbeatTimestamps: [],
    batteryPercent: null,
    ch1Saturation: null,
    ch2Saturation: null,
    pcdBuffer: createEmptyPcdBuffer(),
    fftEpochs: [],
    fftBandHistory: [],
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
  pcd: patch.pcd,
  batteryPercent: patch.batteryPercent ?? state.batteryPercent,
  ch1Saturation: patch.ch1Saturation ?? state.ch1Saturation,
  ch2Saturation: patch.ch2Saturation ?? state.ch2Saturation,
  heartbeatEvent: patch.heartbeatEvent ?? false,
  eegValid: patch.eegValid ?? state.eegValidSamples[state.eegValidSamples.length - 1] ?? true,
  ppgValid: patch.ppgValid ?? state.ppgValidSamples[state.ppgValidSamples.length - 1] ?? true,
  timestamp: patch.timestamp ?? Date.now(),
});


const EEG_CENTER = 16384;
const EEG_SCALE = 0.03606;
const EEG_ELECTRODE_MASK = 0x38;
const REF_ELECTRODE_MASK = 0x08;

export const parseUartBinaryFrame = (
  frame: Fx2BinaryFrame,
  fallbackState: Fx2State,
  timestamp = Date.now()
): Fx2IncomingMessage | null => {
  const wearing = Boolean(frame.pud0 & 0x40); // bit6 = sensor wearing
  // PPD=false means standby/charging; skip the frame so invalid raw values do not reach chart/CSV.
  if (!frame.ppd) return null;

  const ch1 = (frame.ch1Raw - EEG_CENTER) * EEG_SCALE;
  const ch2 = (frame.ch2Raw - EEG_CENTER) * EEG_SCALE;
  const ppg = frame.ch4Raw - EEG_CENTER;    // centered au (-16384 ~ +16383), 0=baseline
  const sdppg = frame.ch5Raw - EEG_CENTER;  // centered au, 0=baseline
  const ppgOk = Boolean(frame.pud0 & 0x04);   // bit2 = PPG signal ok
  const eegValid = (frame.electrodeStatus & EEG_ELECTRODE_MASK) === EEG_ELECTRODE_MASK;
  const ppgValid = Boolean(frame.electrodeStatus & REF_ELECTRODE_MASK) && ppgOk;
  const currentPcdBuffer = updatePcdBuffer(fallbackState.pcdBuffer, frame.pc, frame.pcd);
  const batteryPercent = currentPcdBuffer[1];
  const ch1Saturation = currentPcdBuffer[20];
  const ch2Saturation = currentPcdBuffer[21];
  const saturationNoise = isSaturated(ch1Saturation) || isSaturated(ch2Saturation);
  const rrRaw = frame.ch6Raw;
  const rrInterval = ppgValid && rrRaw >= 250 && rrRaw <= 2000 ? rrRaw : Number.NaN;
  const powerSpectrum = frame.ch3Raw / 10;

  const noise = !frame.ppd || !wearing || !eegValid || !ppgValid || saturationNoise;
  const bpm = frame.bpm > 0 && ppgValid
    ? clampNumber(frame.bpm, 30, 240)
    : fallbackState.heartRate;
  const signalQuality = frame.ppd && wearing && eegValid && ppgValid ? 88 : 42;

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
    pcd: frame.pcd,
    batteryPercent,
    ch1Saturation,
    ch2Saturation,
    heartbeatEvent: Boolean(frame.pud0 & 0x80),
    eegValid,
    ppgValid,
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
  // sessionStartedAt is set by startSession() to the wall-clock moment recording begins.
  // We intentionally do NOT derive it from nextTimestamp because hardware burst frames
  // can carry timestamps slightly ahead of wall clock — that would inflate sessionSeconds.
  const sessionStartedAt = prev.sessionStartedAt ?? toKstIso(Date.now());
  const sessionStartedAtMs = Date.parse(sessionStartedAt);
  // Session timer is wall-clock based — independent of frame timestamps, so it stays
  // accurate regardless of how fast the device pushes samples.
  const wallClockNowMs = Date.now();
  const nextSampleCount = prev.stats.sampleCount + 1;
  const averageSignalQuality =
    (prev.stats.averageSignalQuality * prev.stats.sampleCount +
      message.signalQuality) /
    nextSampleCount;
  const ppgValue = message.ppg ?? 0;
  const sdppgValue = message.sdppg ?? 0;
  const rrIntervalValue = message.rrInterval ?? 0;
  const powerSpectrumValue = message.powerSpectrum ?? 0;
  const ch1Value = message.eegValid ? message.ch1 : Number.NaN;
  const ch2Value = message.eegValid ? message.ch2 : Number.NaN;
  const pcValue = message.pc ?? prev.pc[prev.pc.length - 1] ?? 0;
  const previousPc = prev.pc[prev.pc.length - 1];
  const pcStep = previousPc === undefined ? 1 : (pcValue - previousPc + 32) % 32;
  const pcdBuffer = message.pcd === undefined
    ? prev.pcdBuffer
    : updatePcdBuffer(prev.pcdBuffer, pcValue, message.pcd);
  const batteryPercent = message.batteryPercent ?? pcdBuffer[1] ?? prev.batteryPercent;
  const ch1Saturation = message.ch1Saturation ?? pcdBuffer[20] ?? prev.ch1Saturation;
  const ch2Saturation = message.ch2Saturation ?? pcdBuffer[21] ?? prev.ch2Saturation;
  const bpmCounted = message.ppgValid && message.bpm > 0;
  const nextBpmSampleCount = prev.stats.bpmSampleCount + (bpmCounted ? 1 : 0);
  const nextBpmSum = prev.stats.bpmSum + (bpmCounted ? message.bpm : 0);
  const averageHeartRate = nextBpmSampleCount > 0 ? nextBpmSum / nextBpmSampleCount : 0;
  const eegCounted =
    message.eegValid && Number.isFinite(message.ch1) && Number.isFinite(message.ch2);
  const nextEegSampleCount = prev.stats.eegSampleCount + (eegCounted ? 1 : 0);

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
    batteryPercent,
    ch1Saturation,
    ch2Saturation,
    pcdBuffer,
    ch1: appendValue(prev.ch1, ch1Value, MAX_CHART_POINTS),
    ch2: appendValue(prev.ch2, ch2Value, MAX_CHART_POINTS),
    timestamps: appendValue(prev.timestamps, nextTimestamp, MAX_CHART_POINTS),
    pc: appendValue(prev.pc, pcValue, MAX_CHART_POINTS),
    pcStep: appendValue(prev.pcStep, pcStep, MAX_CHART_POINTS),
    ppg: appendValue(prev.ppg, ppgValue, MAX_CHART_POINTS),
    sdppg: appendValue(prev.sdppg, sdppgValue, MAX_CHART_POINTS),
    rrInterval: appendValue(prev.rrInterval, rrIntervalValue, MAX_CHART_POINTS),
    powerSpectrum: appendValue(prev.powerSpectrum, powerSpectrumValue, MAX_CHART_POINTS),
    heartbeatEvents: appendValue(prev.heartbeatEvents, message.heartbeatEvent, MAX_CHART_POINTS),
    eegValidSamples: appendValue(prev.eegValidSamples, message.eegValid, MAX_CHART_POINTS),
    ppgValidSamples: appendValue(prev.ppgValidSamples, message.ppgValid, MAX_CHART_POINTS),
    batteryPercentSamples: appendValue(prev.batteryPercentSamples, batteryPercent, MAX_CHART_POINTS),
    ch1SaturationSamples: appendValue(prev.ch1SaturationSamples, ch1Saturation, MAX_CHART_POINTS),
    ch2SaturationSamples: appendValue(prev.ch2SaturationSamples, ch2Saturation, MAX_CHART_POINTS),
    bpmSamples: appendValue(prev.bpmSamples, message.bpm, MAX_CHART_POINTS),
    wearSamples: appendValue(prev.wearSamples, wearStatus, MAX_CHART_POINTS),
    signalSamples: appendValue(prev.signalSamples, signalStatus, MAX_CHART_POINTS),
    heartRateHistory: appendValue(prev.heartRateHistory, message.bpm, METRIC_HISTORY_LIMIT),
    signalQualityHistory: appendValue(
      prev.signalQualityHistory,
      message.signalQuality,
      METRIC_HISTORY_LIMIT
    ),
    heartbeatTimestamps: message.heartbeatEvent
      ? appendValue(prev.heartbeatTimestamps, nextTimestamp, MAX_CHART_POINTS)
      : prev.heartbeatTimestamps,
    sessionSeconds: Math.max(
      0,
      Math.floor((wallClockNowMs - sessionStartedAtMs) / 1000)
    ),
    sessionStartedAt,
    lastUpdated: toKstIso(wallClockNowMs),
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
      bpmSampleCount: nextBpmSampleCount,
      bpmSum: nextBpmSum,
      eegSampleCount: nextEegSampleCount,
      averageHeartRate: roundToSingleDecimal(averageHeartRate),
      minHeartRate:
        !bpmCounted
          ? prev.stats.minHeartRate
          : prev.stats.bpmSampleCount === 0
          ? message.bpm
          : Math.min(prev.stats.minHeartRate, message.bpm),
      maxHeartRate:
        !bpmCounted
          ? prev.stats.maxHeartRate
          : prev.stats.bpmSampleCount === 0
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
      ch1Sum: prev.stats.ch1Sum + (eegCounted ? message.ch1 : 0),
      ch2Sum: prev.stats.ch2Sum + (eegCounted ? message.ch2 : 0),
      ch1PeakAbs: eegCounted
        ? Math.max(prev.stats.ch1PeakAbs, Math.abs(message.ch1))
        : prev.stats.ch1PeakAbs,
      ch2PeakAbs: eegCounted
        ? Math.max(prev.stats.ch2PeakAbs, Math.abs(message.ch2))
        : prev.stats.ch2PeakAbs,
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
  const eegN = state.stats.eegSampleCount;
  const leftChannelAverage = roundToSingleDecimal(eegN > 0 ? state.stats.ch1Sum / eegN : 0);
  const rightChannelAverage = roundToSingleDecimal(eegN > 0 ? state.stats.ch2Sum / eegN : 0);
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
