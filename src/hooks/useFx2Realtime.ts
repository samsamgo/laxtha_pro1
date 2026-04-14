import { useEffect, useMemo, useRef, useState } from "react";
import { fx2State as baseMockState } from "../mock";
import { Fx2WebSocketService } from "../services/fx2WebSocket";
import type { Fx2ConnectionStatus } from "../services/fx2WebSocket";
import type { Fx2State } from "../types/fx2";

export type Fx2RealtimeMode = "mock" | "websocket";

interface UseFx2RealtimeOptions {
  mode: Fx2RealtimeMode;
  websocketUrl?: string;
  fallbackToMockOnDisconnect?: boolean;
}

const clampArray = <T,>(values: T[], max = 64) => values.slice(Math.max(values.length - max, 0));

const createNextMockState = (prev: Fx2State): Fx2State => {
  const t = Date.now();
  const jitter = () => (Math.random() - 0.5) * 8;
  const nextHeartRate = Math.max(56, Math.min(110, Math.round(prev.heartRate + jitter() / 3)));

  return {
    ...prev,
    connected: true,
    mode: "demo",
    heartRate: nextHeartRate,
    ch1: clampArray([...prev.ch1, Math.sin(t / 340) * 1.7 + Math.random() * 0.5]),
    ch2: clampArray([...prev.ch2, Math.cos(t / 410) * 1.5 + Math.random() * 0.5]),
    ppg: clampArray([...prev.ppg, nextHeartRate / 100 + Math.random() * 0.05]),
    sessionSeconds: prev.sessionSeconds + 1,
    lastUpdated: new Date(t).toISOString(),
    logs: clampArray([...prev.logs, `[${new Date(t).toLocaleTimeString()}] Mock frame 업데이트`], 40)
  };
};

/**
 * FX2 실시간 데이터 훅.
 * - mode="websocket": WebSocket 서비스 구독
 * - mode="mock": 로컬 모의 데이터 스트림 사용
 * - 연결 끊김 시 mock fallback 가능
 */
export const useFx2Realtime = ({ mode, websocketUrl, fallbackToMockOnDisconnect = true }: UseFx2RealtimeOptions) => {
  const [state, setState] = useState<Fx2State>(baseMockState);
  const [connectionStatus, setConnectionStatus] = useState<Fx2ConnectionStatus>(
    mode === "websocket" ? "waiting" : "connected"
  );
  const [activeMode, setActiveMode] = useState<Fx2RealtimeMode>(mode);

  const service = useMemo(() => new Fx2WebSocketService(baseMockState), []);
  const mockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setActiveMode(mode);
  }, [mode]);

  useEffect(() => {
    if (activeMode === "mock") {
      setConnectionStatus("connected");
      mockTimerRef.current = window.setInterval(() => {
        setState((prev) => createNextMockState(prev));
      }, 1000);

      return () => {
        if (mockTimerRef.current !== null) {
          window.clearInterval(mockTimerRef.current);
        }
      };
    }

    if (!websocketUrl) {
      setConnectionStatus("disconnected");
      if (fallbackToMockOnDisconnect) {
        setActiveMode("mock");
      }
      return;
    }

    const unsubscribe = service.subscribe((event) => {
      if (event.type === "status") {
        setConnectionStatus(event.status);

        if (event.status === "disconnected" && fallbackToMockOnDisconnect) {
          setActiveMode("mock");
          setState((prev) => ({
            ...prev,
            logs: clampArray([...prev.logs, `[${new Date().toLocaleTimeString()}] WS 연결 해제 → Mock 모드 전환`], 40)
          }));
        }
      }

      if (event.type === "data") {
        setState(event.payload);
      }
    });

    service.connect(websocketUrl);

    return () => {
      unsubscribe();
      service.disconnect();
    };
  }, [activeMode, fallbackToMockOnDisconnect, service, websocketUrl]);

  /**
   * 외부에서 수동으로 mock 모드로 스위칭할 때 사용하는 함수입니다.
   */
  const switchToMock = () => {
    service.disconnect();
    setActiveMode("mock");
  };

  /**
   * 외부에서 WebSocket 모드로 재시도할 때 사용하는 함수입니다.
   */
  const switchToWebSocket = () => {
    if (!websocketUrl) return;
    service.setBaseState(state);
    setActiveMode("websocket");
  };

  return {
    state,
    connectionStatus,
    activeMode,
    switchToMock,
    switchToWebSocket
  };
};
