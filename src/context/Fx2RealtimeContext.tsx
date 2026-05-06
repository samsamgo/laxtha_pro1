import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { EegSessionRecorder } from "../lib/eegSessionRecorder";
import {
  appendLog,
  applyIncomingMessage,
  createInitialFx2State,
  createMockMessage,
  parseUartBinaryFrame,
  summarizeFx2State
} from "../lib/fx2Realtime";
import {
  Fx2HardwareService,
  type Fx2HardwareStatus,
} from "../services/fx2Hardware";
import type { EegSample, EegSessionSummary } from "../types/eegRecorder";
import type { DeviceMode, Fx2IncomingMessage, Fx2State } from "../types/fx2";

type SessionPhase = "idle" | "running" | "stopped";

interface Fx2RealtimeContextValue {
  state: Fx2State;
  summary: ReturnType<typeof summarizeFx2State>;
  selectedMode: DeviceMode;
  sessionPhase: SessionPhase;
  hardwareStatus: Fx2HardwareStatus;
  recorderSummary: EegSessionSummary;
  setSelectedMode: (mode: DeviceMode) => void;
  startSession: (modeOverride?: DeviceMode) => Promise<boolean>;
  stopSession: () => void;
  disconnectHardware: () => void;
  appendSample: (sample: EegSample) => void;
  exportCsv: () => void;
  exportJson: () => void;
  clearRecording: () => void;
}

const Fx2RealtimeContext = createContext<Fx2RealtimeContextValue | null>(null);

export const Fx2RealtimeProvider = ({ children }: PropsWithChildren) => {
  const [selectedMode, setSelectedModeState] = useState<DeviceMode>("demo");
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("idle");
  const [state, setState] = useState<Fx2State>(() => createInitialFx2State("demo"));
  const [hardwareStatus, setHardwareStatus] = useState<Fx2HardwareStatus>("idle");

  const hardwareRef = useRef(new Fx2HardwareService());
  const mockTimerRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  const pendingHardwareRef = useRef<Fx2IncomingMessage[]>([]);
  const hardwareRafRef = useRef<number | null>(null);
  const recorderRef = useRef(new EegSessionRecorder());
  const recTickRef = useRef<number | null>(null);
  // Controls whether incoming hardware frames are processed — false while session is stopped
  const sessionActiveRef = useRef(false);
  const [recorderSummary, setRecorderSummary] = useState<EegSessionSummary>(
    () => recorderRef.current.getSummary()
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const hardware = hardwareRef.current;

    return hardware.subscribe((event) => {
      if (event.type === "status") {
        setHardwareStatus(event.status);

        if (event.status === "error" || event.status === "unsupported") {
          setState((prev) => ({
            ...prev,
            logs: appendLog(prev.logs, event.detail || "하드웨어 연결 상태를 확인해 주세요."),
          }));
        }
        return;
      }

      // Discard frames when session is not active — keeps the serial port open for reconnect
      if (!sessionActiveRef.current) return;

      const nextMessage = parseUartBinaryFrame(event.frame, stateRef.current);
      if (!nextMessage) return; // PPD=0 standby frame

      pendingHardwareRef.current.push(nextMessage);

      if (hardwareRafRef.current === null) {
        hardwareRafRef.current = requestAnimationFrame(() => {
          const messages = pendingHardwareRef.current;
          pendingHardwareRef.current = [];
          hardwareRafRef.current = null;

          if (messages.length === 0 || !sessionActiveRef.current) return;

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
      if (mockTimerRef.current !== null) window.clearInterval(mockTimerRef.current);
      if (hardwareRafRef.current !== null) cancelAnimationFrame(hardwareRafRef.current);
      if (recTickRef.current !== null) window.clearInterval(recTickRef.current);
      void hardwareRef.current.disconnect();
    };
  }, []);

  const stopMockFeed = () => {
    if (mockTimerRef.current !== null) {
      window.clearInterval(mockTimerRef.current);
      mockTimerRef.current = null;
    }
  };

  const startRecTick = () => {
    if (recTickRef.current !== null) return;
    recTickRef.current = window.setInterval(() => {
      setRecorderSummary(recorderRef.current.getSummary());
    }, 500);
  };

  const stopRecTick = () => {
    if (recTickRef.current !== null) {
      window.clearInterval(recTickRef.current);
      recTickRef.current = null;
    }
  };

  const resetState = (mode: DeviceMode) => {
    setState(createInitialFx2State(mode));
  };

  const connectHardware = async () => {
    const connected = await hardwareRef.current.connectSerial();
    if (!connected) {
      sessionActiveRef.current = false;
      setSessionPhase("idle");
    }
    return connected;
  };

  const startSession = async (modeOverride?: DeviceMode) => {
    const nextMode = modeOverride ?? selectedMode;

    stopMockFeed();
    sessionActiveRef.current = true;
    setSelectedModeState(nextMode);
    resetState(nextMode);
    setSessionPhase("running");

    recorderRef.current.startRecording(nextMode);
    setRecorderSummary(recorderRef.current.getSummary());
    startRecTick();

    if (nextMode === "demo") {
      await hardwareRef.current.disconnect();
      mockTimerRef.current = window.setInterval(() => {
        if (!sessionActiveRef.current) return;
        setState((prev) => applyIncomingMessage(createMockMessage(prev), prev));
      }, 1000);
      return true;
    }

    // Serial: reuse existing connection without showing port picker again
    if (hardwareRef.current.getStatus() === "connected") {
      return true;
    }

    return connectHardware();
  };

  // Stops data collection but keeps the serial port open for smooth reconnect
  const stopSession = () => {
    sessionActiveRef.current = false;
    stopMockFeed();
    setSessionPhase("stopped");
    setState((prev) => ({
      ...prev,
      connected: false,
      logs: appendLog(prev.logs, "측정을 종료했습니다.")
    }));
    recorderRef.current.stopRecording();
    stopRecTick();
    setRecorderSummary(recorderRef.current.getSummary());
  };

  // Hard disconnect — releases the serial port
  const disconnectHardware = () => {
    sessionActiveRef.current = false;
    stopMockFeed();
    void hardwareRef.current.disconnect();
    setSessionPhase("stopped");
    setState((prev) => ({
      ...prev,
      connected: false,
      logs: appendLog(prev.logs, "장치 연결을 해제했습니다.")
    }));
    recorderRef.current.stopRecording();
    stopRecTick();
    setRecorderSummary(recorderRef.current.getSummary());
  };

  const appendSample = (sample: EegSample) => {
    recorderRef.current.appendSample(sample);
  };

  const exportCsv = () => recorderRef.current.exportCsv();
  const exportJson = () => recorderRef.current.exportJson();

  const clearRecording = () => {
    recorderRef.current.clearRecording();
    stopRecTick();
    setRecorderSummary(recorderRef.current.getSummary());
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
      recorderSummary,
      setSelectedMode,
      startSession,
      stopSession,
      disconnectHardware,
      appendSample,
      exportCsv,
      exportJson,
      clearRecording,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hardwareStatus, recorderSummary, selectedMode, sessionPhase, state]
  );

  return <Fx2RealtimeContext.Provider value={value}>{children}</Fx2RealtimeContext.Provider>;
};

export const useFx2RealtimeSession = () => {
  const context = useContext(Fx2RealtimeContext);
  if (!context) throw new Error("useFx2RealtimeSession must be used within Fx2RealtimeProvider");
  return context;
};
