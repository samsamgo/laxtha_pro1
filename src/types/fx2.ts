export type DeviceMode = "demo" | "bluetooth" | "uart";
export type WearStatus = "worn" | "unstable" | "not_worn";
export type SignalStatus = "good" | "normal" | "poor";

export interface Fx2State {
  mode: DeviceMode;
  connected: boolean;
  wearStatus: WearStatus;
  signalStatus: SignalStatus;
  heartRate: number;
  ch1: number[];
  ch2: number[];
  ppg: number[];
  sessionSeconds: number;
  lastUpdated: string;
  logs: string[];
}
