import type {
  DeviceMode,
  Fx2IncomingMessage,
  Fx2SessionStats,
  Fx2State,
  SignalStatus,
  WearStatus,
} from "../types/fx2";

export const MAX_CHART_POINTS = 3000;

const METRIC_HISTORY_LIMIT = 180;
const LOG_HISTORY_LIMIT = 40;
const clampArray = <T,>(values: T[], max: number) =>
  values.slice(Math.max(values.length - max, 0));

const appendValue = <T,>(history: T[], value: T, max: number) =>
  clampArray([...history, value], max);

const roundToSingleDecimal = (value: number) => Math.round(value * 10) / 10;

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeTimestamp = (previousTimestamp: number | undefined, nextTimestamp: number) => {
  if (previousTimestamp === undefined) {
    return nextTimestamp;
  }

  return Math.max(nextTimestamp, previousTimestamp + 1);
};

const toBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["1", "true", "yes", "y", "on", "connected"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "n", "off", "disconnected"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

const toNumber = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const toConnection = (
  value: unknown,
  fallback: Fx2IncomingMessage["connection"]
): Fx2IncomingMessage["connection"] => {
  if (value === "connected" || value === "disconnected") {
    return value;
  }

  if (typeof value === "string") {
    return value.trim().toLowerCase() === "connected" ? "connected" : fallback;
  }

  return fallback;
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

export const createInitialFx2State = (mode: DeviceMode = "demo"): Fx2State => {
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
    ppg: [],
    heartRateHistory: [],
    signalQualityHistory: [],
    sessionSeconds: 0,
    sessionStartedAt: startedAt,
    lastUpdated: startedAt,
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
  timestamp: patch.timestamp ?? Date.now(),
});

export const parseHardwarePayload = (
  rawPayload: string,
  mode: Extract<DeviceMode, "bluetooth" | "uart">,
  fallbackState: Fx2State
): Fx2IncomingMessage | null => {
  const trimmed = rawPayload.trim();

  if (!trimmed) {
    return null;
  }

  if (mode === "uart") {
    const byteValue = parseInt(trimmed, 10);

    if (Number.isInteger(byteValue) && byteValue >= 0 && byteValue <= 255) {
      return {
        mode: "uart",
        ch1: byteValue,
        ch2: byteValue,
        bpm: fallbackState.heartRate ?? 72,
        wearing: true,
        signalQuality: 88,
        connection: "connected",
        noise: false,
        timestamp: Date.now(),
      };
    }
  }

  const fallbackMessage = buildMessageFromState(fallbackState, { mode });

  let candidate: Record<string, unknown> | null = null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      candidate = parsed as Record<string, unknown>;
    }
  } catch {
    const tokens = trimmed
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);

    if (tokens.length >= 7) {
      candidate = {
        ch1: tokens[0],
        ch2: tokens[1],
        bpm: tokens[2],
        wearing: tokens[3],
        signalQuality: tokens[4],
        connection: tokens[5],
        noise: tokens[6],
        timestamp: tokens[7],
      };
    }
  }

  if (!candidate) {
    return null;
  }

  let wearing: boolean;
  let noise: boolean;

  if (typeof candidate.wear === "string") {
    wearing = candidate.wear !== "not_worn";
    noise = candidate.wear === "unstable";
  } else {
    wearing = toBoolean(candidate.wearing, fallbackMessage.wearing);
    noise = toBoolean(candidate.noise, fallbackMessage.noise);
  }

  let signalQuality: number;

  if (typeof candidate.signal === "string") {
    const signalMap: Record<string, number> = {
      good: 88,
      normal: 62,
      poor: 28,
    };

    signalQuality = signalMap[candidate.signal] ?? fallbackMessage.signalQuality;
  } else {
    signalQuality = clampNumber(
      Math.round(toNumber(candidate.signalQuality, fallbackMessage.signalQuality)),
      0,
      100
    );
  }

  let timestamp: number;

  if (typeof candidate.ts === "number" && candidate.ts > 0) {
    timestamp = candidate.ts * 1000;
  } else {
    timestamp = Math.round(toNumber(candidate.timestamp, Date.now()));
  }

  return {
    mode:
      candidate.mode === "demo" ||
      candidate.mode === "bluetooth" ||
      candidate.mode === "uart"
        ? candidate.mode
        : mode,
    ch1: mode === "uart"
      ? clampNumber(toNumber(candidate.ch1, fallbackMessage.ch1), 0, 255)
      : clampNumber(toNumber(candidate.ch1, fallbackMessage.ch1), -120, 120),
    ch2: mode === "uart"
      ? clampNumber(toNumber(candidate.ch2, fallbackMessage.ch2), 0, 255)
      : clampNumber(toNumber(candidate.ch2, fallbackMessage.ch2), -120, 120),
    bpm: clampNumber(Math.round(toNumber(candidate.bpm, fallbackMessage.bpm)), 30, 220),
    wearing,
    signalQuality,
    connection: toConnection(candidate.connection, "connected"),
    noise,
    timestamp,
  };
};

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
  };
};

export const appendLog = (logs: string[], message: string) =>
  clampArray([...logs, message], LOG_HISTORY_LIMIT);

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
  const ppgValue = message.bpm / 100 + (message.signalQuality - 60) / 500;

  return {
    ...prev,
    mode: message.mode,
    connected: message.connection === "connected",
    wearStatus,
    signalStatus,
    heartRate: message.bpm,
    signalQuality: message.signalQuality,
    noise: message.noise,
    ch1: appendValue(prev.ch1, message.ch1, MAX_CHART_POINTS),
    ch2: appendValue(prev.ch2, message.ch2, MAX_CHART_POINTS),
    timestamps: appendValue(prev.timestamps, nextTimestamp, MAX_CHART_POINTS),
    ppg: appendValue(prev.ppg, ppgValue, MAX_CHART_POINTS),
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
    logs: appendLog(
      prev.logs,
      `[${new Date(nextTimestamp).toLocaleTimeString()}] ${message.mode.toUpperCase()} bpm=${message.bpm} / signal=${message.signalQuality}`
    ),
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
