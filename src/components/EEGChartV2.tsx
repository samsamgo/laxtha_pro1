import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { ExtWindowSeconds } from "../types/eegRecorder";

export interface EEGChartV2Props {
  ch1: number[];
  ch2: number[];
  timestamps: number[]; // Unix ms
  windowSeconds: ExtWindowSeconds;
  paused: boolean;
  ch1Visible: boolean;
  ch2Visible: boolean;
  theme: "light" | "dark";
  onPauseToggle: () => void;
  onWindowChange: (seconds: ExtWindowSeconds) => void;
  onCh1Toggle?: () => void;
  onCh2Toggle?: () => void;
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

type DisplayValue = number | null;

const CH1_COLOR = "#06B6D4";
const CH2_COLOR = "#2563EB";

const THEME_COLORS: Record<ChartTheme, { background: string; grid: string; text: string }> = {
  light: { background: "#FFFFFF", grid: "#F1F5F9", text: "#6B7280" },
  dark: { background: "#1E293B", grid: "#334155", text: "#94A3B8" },
};

const EMPTY_DATA: uPlot.AlignedData = [new Float64Array(), [], []];

const MIN_Y_RANGE_UV = 1600;
const Y_RANGE_PADDING = 0.2;
const DEFAULT_SAMPLE_INTERVAL_SECONDS = 1 / 60;
const MIN_SAMPLE_INTERVAL_SECONDS = 0.001;
const MAX_DUPLICATE_SAMPLE_INTERVAL_SECONDS = 1 / 30;
const LIVE_EDGE_TOLERANCE_SECONDS = 0.5;

// Quick buttons visible without dropdown
const QUICK_WINDOWS: ExtWindowSeconds[] = [30, 60, 300];

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

const clampSampleInterval = (seconds: number) =>
  Math.min(
    MAX_DUPLICATE_SAMPLE_INTERVAL_SECONDS,
    Math.max(MIN_SAMPLE_INTERVAL_SECONDS, seconds)
  );

const inferSampleIntervalSeconds = (
  timestamps: number[],
  startIndex: number,
  pointCount: number
) => {
  const candidates: number[] = [];
  const firstMs = timestamps[startIndex];
  const latestMs = timestamps[pointCount - 1];
  const renderedPointCount = pointCount - startIndex;

  if (
    renderedPointCount > 1 &&
    Number.isFinite(firstMs) &&
    Number.isFinite(latestMs) &&
    latestMs > firstMs
  ) {
    candidates.push((latestMs - firstMs) / 1000 / (renderedPointCount - 1));
  }

  const positiveDeltas: number[] = [];
  for (let i = startIndex + 1; i < pointCount; i++) {
    const deltaMs = timestamps[i] - timestamps[i - 1];
    if (Number.isFinite(deltaMs) && deltaMs > 0) {
      positiveDeltas.push(deltaMs / 1000);
    }
  }

  if (positiveDeltas.length > 0) {
    positiveDeltas.sort((a, b) => a - b);
    candidates.push(positiveDeltas[Math.floor(positiveDeltas.length / 2)]);
  }

  if (candidates.length === 0) {
    return DEFAULT_SAMPLE_INTERVAL_SECONDS;
  }

  return clampSampleInterval(Math.min(...candidates));
};

const getDisplayYTarget = (data: uPlot.AlignedData) => {
  const values: number[] = [];
  const collect = (series: uPlot.AlignedData[number]) => {
    const items = series as ArrayLike<number | null | undefined>;
    for (let i = 0; i < items.length; i++) {
      const value = items[i];
      if (typeof value === "number" && Number.isFinite(value)) {
        values.push(value);
      }
    }
  };

  collect(data[1]);
  collect(data[2]);

  if (values.length === 0) {
    return { min: -MIN_Y_RANGE_UV / 2, max: MIN_Y_RANGE_UV / 2 };
  }

  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  const span = Math.max(max - min, 1);
  min = Math.min(min - span * Y_RANGE_PADDING, -MIN_Y_RANGE_UV / 2);
  max = Math.max(max + span * Y_RANGE_PADDING, MIN_Y_RANGE_UV / 2);
  return { min, max };
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

  // Binary search for first timestamp >= earliestMs
  let lo = 0;
  let hi = pointCount - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timestamps[mid] < earliestMs) lo = mid + 1;
    else hi = mid;
  }
  const startIndex = lo;

  const renderPointCount = pointCount - startIndex;
  const xArr = new Float64Array(renderPointCount);
  const y1Arr: DisplayValue[] = [];
  const y2Arr: DisplayValue[] = [];
  const sampleIntervalSeconds = inferSampleIntervalSeconds(timestamps, startIndex, pointCount);
  let nextAllowedSecond = Number.POSITIVE_INFINITY;

  for (let src = pointCount - 1, dest = renderPointCount - 1; src >= startIndex; src--, dest--) {
    const rawSecond = timestamps[src] / 1000;
    let second = Number.isFinite(rawSecond) ? rawSecond : nextAllowedSecond - sampleIntervalSeconds;

    if (second >= nextAllowedSecond) {
      second = nextAllowedSecond - sampleIntervalSeconds;
    }

    xArr[dest] = second;
    nextAllowedSecond = second;
  }

  for (let src = startIndex; src < pointCount; src++) {
    const v1 = ch1[src];
    const v2 = ch2[src];
    y1Arr.push(v1 !== undefined && Number.isFinite(v1) ? v1 : null);
    y2Arr.push(v2 !== undefined && Number.isFinite(v2) ? v2 : null);
  }

  return [xArr, y1Arr, y2Arr];
};

const getLatestSecond = (data: uPlot.AlignedData) => {
  const xValues = data[0];
  if (xValues.length === 0) return null;
  return Number(xValues[xValues.length - 1]);
};

const RAW_LINEAR_PATH = uPlot.paths.linear?.({ alignGaps: 0 });

const makeOptions = (
  width: number,
  height: number,
  theme: ChartTheme,
  ch1Visible: boolean,
  ch2Visible: boolean,
  onScaleChange: (chart: uPlot) => void,
): uPlot.Options => {
  const colors = THEME_COLORS[theme];

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
      y: { auto: false },
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
        label: "μV",
        labelFont: `bold 10px ${["-apple-system", "sans-serif"].join(",")}`,
        labelSize: 16,
        stroke: colors.text,
        grid: { stroke: colors.grid, width: 1 },
        ticks: { show: false },
        border: { show: false },
        values: (_chart, splits) => splits.map((v) => v.toFixed(2)),
      },
    ],
    series: [
      {},
      {
        label: "CH1",
        scale: "y",
        show: ch1Visible,
        stroke: CH1_COLOR,
        width: 1,
        pxAlign: false,
        paths: RAW_LINEAR_PATH,
        points: { show: false },
        value: (_chart, v) => (v == null ? "--" : v.toFixed(2)),
      },
      {
        label: "CH2",
        scale: "y",
        show: ch2Visible,
        stroke: CH2_COLOR,
        width: 1,
        pxAlign: false,
        paths: RAW_LINEAR_PATH,
        points: { show: false },
        value: (_chart, v) => (v == null ? "--" : v.toFixed(2)),
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
  windowSeconds,
  paused,
  ch1Visible,
  ch2Visible,
  theme,
  onPauseToggle,
  onWindowChange,
  onCh1Toggle,
  onCh2Toggle,
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
  // Custom zoom level overrides windowSeconds while scrolling; null = use windowSeconds
  const zoomedWindowRef = useRef<number | null>(null);
  const latestLiveSecondRef = useRef<number | null>(getLatestSecond(chartData));
  const visibleRangeRef = useRef<VisibleRange | null>(null);
  const atLiveEdgeRef = useRef(true);
  const isProgrammaticScaleRef = useRef(false);
  const [dimensions, setDimensions] = useState<ChartDimensions | null>(null);
  const [showLiveButton, setShowLiveButton] = useState(false);
  const [showMoreWindows, setShowMoreWindows] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [showZoomReset, setShowZoomReset] = useState(false);
  const moreDropdownRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

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

    const isAtLiveEdge = xMax >= latestSecond - LIVE_EDGE_TOLERANCE_SECONDS;
    atLiveEdgeRef.current = isAtLiveEdge;
    setShowLiveButton(!isAtLiveEdge);
  }, []);

  const snapToLive = useCallback(
    (force = false) => {
      const chart = chartRef.current;
      const latestSecond = latestLiveSecondRef.current;

      if (!chart || latestSecond === null) return;
      if (!force && !atLiveEdgeRef.current) return;

      // Use zoomed window width if user has scroll-zoomed; fall back to selected windowSeconds
      const ws = zoomedWindowRef.current ?? windowSecondsRef.current;
      const min = Math.max(latestSecond - ws, 0);
      setVisibleRange(chart, min, latestSecond);
      atLiveEdgeRef.current = true;
      setShowLiveButton(false);
      // Keep showZoomReset if a custom zoom is active
      setShowZoomReset(zoomedWindowRef.current !== null);
    },
    [setVisibleRange]
  );

  const resetZoom = useCallback(() => {
    zoomedWindowRef.current = null;
    setShowZoomReset(false);
    snapToLive(true);
  }, [snapToLive]);

  // Keyboard shortcuts: Space = pause/resume, L = go live
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        onPauseToggle();
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        snapToLive(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onPauseToggle, snapToLive]);

  // Cleanup: stop recording on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Wheel scroll zoom: adjusts the displayed time window width while keeping live-follow active.
  // This avoids the "chart freezes" issue where losing live-edge stops data from updating.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const chart = chartRef.current;
      if (!chart) return;

      const xMin = chart.scales.x.min;
      const xMax = chart.scales.x.max;
      if (xMin === undefined || xMax === undefined) return;

      const currentRange = xMax - xMin; // seconds currently visible
      const zoomFactor = e.deltaY > 0 ? 1.25 : 0.8;
      const newRange = Math.max(2, Math.min(currentRange * zoomFactor, 7200)); // clamp 2s–2h

      // Store the new window width and snap to live with it — live-follow stays active
      zoomedWindowRef.current = newRange;
      setShowZoomReset(true);

      // Apply immediately without waiting for the next data tick
      const latestSecond = latestLiveSecondRef.current;
      if (latestSecond !== null && chart) {
        const newMin = Math.max(latestSecond - newRange, 0);
        isProgrammaticScaleRef.current = true;
        chart.setScale("x", { min: newMin, max: latestSecond });
        isProgrammaticScaleRef.current = false;
        visibleRangeRef.current = { min: newMin, max: latestSecond };
        atLiveEdgeRef.current = true;
        setShowLiveButton(false);
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  // Touch pinch zoom: two-finger pinch adjusts the visible time window
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let initialDistance: number | null = null;
    let initialRange: number | null = null;

    const getDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      initialDistance = getDistance(e.touches);
      const chart = chartRef.current;
      if (!chart) return;
      const xMin = chart.scales.x.min;
      const xMax = chart.scales.x.max;
      if (xMin === undefined || xMax === undefined) return;
      initialRange = xMax - xMin;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initialDistance === null || initialRange === null) return;
      e.preventDefault();
      const currentDistance = getDistance(e.touches);
      if (currentDistance === 0) return;
      const newRange = Math.max(2, Math.min(initialRange * (initialDistance / currentDistance), 7200));
      zoomedWindowRef.current = newRange;
      setShowZoomReset(true);
      const latestSecond = latestLiveSecondRef.current;
      const chart = chartRef.current;
      if (latestSecond !== null && chart) {
        const newMin = Math.max(latestSecond - newRange, 0);
        isProgrammaticScaleRef.current = true;
        chart.setScale("x", { min: newMin, max: latestSecond });
        isProgrammaticScaleRef.current = false;
        visibleRangeRef.current = { min: newMin, max: latestSecond };
        atLiveEdgeRef.current = true;
        setShowLiveButton(false);
      }
    };

    const handleTouchEnd = () => {
      initialDistance = null;
      initialRange = null;
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  const toggleVideoRecording = useCallback(() => {
    if (isRecordingVideo) {
      mediaRecorderRef.current?.stop();
      return;
    }

    const container = containerRef.current;
    if (!container) return;
    const canvas = container.querySelector("canvas");
    if (!canvas) return;

    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "";

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recordedChunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      recordedChunksRef.current = [];

      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const filename = `EEG_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.webm`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setIsRecordingVideo(false);
    };

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    setIsRecordingVideo(true);
  }, [isRecordingVideo]);

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
      makeOptions(
        dimensions.width,
        dimensions.height,
        theme,
        ch1Visible,
        ch2Visible,
        syncLiveEdgeState,
      ),
      dataToRender,
      container
    );

    chartRef.current = chart;
    latestLiveSecondRef.current = getLatestSecond(dataToRender);
    chart.setScale("y", getDisplayYTarget(dataToRender));

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
  }, [dimensions, theme, syncLiveEdgeState, snapToLive, setVisibleRange]);

  useEffect(() => {
    if (paused) {
      bufferedDataRef.current = chartData;
      return;
    }

    const bufferedData = bufferedDataRef.current;
    const bufferedLatestSecond = bufferedData ? getLatestSecond(bufferedData) : null;
    const chartLatestSecond = getLatestSecond(chartData);
    const nextData =
      bufferedData !== null &&
      bufferedLatestSecond !== null &&
      (chartLatestSecond === null || bufferedLatestSecond >= chartLatestSecond)
        ? bufferedData
        : chartData;
    bufferedDataRef.current = null;
    displayDataRef.current = nextData;
    latestLiveSecondRef.current = getLatestSecond(nextData);

    const chart = chartRef.current;
    if (!chart) return;

    const previousXMin = chart.scales.x.min;
    const previousXMax = chart.scales.x.max;
    const wasAtLiveEdge = atLiveEdgeRef.current;

    chart.setData(nextData, false);

    chart.setScale("y", getDisplayYTarget(nextData));

    if (wasAtLiveEdge) {
      snapToLive(true);
    } else if (previousXMin !== undefined && previousXMax !== undefined) {
      setVisibleRange(chart, previousXMin, previousXMax);
      syncLiveEdgeState(chart);
    } else {
      syncLiveEdgeState(chart);
    }
  }, [chartData, paused, snapToLive, syncLiveEdgeState, setVisibleRange]);

  useEffect(() => { chartRef.current?.setSeries(1, { show: ch1Visible }); }, [ch1Visible]);
  useEffect(() => { chartRef.current?.setSeries(2, { show: ch2Visible }); }, [ch2Visible]);
  useEffect(() => {
    // User selected a new time window — clear any scroll-zoom override
    zoomedWindowRef.current = null;
    setShowZoomReset(false);
    snapToLive(true);
  }, [snapToLive, windowSeconds]);

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

              {showZoomReset ? (
                <button
                  type="button"
                  onClick={resetZoom}
                  title="줌 초기화 — 선택한 시간창으로 복귀"
                  className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors duration-200 hover:bg-amber-500 hover:text-white dark:bg-amber-500/15 dark:text-amber-300"
                >
                  줌 초기화
                </button>
              ) : null}

              <button
                type="button"
                onClick={captureChart}
                title="차트 PNG 저장"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${secondaryButtonClass}`}
              >
                📷 차트 캡처
              </button>

              <button
                type="button"
                onClick={toggleVideoRecording}
                title={isRecordingVideo ? "녹화 중지 및 저장" : "동영상 녹화 시작"}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                  isRecordingVideo
                    ? "animate-pulse bg-red-500 text-white"
                    : secondaryButtonClass
                }`}
              >
                {isRecordingVideo ? "⏹ 녹화 중지" : "⏺ 동영상 녹화"}
              </button>

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
        {paused ? (
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-slate-900/75 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            일시정지 · Space 재개
          </div>
        ) : null}
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
