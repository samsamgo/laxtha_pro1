import { applyIncomingMessage } from "../lib/fx2Realtime";
import type { Fx2IncomingMessage, Fx2State } from "../types/fx2";

export type Fx2ConnectionStatus = "waiting" | "connected" | "disconnected";

export type Fx2WebSocketEvent =
  | { type: "status"; status: Fx2ConnectionStatus }
  | { type: "data"; payload: Fx2State };

export class Fx2WebSocketService {
  private socket: WebSocket | null = null;

  private status: Fx2ConnectionStatus = "disconnected";

  private listeners = new Set<(event: Fx2WebSocketEvent) => void>();

  private currentState: Fx2State;

  constructor(initialState: Fx2State) {
    this.currentState = initialState;
  }

  getStatus() {
    return this.status;
  }

  connect(url: string) {
    if (this.socket && (this.status === "waiting" || this.status === "connected")) {
      return;
    }

    this.disconnect();
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
        const parsed = JSON.parse(String(event.data)) as Fx2IncomingMessage;
        this.currentState = applyIncomingMessage(parsed, this.currentState);
        this.emit({ type: "data", payload: this.currentState });
      } catch {
        this.currentState = {
          ...this.currentState,
          logs: [...this.currentState.logs, "수신 데이터를 해석하지 못했습니다."].slice(-40)
        };
        this.emit({ type: "data", payload: this.currentState });
      }
    };
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setStatus("disconnected");
  }

  send(message: Fx2IncomingMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.socket.send(JSON.stringify(message));
    return true;
  }

  subscribe(callback: (event: Fx2WebSocketEvent) => void) {
    this.listeners.add(callback);
    callback({ type: "status", status: this.status });
    callback({ type: "data", payload: this.currentState });

    return () => {
      this.listeners.delete(callback);
    };
  }

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
