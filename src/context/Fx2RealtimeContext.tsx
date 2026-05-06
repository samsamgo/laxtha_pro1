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
  connectDevice: () => Promise<boolean>;
  disconnectDevice: () => void;
  startSession: () => void;
  stopSession: () => void;
  appendSample: (sample: EegSample) => void;
  exportCsv: () => void;
  exportJson: () => void;
  clearRecording: () => void;
}

const Fx2RealtimeContext = createContext<Fx2RealtimeContextValue | null>(null);

export const Fx2RealtimeProvider = ({ children }: PropsWithChildren) => {
  const [selectedMode] = useState<DeviceMode>("serial");
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>("idle");
  const [state, setState] = useState<Fx2State>(() => createInitialFx2State("serial"));
  const [hardwareStatus, setHardwareStatus] = useState<Fx2HardwareStatus>("idle");

  const hardwareRef = useRef(new Fx2HardwareService());
  const stateRef = useRef(state);
  const pendingHardwareRef = useRef<Fx2IncomingMessage[]>([]);
  const recorderRef = useRef(new EegSessionRecorder());
  const recTickRef = useRef<number | null>(null);
  const renderTickRef = useRef<number | null>(null);
  const sessionActiveRef = useRef(false);
  const sessionPhaseRef = useRef<SessionPhase>("idle");
  const [recorderSummary, setRecorderSummary] = useState<EegSessionSummary>(
    () => recorderRef.current.getSummary()
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    sessionPhaseRef.current = sessionPhase;
  }, [sessionPhase]);

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

        // Hardware physically disconnected during session — stop recording
        if (event.status === "idle" && sessionPhaseRef.current === "running") {
          sessionActiveRef.current = false;
          setSessionPhase("stopped");
          setState((prev) => ({
            ...prev,
            connected: false,
            logs: appendLog(prev.logs, "장치 연결이 끊어져 측정을 중단했습니다."),
          }));
        }
        return;
      }

      if (!sessionActiveRef.current) return;

      const nextMessage = parseUartBinaryFrame(event.frame, stateRef.current);
      if (!nextMessage) return;

      // Buffer frames; a 30Hz interval drains and applies them to avoid
      // per-frame React renders at full 60Hz hardware rate
      pendingHardwareRef.current.push(nextMessage);
    });
  }, []);

  // 30Hz render tick: drains hardware frame buffer and applies to state
  useEffect(() => {
    renderTickRef.current = window.setInterval(() => {
      if (!sessionActiveRef.current || pendingHardwareRef.current.length === 0) return;
      const messages = pendingHardwareRef.current;
      pendingHardwareRef.current = [];
      setState((prev) => messages.reduce((s, msg) => applyIncomingMessage(msg, s), prev));
    }, 33); // ~30 Hz
    return () => {
      if (renderTickRef.current !== null) window.clearInterval(renderTickRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (renderTickRef.current !== null) window.clearInterval(renderTickRef.current);
      if (recTickRef.current !== null) window.clearInterval(recTickRef.current);
      void hardwareRef.current.disconnect();
    };
  }, []);

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

  // Connect hardware — shows port picker. Does NOT start recording.
  const connectDevice = async (): Promise<boolean> => {
    return hardwareRef.current.connectSerial();
  };

  // Disconnect hardware — closes port. Stops recording if running.
  const disconnectDevice = () => {
    sessionActiveRef.current = false;
    pendingHardwareRef.current = [];
    if (sessionPhaseRef.current === "running") {
      recorderRef.current.stopRecording();
      stopRecTick();
      setRecorderSummary(recorderRef.current.getSummary());
    }
    void hardwareRef.current.disconnect();
    setSessionPhase("idle");
    setState((prev) => ({
      ...prev,
      connected: false,
      logs: appendLog(prev.logs, "장치 연결을 해제했습니다."),
    }));
  };

  // Start recording — hardware must already be connected.
  const startSession = () => {
    sessionActiveRef.current = true;
    setState(createInitialFx2State("serial"));
    setSessionPhase("running");
    recorderRef.current.startRecording("serial");
    setRecorderSummary(recorderRef.current.getSummary());
    startRecTick();
  };

  // Stop recording — keeps hardware connected for smooth restart.
  const stopSession = () => {
    sessionActiveRef.current = false;
    setSessionPhase("stopped");
    setState((prev) => ({
      ...prev,
      connected: false,
      logs: appendLog(prev.logs, "측정을 종료했습니다."),
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

  const setSelectedMode = (_mode: DeviceMode) => {
    // only serial supported now — no-op kept for interface compatibility
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
      connectDevice,
      disconnectDevice,
      startSession,
      stopSession,
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
