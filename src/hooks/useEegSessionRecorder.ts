import { useCallback, useEffect, useRef, useState } from "react";
import { EegSessionRecorder } from "../lib/eegSessionRecorder";
import type { EegSample, EegSessionSummary } from "../types/eegRecorder";

const SUMMARY_TICK_MS = 500;

export interface EegSessionRecorderControls {
  summary: EegSessionSummary;
  startRecording: (mode: string) => void;
  stopRecording: () => void;
  clearRecording: () => void;
  appendSample: (sample: EegSample) => void;
  exportCsv: () => void;
  exportJson: () => void;
}

export function useEegSessionRecorder(): EegSessionRecorderControls {
  const recorderRef = useRef(new EegSessionRecorder());
  const tickRef = useRef<number | null>(null);

  const [summary, setSummary] = useState<EegSessionSummary>(() =>
    recorderRef.current.getSummary()
  );

  const startTick = useCallback(() => {
    if (tickRef.current !== null) return;
    tickRef.current = window.setInterval(() => {
      setSummary(recorderRef.current.getSummary());
    }, SUMMARY_TICK_MS);
  }, []);

  const stopTick = useCallback(() => {
    if (tickRef.current === null) return;
    window.clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  useEffect(() => () => stopTick(), [stopTick]);

  const startRecording = useCallback(
    (mode: string) => {
      recorderRef.current.startRecording(mode);
      setSummary(recorderRef.current.getSummary());
      startTick();
    },
    [startTick]
  );

  const stopRecording = useCallback(() => {
    recorderRef.current.stopRecording();
    stopTick();
    setSummary(recorderRef.current.getSummary());
  }, [stopTick]);

  const clearRecording = useCallback(() => {
    recorderRef.current.clearRecording();
    stopTick();
    setSummary(recorderRef.current.getSummary());
  }, [stopTick]);

  const appendSample = useCallback((sample: EegSample) => {
    recorderRef.current.appendSample(sample);
  }, []);

  const exportCsv = useCallback(() => {
    recorderRef.current.exportCsv();
  }, []);

  const exportJson = useCallback(() => {
    recorderRef.current.exportJson();
  }, []);

  return {
    summary,
    startRecording,
    stopRecording,
    clearRecording,
    appendSample,
    exportCsv,
    exportJson,
  };
}
