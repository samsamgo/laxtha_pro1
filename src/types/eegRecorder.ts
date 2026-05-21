import type { DeviceMode, WearStatus, SignalStatus } from "./fx2";
import type { FftEpoch } from "../lib/fftAccumulator";

export interface EegSample {
  timestamp: string;   // ISO 8601
  elapsedMs: number;
  pc: number;
  ch1: number;
  ch2: number;
  bpm: number;
  ppg: number;
  sdppg: number;
  rrInterval: number;  // ms, 0 if unavailable
  powerSpectrum: number;
  wear: WearStatus;
  signal: SignalStatus;
  mode: DeviceMode;
  heartbeatEvent: boolean;
  ch1Saturation: number | null;
  ch2Saturation: number | null;
  batteryPercent: number | null;
  eegValid: boolean;
  ppgValid: boolean;
}

export interface EegSessionSummary {
  isRecording: boolean;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number;
  sampleCount: number;
  hasRecording: boolean;
}

export interface EegSessionExport {
  device: string;
  app: string;
  mode: string;
  samplingRateHz: number;
  eegConversionUvPerDigit: number;
  eegCenter: number;
  ppgUnit: string;
  ppgRawRange: [number, number];
  ppgRawCenter: number;
  bandwidthHz: [number, number];
  fftFrequencyResolutionHz: number;
  fftBins: number;
  bandIndices: Record<string, [number, number]>;
  startedAt: string;
  endedAt: string;
  timezone: string;
  timezoneOffset: string;
  durationMs: number;
  nanPolicy: string;
  channels: string[];
  sampleCount: number;
  samples: EegSample[];
  fftEpochCount: number;
  fftEpochs: FftEpoch[];
}

export type ExtWindowSeconds = 5 | 10 | 30 | 60 | 120 | 300;
