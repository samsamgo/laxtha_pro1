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
import type { DeviceMode, Fx2BinaryFrame, Fx2State } from "../types/fx2";

type SessionPhase = "idle" | "running" | "stopped";

const HARDWARE_SAMPLE_RATE_HZ = 60;
const HARDWARE_SAMPLE_INTERVAL_MS = 1000 / HARDWARE_SAMPLE_RATE_HZ;
const UART_PC_MODULO = 32;

interface TimestampedHardwareFrame {
  frame: Fx2BinaryFrame;
  timestamp: number;
}

interface Fx2RealtimeContextValue {
  state: Fx2State;
  summary: ReturnType<typeof summarizeFx2State>;
  selectedMode: DeviceMode;
  sessionPhase: SessionPhase;
  hardwareStatus: Fx2HardwareStatus;
  recorderSummary: EegSessionSummary;
  /**
   * True once the user has disconnected the device in this tab. Web Serial does not reliably
   * reopen Bluetooth SPP COM ports after a manual close on Windows/Chrome — a page reload is
   * the most reliable recovery. LivePage uses this flag to gate the connect button and offer
   * a reload prompt.
   */
  needsReload: boolean;
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
  const [needsReload, setNeedsReload] = useState(false);

  const hardwareRef = useRef(new Fx2HardwareService());
  const pendingHardwareRef = useRef<Fx2BinaryFrame[]>([]);
  const recorderRef = useRef(new EegSessionRecorder());
  const recTickRef = useRef<number | null>(null);
  const renderTickRef = useRef<number | null>(null);
  const sessionActiveRef = useRef(false);
  const sessionPhaseRef = useRef<SessionPhase>("idle");
  const [recorderSummary, setRecorderSummary] = useState<EegSessionSummary>(
    () => recorderRef.current.getSummary()
  );

  useEffect(() => {
    sessionPhaseRef.current = sessionPhase;
  }, [sessionPhase]);

  const getPcSampleSteps = (previousPc: number | undefined, nextPc: number | undefined) => {
    if (previousPc === undefined || nextPc === undefined) return 1;
    const pcDelta = (nextPc - previousPc + UART_PC_MODULO) % UART_PC_MODULO;
    return pcDelta > 0 ? pcDelta : 1;
  };

  const timestampHardwareBatch = (
    frames: Fx2BinaryFrame[],
    previousTimestamp: number | undefined,
    previousPc: number | undefined,
    now = Date.now()
  ): TimestampedHardwareFrame[] => {
    if (frames.length === 0) return [];

    const intervalsFromPrevious = frames.map((frame, index) => {
      const priorPc = index === 0 ? previousPc : frames[index - 1].pc;
      return getPcSampleSteps(priorPc, frame.pc) * HARDWARE_SAMPLE_INTERVAL_MS;
    });

    const intraBatchDuration = intervalsFromPrevious
      .slice(1)
      .reduce((total, interval) => total + interval, 0);

    let firstTimestamp = now - intraBatchDuration;

    if (previousTimestamp !== undefined) {
      const minimumFirstTimestamp = previousTimestamp + intervalsFromPrevious[0];
      firstTimestamp = Math.max(firstTimestamp, minimumFirstTimestamp);
    }

    let timestamp = firstTimestamp;
    return frames.map((frame, index) => {
      if (index > 0) {
        timestamp += intervalsFromPrevious[index];
      }

      return { frame, timestamp };
    });
  };

  const applyHardwareFrames = (frames: Fx2BinaryFrame[], prev: Fx2State) => {
    const previousTimestamp = prev.timestamps[prev.timestamps.length - 1];
    const previousPc = prev.pc[prev.pc.length - 1];
    const timestampedFrames = timestampHardwareBatch(frames, previousTimestamp, previousPc);

    return timestampedFrames.reduce((nextState, { frame, timestamp }) => {
      const nextMessage = parseUartBinaryFrame(frame, nextState, timestamp);
      return nextMessage ? applyIncomingMessage(nextMessage, nextState) : nextState;
    }, prev);
  };

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
          pendingHardwareRef.current = [];
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

      // Buffer frames; a 30Hz interval drains and applies them to avoid
      // per-frame React renders at full 60Hz hardware rate
      pendingHardwareRef.current.push(event.frame);
    });
  }, []);

  // 30Hz render tick: drains hardware frame buffer and applies to state
  useEffect(() => {
    renderTickRef.current = window.setInterval(() => {
      if (!sessionActiveRef.current || pendingHardwareRef.current.length === 0) return;
      const frames = pendingHardwareRef.current;
      pendingHardwareRef.current = [];
      setState((prev) => applyHardwareFrames(frames, prev));
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
  // After a manual disconnect in this tab, Web Serial can fail to reopen the same port
  // (especially Bluetooth SPP on Windows). Prompt for a reload instead of attempting reconnect.
  const connectDevice = async (): Promise<boolean> => {
    if (needsReload) {
      const confirmed = window.confirm(
        "안정적인 재연결을 위해 페이지를 새로고침해야 합니다.\n새로고침하시겠습니까?\n\n• 현재 화면에 남아 있는 측정값은 사라집니다.\n• 저장하지 않은 CSV/JSON이 있다면 먼저 내보내 주세요."
      );
      if (confirmed) {
        window.location.reload();
      }
      return false;
    }
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
    setNeedsReload(true);
    setState((prev) => ({
      ...prev,
      connected: false,
      logs: appendLog(prev.logs, "장치 연결을 해제했습니다. 재연결하려면 페이지를 새로고침하세요."),
    }));
  };

  // Start recording — hardware must already be connected.
  const startSession = () => {
    sessionActiveRef.current = true;
    pendingHardwareRef.current = [];
    setState(createInitialFx2State("serial"));
    setSessionPhase("running");
    recorderRef.current.startRecording("serial");
    setRecorderSummary(recorderRef.current.getSummary());
    startRecTick();
  };

  // Stop recording — keeps hardware connected for smooth restart.
  const stopSession = () => {
    sessionActiveRef.current = false;
    pendingHardwareRef.current = [];
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
      needsReload,
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
    [hardwareStatus, recorderSummary, selectedMode, sessionPhase, state, needsReload]
  );

  return <Fx2RealtimeContext.Provider value={value}>{children}</Fx2RealtimeContext.Provider>;
};

export const useFx2RealtimeSession = () => {
  const context = useContext(Fx2RealtimeContext);
  if (!context) throw new Error("useFx2RealtimeSession must be used within Fx2RealtimeProvider");
  return context;
};
