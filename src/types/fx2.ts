export type DeviceMode = "demo" | "bluetooth" | "uart";
export type WearStatus = "worn" | "unstable" | "not_worn";
export type SignalStatus = "good" | "normal" | "poor";
export type SessionSource = "demo" | "remote";

export interface Fx2IncomingMessage {
  mode: DeviceMode;
  ch1: number;
  ch2: number;
  bpm: number;
  wearing: boolean;
  signalQuality: number;
  connection: "connected" | "disconnected";
  noise: boolean;
  timestamp: number;
}

export interface Fx2SessionStats {
  sampleCount: number;
  averageHeartRate: number;
  minHeartRate: number;
  maxHeartRate: number;
  averageSignalQuality: number;
  connectionDrops: number;
  unstableMoments: number;
  notWornMoments: number;
}

export interface Fx2State {
  mode: DeviceMode;
  connected: boolean;
  wearStatus: WearStatus;
  signalStatus: SignalStatus;
  heartRate: number;
  signalQuality: number;
  noise: boolean;
  ch1: number[];
  ch2: number[];
  ppg: number[];
  heartRateHistory: number[];
  signalQualityHistory: number[];
  sessionSeconds: number;
  sessionStartedAt: string | null;
  lastUpdated: string;
  logs: string[];
  stats: Fx2SessionStats;
}
