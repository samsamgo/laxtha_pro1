import type { EegSample, EegSessionExport, EegSessionSummary } from "../types/eegRecorder";

export class EegSessionRecorder {
  private samples: EegSample[] = [];
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private recording = false;
  private sessionMode = "";

  startRecording(mode: string): void {
    this.samples = [];
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
    this.startedAt = null;
    this.endedAt = null;
    this.recording = false;
  }

  appendSample(sample: EegSample): void {
    if (!this.recording) return;
    this.samples.push(sample);
  }

  getSummary(): EegSessionSummary {
    const now = Date.now();
    const durationMs = this.startedAt
      ? (this.recording ? now : (this.endedAt ?? now)) - this.startedAt
      : 0;

    return {
      isRecording: this.recording,
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      endedAt: this.endedAt ? new Date(this.endedAt).toISOString() : null,
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
      `# Started: ${new Date(startTs).toISOString()}`,
      `# Ended: ${new Date(endTs).toISOString()}`,
      `# Duration: ${(durationMs / 1000).toFixed(1)}s`,
      `# Samples: ${this.samples.length}`,
      `# Note: All recorded samples are included — includes data no longer visible on chart`,
      `# Exported: ${new Date().toISOString()}`,
    ].join("\n");

    const header =
      "timestamp,elapsed_ms,ch1_uv,ch2_uv,bpm,ppg,sdppg,rr_interval_ms,power_spectrum,wear,signal,mode";
    const rows = this.samples.map(
      (s) =>
        `${s.timestamp},${s.elapsedMs},${s.ch1.toFixed(4)},${s.ch2.toFixed(4)},${s.bpm},${s.ppg.toFixed(4)},${s.sdppg.toFixed(4)},${s.rrInterval},${s.powerSpectrum.toFixed(2)},${s.wear},${s.signal},${s.mode}`
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
      device: "FX2",
      app: "FX2 Web Dashboard",
      mode: this.sessionMode,
      startedAt: new Date(startTs).toISOString(),
      endedAt: new Date(endTs).toISOString(),
      durationMs: endTs - startTs,
      channels: ["ch1_uv", "ch2_uv", "bpm", "ppg", "sdppg", "rr_interval_ms", "power_spectrum"],
      sampleCount: this.samples.length,
      samples: this.samples,
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
