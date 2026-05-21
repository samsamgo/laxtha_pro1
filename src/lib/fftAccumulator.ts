import { toKstIso } from "./timeFormat";

export interface FftBandPowers {
  theta: number;
  alpha: number;
  lBeta: number;
  mBeta: number;
  hBeta: number;
  gamma: number;
  total: number;
}

export interface FftEpoch {
  startedAt: number;
  endedAt: number;
  startedAtIso: string;
  endedAtIso: string;
  freqResolutionHz: number;
  ch1Bins: number[];
  ch2Bins: number[];
  bands: {
    ch1: FftBandPowers;
    ch2: FftBandPowers;
  };
}

export type FftBandName = Exclude<keyof FftBandPowers, "total">;

export const FFT_BIN_COUNT = 103;
export const FFT_FREQUENCY_RESOLUTION_HZ = 1 / 2.048;
export const FFT_MAX_EPOCHS = 60;

export const FFT_BAND_INDICES: Record<FftBandName, [number, number]> = {
  theta: [9, 16],
  alpha: [17, 24],
  lBeta: [25, 30],
  mBeta: [31, 40],
  hBeta: [41, 61],
  gamma: [62, 82],
};

const createEmptyBins = () => Array<number>(FFT_BIN_COUNT).fill(0);

const sumRange = (bins: number[], start: number, end: number) => {
  let total = 0;
  for (let index = start; index <= end; index += 1) {
    total += bins[index] ?? 0;
  }
  return total;
};

const calculateBands = (bins: number[]): FftBandPowers => ({
  theta: sumRange(bins, ...FFT_BAND_INDICES.theta),
  alpha: sumRange(bins, ...FFT_BAND_INDICES.alpha),
  lBeta: sumRange(bins, ...FFT_BAND_INDICES.lBeta),
  mBeta: sumRange(bins, ...FFT_BAND_INDICES.mBeta),
  hBeta: sumRange(bins, ...FFT_BAND_INDICES.hBeta),
  gamma: sumRange(bins, ...FFT_BAND_INDICES.gamma),
  total: sumRange(bins, 1, 82),
});

export class FftAccumulator {
  private active = false;
  private n = 0;
  private startedAt = 0;
  private ch1Bins = createEmptyBins();
  private ch2Bins = createEmptyBins();

  ingest(ch3Raw: number, pud0Bit0: boolean, timestamp: number): FftEpoch | null {
    if (pud0Bit0) {
      this.start(timestamp);
    }

    if (!this.active) {
      return null;
    }

    const power = ch3Raw / 10;
    const index = this.n;

    if (index <= 102) {
      this.ch1Bins[index] = power;
    } else if (index <= 205) {
      this.ch2Bins[index - 103] = power;
    }

    if (index === 205) {
      const epoch = this.finalize(timestamp);
      this.reset();
      return epoch;
    }

    this.n = index + 1;
    return null;
  }

  reset(): void {
    this.active = false;
    this.n = 0;
    this.startedAt = 0;
    this.ch1Bins = createEmptyBins();
    this.ch2Bins = createEmptyBins();
  }

  private start(timestamp: number): void {
    this.active = true;
    this.n = 0;
    this.startedAt = timestamp;
    this.ch1Bins = createEmptyBins();
    this.ch2Bins = createEmptyBins();
  }

  private finalize(endedAt: number): FftEpoch {
    const ch1Bins = this.ch1Bins.slice();
    const ch2Bins = this.ch2Bins.slice();
    return {
      startedAt: this.startedAt,
      endedAt,
      startedAtIso: toKstIso(this.startedAt),
      endedAtIso: toKstIso(endedAt),
      freqResolutionHz: FFT_FREQUENCY_RESOLUTION_HZ,
      ch1Bins,
      ch2Bins,
      bands: {
        ch1: calculateBands(ch1Bins),
        ch2: calculateBands(ch2Bins),
      },
    };
  }
}
