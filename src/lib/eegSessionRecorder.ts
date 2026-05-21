import type { EegSample, EegSessionExport, EegSessionSummary } from "../types/eegRecorder";
import {
  FFT_BAND_INDICES,
  FFT_BIN_COUNT,
  FFT_FREQUENCY_RESOLUTION_HZ,
  type FftEpoch,
} from "./fftAccumulator";
import { KST_TIMEZONE, toKstIso } from "./timeFormat";

export class EegSessionRecorder {
  private samples: EegSample[] = [];
  private fftEpochs: FftEpoch[] = [];
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private recording = false;
  private sessionMode = "";

  startRecording(mode: string): void {
    this.samples = [];
    this.fftEpochs = [];
    this.startedAt = Date.now();
    this.endedAt = null;
    this.recording = true;
    this.sessionMode = mode;
  }

  stopRecording(): void {
    if (!this.recording) return;
    this.recording = false;
    this.endedAt = Date.now();
  }

  clearRecording(): void {
    this.samples = [];
    this.fftEpochs = [];
    this.startedAt = null;
    this.endedAt = null;
    this.recording = false;
  }

  appendSample(sample: EegSample): void {
    if (!this.recording) return;
    this.samples.push({
      ...sample,
      rrInterval: Number.isFinite(sample.rrInterval) ? sample.rrInterval : 0,
    });
  }

  appendFftEpoch(epoch: FftEpoch): void {
    if (!this.recording) return;
    this.fftEpochs.push(epoch);
  }

  getSummary(): EegSessionSummary {
    const now = Date.now();
    const durationMs = this.startedAt
      ? (this.recording ? now : (this.endedAt ?? now)) - this.startedAt
      : 0;

    return {
      isRecording: this.recording,
      startedAt: this.startedAt ? toKstIso(this.startedAt) : null,
      endedAt: this.endedAt ? toKstIso(this.endedAt) : null,
      durationMs,
      sampleCount: this.samples.length,
      hasRecording: this.samples.length > 0,
    };
  }

  exportCsv(): void {
    if (this.samples.length === 0) return;

    const startTs = this.startedAt ?? Date.now();
    const endTs = this.endedAt ?? Date.now();
    const durationMs = endTs - startTs;

    const metadata = [
      `# FX2 EEG Session Export`,
      `# Device: FX2 Web Serial`,
      `# Mode: ${this.sessionMode}`,
      `# Started: ${toKstIso(startTs)}`,
      `# Ended: ${toKstIso(endTs)}`,
      `# Timezone: ${KST_TIMEZONE} (+09:00)`,
      `# Duration: ${(durationMs / 1000).toFixed(1)}s`,
      `# Samples: ${this.samples.length}`,
      `# Note: All recorded samples are included — includes data no longer visible on chart`,
      `# Exported: ${toKstIso(Date.now())}`,
    ].join("\n");

    const header =
      "timestamp,elapsed_ms,pc,ch1_uv,ch2_uv,bpm,ppg,sdppg,rr_interval_ms,power_spectrum,wear,signal,mode,heartbeat_event,ch1_saturation,ch2_saturation,battery_percent,eeg_valid,ppg_valid";
    const rows = this.samples.map(
      (s) => {
        const nullable = (value: number | null) => value === null ? "" : String(value);
        return `${s.timestamp},${s.elapsedMs},${s.pc},${s.ch1.toFixed(4)},${s.ch2.toFixed(4)},${s.bpm},${s.ppg.toFixed(4)},${s.sdppg.toFixed(4)},${s.rrInterval},${s.powerSpectrum.toFixed(2)},${s.wear},${s.signal},${s.mode},${s.heartbeatEvent},${nullable(s.ch1Saturation)},${nullable(s.ch2Saturation)},${nullable(s.batteryPercent)},${s.eegValid},${s.ppgValid}`;
      }
    );

    // UTF-8 BOM for Excel compatibility
    const BOM = "﻿";
    const csv = BOM + metadata + "\n" + header + "\n" + rows.join("\n");

    try {
      this.downloadBlob(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
        this.buildFilename("csv")
      );
    } catch {
      alert("CSV 저장에 실패했습니다. 브라우저 다운로드 권한을 확인해 주세요.");
    }
  }

  exportJson(): void {
    if (this.samples.length === 0) return;

    const startTs = this.startedAt ?? Date.now();
    const endTs = this.endedAt ?? Date.now();

    const data: EegSessionExport = {
      device: "neuroNicle FX2",
      app: "FX2 Web Dashboard",
      mode: this.sessionMode,
      samplingRateHz: 250,
      eegConversionUvPerDigit: 0.03606,
      eegCenter: 16384,
      ppgUnit: "au",
      ppgRawRange: [0, 32767],
      ppgRawCenter: 16384,
      bandwidthHz: [3, 41],
      fftFrequencyResolutionHz: FFT_FREQUENCY_RESOLUTION_HZ,
      fftBins: FFT_BIN_COUNT,
      bandIndices: FFT_BAND_INDICES,
      startedAt: toKstIso(startTs),
      endedAt: toKstIso(endTs),
      timezone: KST_TIMEZONE,
      timezoneOffset: "+09:00",
      durationMs: endTs - startTs,
      channels: [
        "pc",
        "ch1_uv",
        "ch2_uv",
        "bpm",
        "ppg",
        "sdppg",
        "rr_interval_ms",
        "power_spectrum",
        "heartbeat_event",
        "ch1_saturation",
        "ch2_saturation",
        "battery_percent",
        "eeg_valid",
        "ppg_valid",
      ],
      sampleCount: this.samples.length,
      samples: this.samples,
      fftEpochCount: this.fftEpochs.length,
      fftEpochs: this.fftEpochs,
    };

    try {
      this.downloadBlob(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
        this.buildFilename("json")
      );
    } catch {
      alert("JSON 저장에 실패했습니다. 브라우저 다운로드 권한을 확인해 주세요.");
    }
  }

  private buildFilename(ext: string): string {
    const d = new Date(this.startedAt ?? Date.now());
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    const suffix = this.samples.length > 100000 ? `_${this.samples.length}samples` : "";
    return `FX2_session_${date}_${time}${suffix}.${ext}`;
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
