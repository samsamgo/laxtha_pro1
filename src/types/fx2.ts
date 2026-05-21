export type DeviceMode = "serial";
export type WearStatus = "worn" | "unstable" | "not_worn";
export type SignalStatus = "good" | "normal" | "poor";

export interface Fx2BinaryFrame {
  ppd: boolean;
  pud0: number;
  pc: number;
  bpm: number;
  pcd: number;
  electrodeStatus: number;
  ch1Raw: number;
  ch2Raw: number;
  ch3Raw: number;
  ch4Raw: number;
  ch5Raw: number;
  ch6Raw: number;
}

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
  pc?: number;
  ppg?: number;
  sdppg?: number;
  rrInterval?: number;
  powerSpectrum?: number;
  electrodeStatus?: number;
  ppd?: boolean;
  heartbeatEvent: boolean;
  eegValid: boolean;
  ppgValid: boolean;
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
  ch1Sum: number;
  ch2Sum: number;
  ch1PeakAbs: number;
  ch2PeakAbs: number;
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
  timestamps: number[];
  pc: number[];
  pcStep: number[];
  ppg: number[];
  sdppg: number[];
  rrInterval: number[];
  powerSpectrum: number[];
  heartbeatEvents: boolean[];
  eegValidSamples: boolean[];
  ppgValidSamples: boolean[];
  bpmSamples: number[];
  wearSamples: WearStatus[];
  signalSamples: SignalStatus[];
  heartRateHistory: number[];
  signalQualityHistory: number[];
  heartbeatTimestamps: number[];
  sessionSeconds: number;
  sessionStartedAt: string | null;
  lastUpdated: string;
  electrodeStatus: number | null;
  logs: string[];
  stats: Fx2SessionStats;
}
