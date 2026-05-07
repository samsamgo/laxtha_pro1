export type EegFilterPreset = "raw" | "eeg" | "alpha" | "beta";

export const EEG_FILTER_PRESETS: { value: EegFilterPreset; label: string; title: string }[] = [
  { value: "eeg", label: "EEG", title: "0.5 Hz high-pass + adaptive low-pass; 60 Hz notch when sample rate allows" },
  { value: "raw", label: "Raw", title: "No display filter" },
  { value: "alpha", label: "Alpha", title: "8-13 Hz band-pass" },
  { value: "beta", label: "Beta", title: "13-30 Hz band-pass, clamped by sample rate" },
];

const TWO_PI = Math.PI * 2;

const sanitize = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) ? value : 0;

const estimateSampleRate = (timeSeconds: number[]) => {
  if (timeSeconds.length < 2) return null;

  const first = timeSeconds[0];
  const last = timeSeconds[timeSeconds.length - 1];
  const duration = last - first;

  if (!Number.isFinite(duration) || duration <= 0) return null;
  return (timeSeconds.length - 1) / duration;
};

const highPass = (values: number[], sampleRate: number, cutoffHz: number) => {
  if (values.length === 0 || cutoffHz <= 0) return values;

  const dt = 1 / sampleRate;
  const rc = 1 / (TWO_PI * cutoffHz);
  const alpha = rc / (rc + dt);
  const out = new Array<number>(values.length);

  let previousY = 0;
  let previousX = values[0];
  out[0] = 0;

  for (let i = 1; i < values.length; i++) {
    const x = values[i];
    const y = alpha * (previousY + x - previousX);
    out[i] = y;
    previousY = y;
    previousX = x;
  }

  return out;
};

const lowPass = (values: number[], sampleRate: number, cutoffHz: number) => {
  if (values.length === 0 || cutoffHz <= 0) return values;

  const nyquist = sampleRate / 2;
  const cutoff = Math.min(cutoffHz, nyquist * 0.9);
  if (cutoff <= 0) return values;

  const dt = 1 / sampleRate;
  const rc = 1 / (TWO_PI * cutoff);
  const alpha = dt / (rc + dt);
  const out = new Array<number>(values.length);

  let previousY = values[0];
  out[0] = previousY;

  for (let i = 1; i < values.length; i++) {
    previousY += alpha * (values[i] - previousY);
    out[i] = previousY;
  }

  return out;
};

const notch = (values: number[], sampleRate: number, notchHz: number, q = 30) => {
  const nyquist = sampleRate / 2;
  if (values.length === 0 || notchHz <= 0 || notchHz >= nyquist * 0.9) return values;

  const w0 = TWO_PI * notchHz / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);

  const b0 = 1;
  const b1 = -2 * cosW0;
  const b2 = 1;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  const out = new Array<number>(values.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < values.length; i++) {
    const x0 = values[i];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return out;
};

export const applyEegFilterPreset = (
  values: number[],
  timeSeconds: number[],
  preset: EegFilterPreset
) => {
  const cleanValues = values.map(sanitize);
  if (preset === "raw" || cleanValues.length < 3) return cleanValues;

  const sampleRate = estimateSampleRate(timeSeconds);
  if (sampleRate === null || sampleRate <= 2) return cleanValues;

  const nyquist = sampleRate / 2;
  const maxUsefulLowPass = nyquist * 0.84;
  let out = cleanValues;

  if (preset === "eeg") {
    out = highPass(out, sampleRate, 0.5);
    out = lowPass(out, sampleRate, Math.min(45, maxUsefulLowPass));
    return notch(out, sampleRate, 60);
  }

  if (preset === "alpha") {
    if (nyquist <= 14) return out;
    out = highPass(out, sampleRate, 8);
    return lowPass(out, sampleRate, 13);
  }

  if (preset === "beta") {
    const upper = Math.min(30, maxUsefulLowPass);
    if (upper <= 13) return out;
    out = highPass(out, sampleRate, 13);
    return lowPass(out, sampleRate, upper);
  }

  return out;
};
