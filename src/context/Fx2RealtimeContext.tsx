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
  parseHardwarePayload,
  summarizeFx2State
} from "../lib/fx2Realtime";
import {
  Fx2HardwareService,
  type Fx2HardwareStatus,
} from "../services/fx2Hardware";
import type { DeviceMode, Fx2IncomingMessage, Fx2State } from "../types/fx2";

type DemoPreset = "balanced" | "weakSignal" | "notWorn" | "disconnected" | "reset";

type SessionPhase = "idle" | "running" | "stopped";

interface Fx2RealtimeContextValue {
  state: Fx2State;
  summary: ReturnType<typeof summarizeFx2State>;
  selectedMode: DeviceMode;
  sessionPhase: SessionPhase;
  hardwareStatus: Fx2HardwareStatus;
  hardwareDetail: string;
  setSelectedMode: (mode: DeviceMode) => void;
  startSession: () => void;
  stopSession: () => void;
  disconnectHardware: () => void;
  pushManualUpdate: (patch: Partial<Fx2IncomingMessage>) => boolean;
  applyPreset: (preset: DemoPreset) => void;
}

const Fx2RealtimeContext = createContext<Fx2RealtimeContextValue | null>(null);

const applyLocalMessage = (
  nextMessage: Fx2IncomingMessage,
  setState: Dispatch<React.SetStateAction<Fx2State>>
) => {
  setState((prev) => applyIncomingMessage(nextMessage, prev));
};

export const Fx2RealtimeProvider = ({ children }: PropsWithChildren) => {
  const [selectedMode, setSelectedModeState] = useState<DeviceMode>("demo");
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("idle");
  const [state, setState] = useState<Fx2State>(() => createInitialFx2State("demo"));
  const [hardwareStatus, setHardwareStatus] = useState<Fx2HardwareStatus>("idle");
  const [hardwareDetail, setHardwareDetail] = useState("");

  const hardwareRef = useRef(new Fx2HardwareService());
  const mockTimerRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  const pendingHardwareRef = useRef<Fx2IncomingMessage[]>([]);
  const hardwareRafRef = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const hardware = hardwareRef.current;

    return hardware.subscribe((event) => {
      if (event.type === "status") {
        setHardwareStatus(event.status);
        setHardwareDetail(event.detail ?? "");

        if (event.status === "error" || event.status === "unsupported") {
          setState((prev) => ({
            ...prev,
            logs: appendLog(
              prev.logs,
              event.detail || "하드웨어 연결 상태를 확인해 주세요."
            ),
          }));
        }

        const statusDetail = event.detail;

        if (event.status === "connected" && statusDetail) {
          setState((prev) => ({
            ...prev,
            logs: appendLog(prev.logs, statusDetail),
          }));
        }

        return;
      }

      const nextMessage = parseHardwarePayload(
        event.raw,
        event.mode,
        stateRef.current
      );

      if (!nextMessage) {
        setState((prev) => ({
          ...prev,
          logs: appendLog(
            prev.logs,
            `[${event.mode.toUpperCase()}] 수신 값을 해석하지 못했습니다: ${event.raw}`
          ),
        }));
        return;
      }

      pendingHardwareRef.current.push(nextMessage);

      if (hardwareRafRef.current === null) {
        hardwareRafRef.current = requestAnimationFrame(() => {
          const messages = pendingHardwareRef.current;
          pendingHardwareRef.current = [];
          hardwareRafRef.current = null;

          if (messages.length === 0) return;

          setState((prev) =>
            messages.reduce((s, msg) => applyIncomingMessage(msg, s), prev)
          );
          const last = messages[messages.length - 1];
          setSelectedModeState(last.mode);
          setSessionPhase("running");
        });
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (mockTimerRef.current !== null) {
        window.clearInterval(mockTimerRef.current);
      }
      if (hardwareRafRef.current !== null) {
        cancelAnimationFrame(hardwareRafRef.current);
      }
      void hardwareRef.current.disconnect();
    };
  }, []);

  const stopMockFeed = () => {
    if (mockTimerRef.current !== null) {
      window.clearInterval(mockTimerRef.current);
      mockTimerRef.current = null;
    }
  };

  const resetState = (mode: DeviceMode) => {
    setState(createInitialFx2State(mode));
  };

  const connectHardware = async (mode: Extract<DeviceMode, "bluetooth" | "uart">) => {
    const connected =
      mode === "bluetooth"
        ? await hardwareRef.current.connectBluetooth()
        : await hardwareRef.current.connectUart();

    if (!connected) {
      setSessionPhase("idle");
    }
  };

  const startSession = () => {
    stopMockFeed();
    void hardwareRef.current.disconnect();
    resetState(selectedMode);
    setSessionPhase("running");

    if (selectedMode === "demo") {
      mockTimerRef.current = window.setInterval(() => {
        setState((prev) => applyIncomingMessage(createMockMessage(prev), prev));
      }, 1000);
      return;
    }

    void connectHardware(selectedMode);
  };

  const stopSession = () => {
    stopMockFeed();
    void hardwareRef.current.disconnect();
    setSessionPhase("stopped");
    setState((prev) => ({
      ...prev,
      connected: false,
      logs: appendLog(prev.logs, "측정을 종료했습니다.")
    }));
  };

  const pushManualUpdate = (patch: Partial<Fx2IncomingMessage>) => {
    if (selectedMode === "demo") {
      stopMockFeed();
    }

    const nextMessage = buildMessageFromState(
      { ...state, mode: selectedMode },
      { ...patch, mode: selectedMode }
    );
    applyLocalMessage(nextMessage, setState);
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

  const disconnectHardware = () => {
    stopMockFeed();
    void hardwareRef.current.disconnect();
    setSessionPhase("stopped");
    setState((prev) => ({
      ...prev,
      connected: false,
      logs: appendLog(prev.logs, "장치 연결을 해제했습니다.")
    }));
  };

  const setSelectedMode = (mode: DeviceMode) => {
    setSelectedModeState(mode);
    setState((prev) => ({ ...prev, mode }));
  };

  const value = useMemo<Fx2RealtimeContextValue>(
    () => ({
      state,
      summary: summarizeFx2State(state),
      selectedMode,
      sessionPhase,
      hardwareStatus,
      hardwareDetail,
      setSelectedMode,
      startSession,
      stopSession,
      disconnectHardware,
      pushManualUpdate,
      applyPreset
    }),
    [
      hardwareDetail,
      hardwareStatus,
      selectedMode,
      sessionPhase,
      state,
    ]
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
