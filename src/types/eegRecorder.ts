import type { DeviceMode, WearStatus, SignalStatus } from "./fx2";

export interface EegSample {
  timestamp: string;   // ISO 8601
  elapsedMs: number;
  ch1: number;
  ch2: number;
  bpm: number;
  wear: WearStatus;
  signal: SignalStatus;
  mode: DeviceMode;
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
  startedAt: string;
  endedAt: string;
  durationMs: number;
  channels: string[];
  sampleCount: number;
  samples: EegSample[];
}

export type ExtWindowSeconds = 5 | 10 | 30 | 60 | 120 | 300;
