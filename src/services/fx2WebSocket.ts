import type { DeviceMode, Fx2State, SignalStatus, WearStatus } from "../types/fx2";

export type Fx2ConnectionStatus = "waiting" | "connected" | "disconnected";

/**
 * 실제 WebSocket에서 수신하는 원본 메시지 형식입니다.
 * 향후 Bluetooth/UART 데이터를 같은 구조로 정규화해서 재사용할 수 있습니다.
 */
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

/**
 * 구독 콜백에서 사용할 이벤트 형태입니다.
 * data 이벤트로 정규화된 상태 업데이트를 전달하고,
 * status 이벤트로 연결 상태를 전달합니다.
 */
export type Fx2WebSocketEvent =
  | { type: "status"; status: Fx2ConnectionStatus }
  | { type: "data"; payload: Fx2State };

const clampArray = <T,>(values: T[], max = 64) => values.slice(Math.max(0, values.length - max));

const toWearStatus = (wearing: boolean, noise: boolean): WearStatus => {
  if (!wearing) return "not_worn";
  return noise ? "unstable" : "worn";
};

const toSignalStatus = (quality: number): SignalStatus => {
  if (quality >= 80) return "good";
  if (quality >= 50) return "normal";
  return "poor";
};

/**
 * 수신 메시지를 앱 공통 상태(Fx2State)로 변환합니다.
 * 이 함수는 다른 전송 계층(Bluetooth/UART)에서도 그대로 재사용할 수 있습니다.
 */
export const mapWebSocketMessageToFx2State = (message: Fx2IncomingMessage, prev: Fx2State): Fx2State => ({
  ...prev,
  mode: message.mode,
  connected: message.connection === "connected",
  wearStatus: toWearStatus(message.wearing, message.noise),
  signalStatus: toSignalStatus(message.signalQuality),
  heartRate: message.bpm,
  ch1: clampArray([...prev.ch1, message.ch1]),
  ch2: clampArray([...prev.ch2, message.ch2]),
  ppg: clampArray([...prev.ppg, message.bpm / 100]),
  lastUpdated: new Date(message.timestamp).toISOString(),
  logs: clampArray(
    [
      ...prev.logs,
      `[${new Date(message.timestamp).toLocaleTimeString()}] WS bpm=${message.bpm}, signal=${message.signalQuality}`
    ],
    40
  )
});

/**
 * FX2 WebSocket 서비스 클래스.
 * UI 컴포넌트와 분리된 연결/구독 책임을 담당합니다.
 */
export class Fx2WebSocketService {
  private socket: WebSocket | null = null;

  private status: Fx2ConnectionStatus = "disconnected";

  private listeners = new Set<(event: Fx2WebSocketEvent) => void>();

  private currentState: Fx2State;

  constructor(initialState: Fx2State) {
    this.currentState = initialState;
  }

  /**
   * 현재 연결 상태를 조회합니다.
   */
  getStatus() {
    return this.status;
  }

  /**
   * WebSocket 연결을 시작합니다.
   * 이미 연결 중/연결됨이라면 중복 연결을 방지합니다.
   */
  connect(url: string) {
    if (this.socket && (this.status === "waiting" || this.status === "connected")) {
      return;
    }

    this.setStatus("waiting");
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.setStatus("connected");
    };

    this.socket.onclose = () => {
      this.setStatus("disconnected");
      this.socket = null;
    };

    this.socket.onerror = () => {
      this.setStatus("disconnected");
    };

    this.socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as Fx2IncomingMessage;
        this.currentState = mapWebSocketMessageToFx2State(parsed, this.currentState);
        this.emit({ type: "data", payload: this.currentState });
      } catch {
        this.currentState = {
          ...this.currentState,
          logs: clampArray([...this.currentState.logs, `[${new Date().toLocaleTimeString()}] Invalid WS payload`], 40)
        };
        this.emit({ type: "data", payload: this.currentState });
      }
    };
  }

  /**
   * WebSocket 연결을 종료하고 상태를 disconnected로 변경합니다.
   */
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus("disconnected");
  }

  /**
   * 상태/데이터 이벤트를 구독합니다.
   * 반환되는 함수는 구독 해제(cleanup)에 사용합니다.
   */
  subscribe(callback: (event: Fx2WebSocketEvent) => void) {
    this.listeners.add(callback);
    callback({ type: "status", status: this.status });
    callback({ type: "data", payload: this.currentState });

    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * 외부(mock 등)에서 기준 상태를 주입하고 싶을 때 사용합니다.
   */
  setBaseState(state: Fx2State) {
    this.currentState = state;
    this.emit({ type: "data", payload: state });
  }

  private setStatus(next: Fx2ConnectionStatus) {
    this.status = next;
    this.emit({ type: "status", status: next });
  }

  private emit(event: Fx2WebSocketEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
}

/**
 * 메시지 처리 예시:
 * const next = mapWebSocketMessageToFx2State(message, prevState);
 */
export const fx2WebSocketExampleMessage: Fx2IncomingMessage = {
  mode: "demo",
  ch1: 42,
  ch2: 37,
  bpm: 78,
  wearing: true,
  signalQuality: 85,
  connection: "connected",
  noise: false,
  timestamp: 1710000000000
};
