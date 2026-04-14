import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PropsWithChildren
} from "react";
import {
  appendLog,
  applyIncomingMessage,
  buildMessageFromState,
  createInitialFx2State,
  createMockMessage,
  summarizeFx2State
} from "../lib/fx2Realtime";
import { getDefaultWebSocketUrl, normalizeWebSocketUrl } from "../lib/socketUrl";
import { Fx2WebSocketService, type Fx2ConnectionStatus } from "../services/fx2WebSocket";
import type { DeviceMode, Fx2IncomingMessage, Fx2State, SessionSource } from "../types/fx2";

type DemoPreset = "balanced" | "weakSignal" | "notWorn" | "disconnected" | "reset";

type SessionPhase = "idle" | "running" | "stopped";

interface Fx2RealtimeContextValue {
  state: Fx2State;
  summary: ReturnType<typeof summarizeFx2State>;
  selectedMode: DeviceMode;
  sessionSource: SessionSource;
  sessionPhase: SessionPhase;
  websocketUrl: string;
  connectionStatus: Fx2ConnectionStatus;
  hasRemoteData: boolean;
  setSelectedMode: (mode: DeviceMode) => void;
  setSessionSource: (source: SessionSource) => void;
  setWebsocketUrl: (url: string) => void;
  startSession: () => void;
  stopSession: () => void;
  reconnectRemote: () => void;
  pushManualUpdate: (patch: Partial<Fx2IncomingMessage>) => boolean;
  applyPreset: (preset: DemoPreset) => void;
}

const Fx2RealtimeContext = createContext<Fx2RealtimeContextValue | null>(null);

const applyLocalMessage = (
  nextMessage: Fx2IncomingMessage,
  setState: Dispatch<React.SetStateAction<Fx2State>>,
  service: Fx2WebSocketService
) => {
  setState((prev) => {
    const nextState = applyIncomingMessage(nextMessage, prev);
    service.setBaseState(nextState);
    return nextState;
  });
};

export const Fx2RealtimeProvider = ({ children }: PropsWithChildren) => {
  const [selectedMode, setSelectedModeState] = useState<DeviceMode>("demo");
  const [sessionSource, setSessionSource] = useState<SessionSource>("remote");
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("idle");
  const [websocketUrl, setWebsocketUrlState] = useState(() => getDefaultWebSocketUrl());
  const [state, setState] = useState<Fx2State>(() => createInitialFx2State("demo"));
  const [connectionStatus, setConnectionStatus] = useState<Fx2ConnectionStatus>("disconnected");
  const [hasRemoteData, setHasRemoteData] = useState(false);

  const serviceRef = useRef(new Fx2WebSocketService(createInitialFx2State("demo")));
  const mockTimerRef = useRef<number | null>(null);
  const hasSeededStatusRef = useRef(false);
  const hasSeededDataRef = useRef(false);
  const suppressDisconnectNoticeRef = useRef(false);

  useEffect(() => {
    const service = serviceRef.current;

    return service.subscribe((event) => {
      if (event.type === "status") {
        if (!hasSeededStatusRef.current) {
          hasSeededStatusRef.current = true;
          setConnectionStatus(event.status);
          return;
        }

        setConnectionStatus(event.status);

        if (event.status === "disconnected") {
          if (suppressDisconnectNoticeRef.current) {
            suppressDisconnectNoticeRef.current = false;
            setState((prev) => ({ ...prev, connected: false }));
            return;
          }

          setState((prev) => {
            if (!prev.connected) {
              return prev;
            }

            return {
              ...prev,
              connected: false,
              logs: appendLog(prev.logs, "원격 연결이 끊어졌습니다. 다시 연결을 시도할 수 있습니다.")
            };
          });
        }

        return;
      }

      if (!hasSeededDataRef.current) {
        hasSeededDataRef.current = true;
        setState(event.payload);
        return;
      }

      setHasRemoteData(true);
      setSelectedModeState(event.payload.mode);
      setSessionPhase("running");
      setState(event.payload);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (mockTimerRef.current !== null) {
        window.clearInterval(mockTimerRef.current);
      }
      suppressDisconnectNoticeRef.current = true;
      serviceRef.current.disconnect();
    };
  }, []);

  const stopMockFeed = () => {
    if (mockTimerRef.current !== null) {
      window.clearInterval(mockTimerRef.current);
      mockTimerRef.current = null;
    }
  };

  const resetState = (mode: DeviceMode) => {
    const freshState = createInitialFx2State(mode);
    setState(freshState);
    setHasRemoteData(false);
    serviceRef.current.setBaseState(freshState);
  };

  const startSession = () => {
    const normalizedUrl = normalizeWebSocketUrl(websocketUrl);

    stopMockFeed();
    suppressDisconnectNoticeRef.current = true;
    serviceRef.current.disconnect();
    setWebsocketUrlState(normalizedUrl);
    resetState(selectedMode);
    setSessionPhase("running");

    if (sessionSource === "demo") {
      setConnectionStatus("connected");
      mockTimerRef.current = window.setInterval(() => {
        setState((prev) => {
          const nextState = applyIncomingMessage(createMockMessage(prev), prev);
          serviceRef.current.setBaseState(nextState);
          return nextState;
        });
      }, 1000);
      return;
    }

    setConnectionStatus("waiting");
    serviceRef.current.connect(normalizedUrl);
  };

  const stopSession = () => {
    stopMockFeed();
    suppressDisconnectNoticeRef.current = true;
    serviceRef.current.disconnect();
    setSessionPhase("stopped");
    setState((prev) => ({
      ...prev,
      connected: false,
      logs: appendLog(prev.logs, "측정을 종료했습니다.")
    }));
  };

  const pushManualUpdate = (patch: Partial<Fx2IncomingMessage>) => {
    const nextMessage = buildMessageFromState({ ...state, mode: selectedMode }, { ...patch, mode: selectedMode });

    if (sessionSource === "remote" && connectionStatus === "connected") {
      return serviceRef.current.send(nextMessage);
    }

    applyLocalMessage(nextMessage, setState, serviceRef.current);
    setSessionPhase("running");
    return true;
  };

  const applyPreset = (preset: DemoPreset) => {
    switch (preset) {
      case "balanced":
        pushManualUpdate({
          ch1: 1.4,
          ch2: 1.2,
          bpm: 72,
          wearing: true,
          signalQuality: 90,
          connection: "connected",
          noise: false
        });
        break;
      case "weakSignal":
        pushManualUpdate({
          signalQuality: 34,
          noise: true,
          connection: "connected"
        });
        break;
      case "notWorn":
        pushManualUpdate({
          wearing: false,
          signalQuality: 18,
          connection: "connected",
          noise: true
        });
        break;
      case "disconnected":
        pushManualUpdate({
          connection: "disconnected",
          signalQuality: 12,
          noise: true
        });
        break;
      case "reset":
        resetState(selectedMode);
        break;
    }
  };

  const reconnectRemote = () => {
    if (sessionSource !== "remote") {
      return;
    }

    stopMockFeed();
    suppressDisconnectNoticeRef.current = true;
    serviceRef.current.disconnect();
    setConnectionStatus("waiting");
    serviceRef.current.connect(normalizeWebSocketUrl(websocketUrl));
  };

  const setSelectedMode = (mode: DeviceMode) => {
    setSelectedModeState(mode);

    setState((prev) => {
      const nextState = { ...prev, mode };
      serviceRef.current.setBaseState(nextState);
      return nextState;
    });
  };

  const setWebsocketUrl = (value: string) => {
    setWebsocketUrlState(value);
  };

  const value = useMemo<Fx2RealtimeContextValue>(
    () => ({
      state,
      summary: summarizeFx2State(state),
      selectedMode,
      sessionSource,
      sessionPhase,
      websocketUrl,
      connectionStatus,
      hasRemoteData,
      setSelectedMode,
      setSessionSource,
      setWebsocketUrl,
      startSession,
      stopSession,
      reconnectRemote,
      pushManualUpdate,
      applyPreset
    }),
    [connectionStatus, hasRemoteData, selectedMode, sessionPhase, sessionSource, state, websocketUrl]
  );

  return <Fx2RealtimeContext.Provider value={value}>{children}</Fx2RealtimeContext.Provider>;
};

export const useFx2RealtimeSession = () => {
  const context = useContext(Fx2RealtimeContext);

  if (!context) {
    throw new Error("useFx2RealtimeSession must be used within Fx2RealtimeProvider");
  }

  return context;
};
