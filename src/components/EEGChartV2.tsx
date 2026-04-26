import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { ExtWindowSeconds } from "../types/eegRecorder";

export interface EEGChartV2Props {
  ch1: number[];
  ch2: number[];
  timestamps: number[]; // Unix ms
  mode: "demo" | "bluetooth" | "uart";
  windowSeconds: ExtWindowSeconds;
  paused: boolean;
  ch1Visible: boolean;
  ch2Visible: boolean;
  theme: "light" | "dark";
  onPauseToggle: () => void;
  onWindowChange: (seconds: ExtWindowSeconds) => void;
  onCh1Toggle?: () => void;
  onCh2Toggle?: () => void;
  onThemeToggle?: () => void;
}

type ChartTheme = EEGChartV2Props["theme"];

interface ChartDimensions {
  width: number;
  height: number;
}

interface VisibleRange {
  min: number;
  max: number;
}

const CH1_COLOR = "#06B6D4";
const CH2_COLOR = "#2563EB";

const THEME_COLORS: Record<ChartTheme, { background: string; grid: string; text: string }> = {
  light: { background: "#FFFFFF", grid: "#F1F5F9", text: "#6B7280" },
  dark: { background: "#1E293B", grid: "#334155", text: "#94A3B8" },
};

const EMPTY_DATA: uPlot.AlignedData = [new Float64Array(), [], []];

// Max points to render — keeps chart smooth even for long windows
const MAX_RENDER_POINTS = 600;

// Quick buttons visible without dropdown
const QUICK_WINDOWS: ExtWindowSeconds[] = [10, 30, 60];

// All options shown inside the "더 보기" dropdown
const MORE_WINDOWS: { value: ExtWindowSeconds; label: string }[] = [
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
  { value: 30, label: "30s" },
  { value: 60, label: "60s" },
  { value: 120, label: "2분" },
  { value: 300, label: "5분" },
];

const formatValue = (value: number | undefined) =>
  value === undefined ? "--" : value.toFixed(2);

const formatTime = (seconds: number) =>
  new Date(seconds * 1000).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const getPointCount = (ch1: number[], ch2: number[], timestamps: number[]) =>
  Math.min(ch1.length, ch2.length, timestamps.length);

// Peak-preserving min/max bucket downsampling — keeps spikes visible
const downsampleMinMax = (
  xs: Float64Array,
  y1: number[],
  y2: number[],
  maxPoints: number
): [Float64Array, number[], number[]] => {
  const n = xs.length;
  if (n <= maxPoints) return [xs, y1, y2];

  const buckets = Math.floor(maxPoints / 2);
  const bucketSize = n / buckets;
  const outX: number[] = [];
  const outY1: number[] = [];
  const outY2: number[] = [];

  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(Math.floor((b + 1) * bucketSize), n);
    if (start >= end) continue;

    let minY1 = y1[start];
    let maxY1 = y1[start];
    let minIdx = start;
    let maxIdx = start;

    for (let i = start + 1; i < end; i++) {
      if (y1[i] < minY1) { minY1 = y1[i]; minIdx = i; }
      if (y1[i] > maxY1) { maxY1 = y1[i]; maxIdx = i; }
    }

    if (minIdx <= maxIdx) {
      outX.push(xs[minIdx], xs[maxIdx]);
      outY1.push(y1[minIdx], y1[maxIdx]);
      outY2.push(y2[minIdx], y2[maxIdx]);
    } else {
      outX.push(xs[maxIdx], xs[minIdx]);
      outY1.push(y1[maxIdx], y1[minIdx]);
      outY2.push(y2[maxIdx], y2[minIdx]);
    }
  }

  return [new Float64Array(outX), outY1, outY2];
};

const buildWindowedData = (
  ch1: number[],
  ch2: number[],
  timestamps: number[],
  windowSeconds: ExtWindowSeconds
): uPlot.AlignedData => {
  const pointCount = getPointCount(ch1, ch2, timestamps);

  if (pointCount === 0) return EMPTY_DATA;

  const latestMs = timestamps[pointCount - 1];
  const earliestMs = latestMs - windowSeconds * 1000;
  let startIndex = 0;

  while (startIndex < pointCount - 1 && timestamps[startIndex] < earliestMs) {
    startIndex += 1;
  }

  const visibleCount = pointCount - startIndex;
  const xValues = new Float64Array(visibleCount);
  const y1Values = new Array<number>(visibleCount);
  const y2Values = new Array<number>(visibleCount);
  let lastSecond: number | null = null;

  for (let src = startIndex; src < pointCount; src++) {
    const tgt = src - startIndex;
    const rawSecond = timestamps[src] / 1000;
    const second: number =
      lastSecond === null || rawSecond > lastSecond ? rawSecond : lastSecond + 0.001;

    xValues[tgt] = second;
    y1Values[tgt] = ch1[src] ?? 0;
    y2Values[tgt] = ch2[src] ?? 0;
    lastSecond = second;
  }

  const [dsX, dsY1, dsY2] = downsampleMinMax(xValues, y1Values, y2Values, MAX_RENDER_POINTS);
  return [dsX, dsY1, dsY2];
};

const getLatestSecond = (data: uPlot.AlignedData) => {
  const xValues = data[0];
  if (xValues.length === 0) return null;
  return Number(xValues[xValues.length - 1]);
};

const makeOptions = (
  width: number,
  height: number,
  theme: ChartTheme,
  isUart: boolean,
  ch1Visible: boolean,
  ch2Visible: boolean,
  onScaleChange: (chart: uPlot) => void
): uPlot.Options => {
  const colors = THEME_COLORS[theme];
  const steppedFn = uPlot.paths.stepped;
  const linePath = isUart && steppedFn ? steppedFn({ align: 1 }) : undefined;

  return {
    width,
    height,
    padding: [12, 8, 0, 0],
    legend: { show: false },
    cursor: {
      show: true,
      x: true,
      y: true,
      sync: { key: "eeg-chart-v2" },
      drag: { x: true, y: false, setScale: true },
      points: { size: 7 },
    },
    scales: {
      x: { time: true },
      y: isUart ? { auto: false, range: [0, 255] } : { auto: true },
    },
    axes: [
      {
        scale: "x",
        stroke: colors.text,
        grid: { stroke: colors.grid, width: 1 },
        ticks: { show: false },
        border: { show: false },
        values: (_chart, splits) => splits.map(formatTime),
      },
      {
        scale: "y",
        side: 1,
        stroke: colors.text,
        grid: { stroke: colors.grid, width: 1 },
        ticks: { show: false },
        border: { show: false },
        values: (_chart, splits) =>
          splits.map((v) => (isUart ? `${Math.round(v)}` : v.toFixed(2))),
      },
    ],
    series: [
      {},
      {
        label: "CH1",
        scale: "y",
        show: ch1Visible,
        stroke: CH1_COLOR,
        width: 2,
        paths: linePath,
        points: { show: false },
        value: (_chart, v) => (isUart ? `${Math.round(v)}` : v.toFixed(2)),
      },
      {
        label: "CH2",
        scale: "y",
        show: ch2Visible,
        stroke: CH2_COLOR,
        width: 2,
        paths: linePath,
        points: { show: false },
        value: (_chart, v) => (isUart ? `${Math.round(v)}` : v.toFixed(2)),
      },
    ],
    hooks: {
      ready: [(chart) => { chart.root.style.background = colors.background; }],
      setScale: [
        (chart, scaleKey) => {
          if (scaleKey === "x") onScaleChange(chart);
        },
      ],
    },
  };
};

function EEGChartV2({
  ch1,
  ch2,
  timestamps,
  mode,
  windowSeconds,
  paused,
  ch1Visible,
  ch2Visible,
  theme,
  onPauseToggle,
  onWindowChange,
  onCh1Toggle,
  onCh2Toggle,
  onThemeToggle,
}: EEGChartV2Props) {
  const chartData = useMemo(
    () => buildWindowedData(ch1, ch2, timestamps, windowSeconds),
    [ch1, ch2, timestamps, windowSeconds]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const displayDataRef = useRef<uPlot.AlignedData>(chartData);
  const bufferedDataRef = useRef<uPlot.AlignedData | null>(null);
  const windowSecondsRef = useRef<ExtWindowSeconds>(windowSeconds);
  const latestLiveSecondRef = useRef<number | null>(getLatestSecond(chartData));
  const visibleRangeRef = useRef<VisibleRange | null>(null);
  const atLiveEdgeRef = useRef(true);
  const isProgrammaticScaleRef = useRef(false);

  const [dimensions, setDimensions] = useState<ChartDimensions | null>(null);
  const [showLiveButton, setShowLiveButton] = useState(false);
  const [showMoreWindows, setShowMoreWindows] = useState(false);
  const moreDropdownRef = useRef<HTMLDivElement | null>(null);

  const isUart = mode === "uart";
  const latestCh1 = ch1[ch1.length - 1];
  const latestCh2 = ch2[ch2.length - 1];
  const isExtendedWindow = windowSeconds === 120 || windowSeconds === 300;

  const secondaryButtonClass =
    theme === "dark"
      ? "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
      : "bg-[#EAF0F8] text-[#6B7280] hover:bg-[#111827] hover:text-white";

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showMoreWindows) return;
    const handler = (e: MouseEvent) => {
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(e.target as Node)) {
        setShowMoreWindows(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMoreWindows]);

  useEffect(() => {
    windowSecondsRef.current = windowSeconds;
  }, [windowSeconds]);

  const setVisibleRange = useCallback((chart: uPlot, min: number, max: number) => {
    visibleRangeRef.current = { min, max };
    isProgrammaticScaleRef.current = true;
    chart.setScale("x", { min, max });
    isProgrammaticScaleRef.current = false;
  }, []);

  const syncLiveEdgeState = useCallback((chart: uPlot) => {
    const xMin = chart.scales.x.min;
    const xMax = chart.scales.x.max;

    if (xMin !== undefined && xMax !== undefined) {
      visibleRangeRef.current = { min: xMin, max: xMax };
    }

    if (isProgrammaticScaleRef.current) return;

    const latestSecond = latestLiveSecondRef.current;

    if (latestSecond === null || xMax === undefined) {
      atLiveEdgeRef.current = true;
      setShowLiveButton(false);
      return;
    }

    const isAtLiveEdge = xMax >= latestSecond - 0.25;
    atLiveEdgeRef.current = isAtLiveEdge;
    setShowLiveButton(!isAtLiveEdge);
  }, []);

  const snapToLive = useCallback(
    (force = false) => {
      const chart = chartRef.current;
      const latestSecond = latestLiveSecondRef.current;

      if (!chart || latestSecond === null) return;
      if (!force && !atLiveEdgeRef.current) return;

      const min = Math.max(latestSecond - windowSecondsRef.current, 0);
      setVisibleRange(chart, min, latestSecond);
      atLiveEdgeRef.current = true;
      setShowLiveButton(false);
    },
    [setVisibleRange]
  );

  // Capture chart canvas as PNG
  const captureChart = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = container.querySelector("canvas");
    if (!canvas) return;

    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const filename = `EEG_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.png`;

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const nextWidth = Math.max(1, Math.floor(container.clientWidth));
      const nextHeight = Math.max(1, Math.floor(container.clientHeight));

      setDimensions((previous) => {
        if (previous?.width === nextWidth && previous.height === nextHeight) return previous;
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || dimensions === null) return;

    chartRef.current?.destroy();
    chartRef.current = null;

    const dataToRender = displayDataRef.current;
    const chart = new uPlot(
      makeOptions(dimensions.width, dimensions.height, theme, isUart, ch1Visible, ch2Visible, syncLiveEdgeState),
      dataToRender,
      container
    );

    chartRef.current = chart;
    latestLiveSecondRef.current = getLatestSecond(dataToRender);

    if (atLiveEdgeRef.current) {
      snapToLive(true);
    } else if (visibleRangeRef.current !== null) {
      setVisibleRange(chart, visibleRangeRef.current.min, visibleRangeRef.current.max);
      syncLiveEdgeState(chart);
    } else {
      syncLiveEdgeState(chart);
    }

    return () => {
      chart.destroy();
      if (chartRef.current === chart) chartRef.current = null;
    };
  }, [dimensions, theme, isUart, syncLiveEdgeState, snapToLive, setVisibleRange]);

  useEffect(() => {
    if (paused) {
      bufferedDataRef.current = chartData;
      return;
    }

    const nextData = bufferedDataRef.current ?? chartData;
    bufferedDataRef.current = null;
    displayDataRef.current = nextData;
    latestLiveSecondRef.current = getLatestSecond(nextData);

    const chart = chartRef.current;
    if (!chart) return;

    const previousXMin = chart.scales.x.min;
    const previousXMax = chart.scales.x.max;

    chart.setData(nextData, true);

    if (atLiveEdgeRef.current) {
      snapToLive(true);
    } else if (previousXMin !== undefined && previousXMax !== undefined) {
      setVisibleRange(chart, previousXMin, previousXMax);
      syncLiveEdgeState(chart);
    }
  }, [chartData, paused, snapToLive, syncLiveEdgeState, setVisibleRange]);

  useEffect(() => { chartRef.current?.setSeries(1, { show: ch1Visible }); }, [ch1Visible]);
  useEffect(() => { chartRef.current?.setSeries(2, { show: ch2Visible }); }, [ch2Visible]);
  useEffect(() => { snapToLive(true); }, [snapToLive, windowSeconds]);

  const handleWindowSelect = useCallback(
    (value: ExtWindowSeconds) => {
      onWindowChange(value);
      setShowMoreWindows(false);
    },
    [onWindowChange]
  );

  const windowLabel = (w: ExtWindowSeconds) => {
    if (w === 120) return "2분";
    if (w === 300) return "5분";
    return `${w}s`;
  };

  return (
    <section className="fx2-card fx2-outline w-full min-h-[280px] sm:min-h-[360px] lg:min-h-[480px]">
      <div className="mb-4 flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {/* Left: controls */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Window quick buttons + 더 보기 */}
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_WINDOWS.map((value) => {
                const isActive = windowSeconds === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleWindowSelect(value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                      isActive ? "bg-[#2563EB] text-white" : secondaryButtonClass
                    }`}
                  >
                    {value}s
                  </button>
                );
              })}

              {/* 더 보기 dropdown */}
              <div ref={moreDropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowMoreWindows((v) => !v)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                    isExtendedWindow ? "bg-[#2563EB] text-white" : secondaryButtonClass
                  }`}
                >
                  {isExtendedWindow ? windowLabel(windowSeconds) : "더 보기 ▾"}
                </button>

                {showMoreWindows ? (
                  <div
                    className={`absolute left-0 top-full z-20 mt-1 flex flex-col gap-1 rounded-xl p-2 shadow-lg ${
                      theme === "dark" ? "bg-slate-800 border border-slate-700" : "bg-white border border-[#E5E7EB]"
                    }`}
                  >
                    {MORE_WINDOWS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleWindowSelect(value)}
                        className={`rounded-lg px-4 py-1.5 text-xs font-semibold text-left transition-colors duration-150 ${
                          windowSeconds === value
                            ? "bg-[#2563EB] text-white"
                            : theme === "dark"
                            ? "text-slate-200 hover:bg-slate-700"
                            : "text-[#111827] hover:bg-[#EAF0F8]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Chart controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onPauseToggle}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${secondaryButtonClass}`}
              >
                {paused ? "재개" : "일시정지"}
              </button>

              <button
                type="button"
                onClick={onCh1Toggle}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                  ch1Visible
                    ? "bg-cyan-100 text-cyan-700"
                    : theme === "dark"
                    ? "bg-slate-800 text-slate-300 hover:bg-cyan-500/15 hover:text-cyan-300"
                    : "bg-[#EAF0F8] text-[#6B7280] hover:bg-cyan-100 hover:text-cyan-700"
                }`}
              >
                CH1
              </button>

              <button
                type="button"
                onClick={onCh2Toggle}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                  ch2Visible
                    ? "bg-blue-100 text-blue-700"
                    : theme === "dark"
                    ? "bg-slate-800 text-slate-300 hover:bg-blue-500/15 hover:text-blue-300"
                    : "bg-[#EAF0F8] text-[#6B7280] hover:bg-blue-100 hover:text-blue-700"
                }`}
              >
                CH2
              </button>

              <button
                type="button"
                onClick={onThemeToggle}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${secondaryButtonClass}`}
              >
                {theme === "dark" ? "라이트" : "다크"}
              </button>

              <button
                type="button"
                onClick={captureChart}
                title="차트 PNG 저장"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${secondaryButtonClass}`}
              >
                📷 차트 캡처
              </button>

              {isUart ? (
                <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  UART 0-255
                </span>
              ) : null}
            </div>
          </div>

          {/* Right: live values */}
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <span className="rounded-full bg-cyan-100 px-3 py-1.5 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
              CH1 {formatValue(latestCh1)}
            </span>
            <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              CH2 {formatValue(latestCh2)}
            </span>
          </div>
        </div>
      </div>

      <div className="relative h-[280px] min-h-[280px] w-full overflow-hidden rounded-2xl sm:h-[340px] md:h-[400px] lg:h-[480px]">
        {showLiveButton ? (
          <button
            type="button"
            onClick={() => snapToLive(true)}
            className="absolute right-3 top-3 z-10 rounded-full bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-opacity hover:opacity-90"
          >
            ▶ 라이브
          </button>
        ) : null}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </section>
  );
}

export default memo(EEGChartV2);
