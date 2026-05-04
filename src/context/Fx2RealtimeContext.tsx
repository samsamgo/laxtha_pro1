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
import { EegSessionRecorder } from "../lib/eegSessionRecorder";
import {
  appendLog,
  applyIncomingMessage,
  buildMessageFromState,
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
import type { DeviceMode, Fx2BinaryFrame, Fx2IncomingMessage, Fx2State } from "../types/fx2";

type DemoPreset = "balanced" | "weakSignal" | "notWorn" | "disconnected" | "reset";

type SessionPhase = "idle" | "running" | "stopped";

export interface Fx2HardwareDiagnostics {
  totalFrames: number;
  ppdValidFrames: number;
  ppdStandbyFrames: number;
  droppedFrames: number;
  lastPpd: boolean | null;
  lastPud0: number | null;
  lastPc: number | null;
  lastBpm: number | null;
  lastRrInterval: number | null;
  lastCh1Raw: number | null;
  lastCh2Raw: number | null;
  lastElectrodeStatus: number | null;
  lastFrameAt: string | null;
}

interface Fx2RealtimeContextValue {
  state: Fx2State;
  summary: ReturnType<typeof summarizeFx2State>;
  selectedMode: DeviceMode;
  sessionPhase: SessionPhase;
  hardwareStatus: Fx2HardwareStatus;
  hardwareDetail: string;
  hardwareDiagnostics: Fx2HardwareDiagnostics;
  recorderSummary: EegSessionSummary;
  setSelectedMode: (mode: DeviceMode) => void;
  startSession: (modeOverride?: DeviceMode) => Promise<boolean>;
  stopSession: () => void;
  disconnectHardware: () => void;
  pushManualUpdate: (patch: Partial<Fx2IncomingMessage>) => boolean;
  applyPreset: (preset: DemoPreset) => void;
  appendSample: (sample: EegSample) => void;
  exportCsv: () => void;
  exportJson: () => void;
  clearRecording: () => void;
}

const Fx2RealtimeContext = createContext<Fx2RealtimeContextValue | null>(null);

const createInitialHardwareDiagnostics = (): Fx2HardwareDiagnostics => ({
  totalFrames: 0,
  ppdValidFrames: 0,
  ppdStandbyFrames: 0,
  droppedFrames: 0,
  lastPpd: null,
  lastPud0: null,
  lastPc: null,
  lastBpm: null,
  lastRrInterval: null,
  lastCh1Raw: null,
  lastCh2Raw: null,
  lastElectrodeStatus: null,
  lastFrameAt: null,
});

const updateUartDiagnostics = (
  prev: Fx2HardwareDiagnostics,
  frame: Fx2BinaryFrame
): Fx2HardwareDiagnostics => {
  // PC cycles 0-31; check for non-consecutive value to detect dropped frames
  const expectedPc = prev.lastPc !== null ? (prev.lastPc + 1) % 32 : null;
  const pcDropped = expectedPc !== null && frame.pc !== expectedPc ? 1 : 0;

  return {
    totalFrames: prev.totalFrames + 1,
    ppdValidFrames: prev.ppdValidFrames + (frame.ppd ? 1 : 0),
    ppdStandbyFrames: prev.ppdStandbyFrames + (frame.ppd ? 0 : 1),
    droppedFrames: prev.droppedFrames + pcDropped,
    lastPpd: frame.ppd,
    lastPud0: frame.pud0,
    lastPc: frame.pc,
    lastBpm: frame.bpm,
    lastRrInterval: frame.ch6Raw,
    lastCh1Raw: frame.ch1Raw,
    lastCh2Raw: frame.ch2Raw,
    lastElectrodeStatus: frame.electrodeStatus,
    lastFrameAt: new Date().toISOString(),
  };
};

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
  const [hardwareDiagnostics, setHardwareDiagnostics] =
    useState<Fx2HardwareDiagnostics>(() => createInitialHardwareDiagnostics());

  const hardwareRef = useRef(new Fx2HardwareService());
  const mockTimerRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  const pendingHardwareRef = useRef<Fx2IncomingMessage[]>([]);
  const hardwareRafRef = useRef<number | null>(null);
  const recorderRef = useRef(new EegSessionRecorder());
  const recTickRef = useRef<number | null>(null);
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

      setHardwareDiagnostics((prev) => updateUartDiagnostics(prev, event.frame));
      const nextMessage = parseUartBinaryFrame(event.frame, stateRef.current);

      if (!nextMessage) {
        // PPD=0 standby frame — silent discard (expected during charging/standby)
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
      if (recTickRef.current !== null) {
        window.clearInterval(recTickRef.current);
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
    setHardwareDiagnostics(createInitialHardwareDiagnostics());
  };

  const connectHardware = async () => {
    const connected = await hardwareRef.current.connectSerial();

    if (!connected) {
      setSessionPhase("idle");
    }

    return connected;
  };

  const startSession = async (modeOverride?: DeviceMode) => {
    const nextMode = modeOverride ?? selectedMode;

    stopMockFeed();
    setSelectedModeState(nextMode);
    resetState(nextMode);
    setSessionPhase("running");

    recorderRef.current.startRecording(nextMode);
    setRecorderSummary(recorderRef.current.getSummary());
    startRecTick();

    if (nextMode === "demo") {
      await hardwareRef.current.disconnect();
      mockTimerRef.current = window.setInterval(() => {
        setState((prev) => applyIncomingMessage(createMockMessage(prev), prev));
      }, 1000);
      return true;
    }

    return connectHardware();
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
    recorderRef.current.stopRecording();
    stopRecTick();
    setRecorderSummary(recorderRef.current.getSummary());
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
    recorderRef.current.stopRecording();
    stopRecTick();
    setRecorderSummary(recorderRef.current.getSummary());
  };

  const appendSample = (sample: EegSample) => {
    recorderRef.current.appendSample(sample);
  };

  const exportCsv = () => {
    recorderRef.current.exportCsv();
  };

  const exportJson = () => {
    recorderRef.current.exportJson();
  };

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
      hardwareDetail,
      hardwareDiagnostics,
      recorderSummary,
      setSelectedMode,
      startSession,
      stopSession,
      disconnectHardware,
      pushManualUpdate,
      applyPreset,
      appendSample,
      exportCsv,
      exportJson,
      clearRecording,
    }),
    [
      hardwareDetail,
      hardwareDiagnostics,
      hardwareStatus,
      recorderSummary,
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
