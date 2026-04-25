import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

export interface EEGChartV2Props {
  ch1: number[];
  ch2: number[];
  timestamps: number[]; // Unix ms
  mode: "demo" | "bluetooth" | "uart";
  windowSeconds: 10 | 30 | 60;
  paused: boolean;
  ch1Visible: boolean;
  ch2Visible: boolean;
  theme: "light" | "dark";
  onPauseToggle: () => void;
  onWindowChange: (seconds: 10 | 30 | 60) => void;
  onCh1Toggle?: () => void;
  onCh2Toggle?: () => void;
  onThemeToggle?: () => void;
}

type WindowSeconds = EEGChartV2Props["windowSeconds"];
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

const THEME_COLORS: Record<
  ChartTheme,
  { background: string; grid: string; text: string }
> = {
  light: {
    background: "#FFFFFF",
    grid: "#F1F5F9",
    text: "#6B7280",
  },
  dark: {
    background: "#1E293B",
    grid: "#334155",
    text: "#94A3B8",
  },
};

const EMPTY_DATA: uPlot.AlignedData = [new Float64Array(), [], []];

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

const buildWindowedData = (
  ch1: number[],
  ch2: number[],
  timestamps: number[],
  windowSeconds: WindowSeconds
): uPlot.AlignedData => {
  const pointCount = getPointCount(ch1, ch2, timestamps);

  if (pointCount === 0) {
    return EMPTY_DATA;
  }

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

  for (let sourceIndex = startIndex; sourceIndex < pointCount; sourceIndex += 1) {
    const targetIndex = sourceIndex - startIndex;
    const rawSecond = timestamps[sourceIndex] / 1000;
    const second: number =
      lastSecond === null || rawSecond > lastSecond
        ? rawSecond
        : lastSecond + 0.001;

    xValues[targetIndex] = second;
    y1Values[targetIndex] = ch1[sourceIndex] ?? 0;
    y2Values[targetIndex] = ch2[sourceIndex] ?? 0;
    lastSecond = second;
  }

  return [xValues, y1Values, y2Values];
};

const getLatestSecond = (data: uPlot.AlignedData) => {
  const xValues = data[0];

  if (xValues.length === 0) {
    return null;
  }

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
    legend: {
      show: false,
    },
    cursor: {
      show: true,
      x: true,
      y: true,
      sync: {
        key: "eeg-chart-v2",
      },
      drag: {
        x: true,
        y: false,
        setScale: true,
      },
      points: {
        size: 7,
      },
    },
    scales: {
      x: {
        time: true,
      },
      y: isUart
        ? {
            auto: false,
            range: [0, 255],
          }
        : {
            auto: true,
          },
    },
    axes: [
      {
        scale: "x",
        stroke: colors.text,
        grid: {
          stroke: colors.grid,
          width: 1,
        },
        ticks: {
          show: false,
        },
        border: {
          show: false,
        },
        values: (_chart, splits) => splits.map(formatTime),
      },
      {
        scale: "y",
        side: 1,
        stroke: colors.text,
        grid: {
          stroke: colors.grid,
          width: 1,
        },
        ticks: {
          show: false,
        },
        border: {
          show: false,
        },
        values: (_chart, splits) =>
          splits.map((value) => (isUart ? `${Math.round(value)}` : value.toFixed(2))),
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
        points: {
          show: false,
        },
        value: (_chart, value) =>
          isUart ? `${Math.round(value)}` : value.toFixed(2),
      },
      {
        label: "CH2",
        scale: "y",
        show: ch2Visible,
        stroke: CH2_COLOR,
        width: 2,
        paths: linePath,
        points: {
          show: false,
        },
        value: (_chart, value) =>
          isUart ? `${Math.round(value)}` : value.toFixed(2),
      },
    ],
    hooks: {
      ready: [
        (chart) => {
          chart.root.style.background = colors.background;
        },
      ],
      setScale: [
        (chart, scaleKey) => {
          if (scaleKey === "x") {
            onScaleChange(chart);
          }
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
  const windowSecondsRef = useRef<WindowSeconds>(windowSeconds);
  const latestLiveSecondRef = useRef<number | null>(getLatestSecond(chartData));
  const visibleRangeRef = useRef<VisibleRange | null>(null);
  const atLiveEdgeRef = useRef(true);
  const isProgrammaticScaleRef = useRef(false);
  const [dimensions, setDimensions] = useState<ChartDimensions | null>(null);
  const [showLiveButton, setShowLiveButton] = useState(false);

  const isUart = mode === "uart";
  const latestCh1 = ch1[ch1.length - 1];
  const latestCh2 = ch2[ch2.length - 1];
  const secondaryButtonClass =
    theme === "dark"
      ? "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
      : "bg-[#EAF0F8] text-[#6B7280] hover:bg-[#111827] hover:text-white";

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

    if (isProgrammaticScaleRef.current) {
      return;
    }

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

      if (!chart || latestSecond === null) {
        return;
      }

      if (!force && !atLiveEdgeRef.current) {
        return;
      }

      const min = Math.max(latestSecond - windowSecondsRef.current, 0);

      setVisibleRange(chart, min, latestSecond);
      atLiveEdgeRef.current = true;
      setShowLiveButton(false);
    },
    [setVisibleRange]
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const updateDimensions = () => {
      const nextWidth = Math.max(1, Math.floor(container.clientWidth));
      const nextHeight = Math.max(1, Math.floor(container.clientHeight));

      setDimensions((previous) => {
        if (
          previous?.width === nextWidth &&
          previous.height === nextHeight
        ) {
          return previous;
        }

        return { width: nextWidth, height: nextHeight };
      });
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || dimensions === null) {
      return;
    }

    chartRef.current?.destroy();
    chartRef.current = null;

    const dataToRender = displayDataRef.current;
    const chart = new uPlot(
      makeOptions(
        dimensions.width,
        dimensions.height,
        theme,
        isUart,
        ch1Visible,
        ch2Visible,
        syncLiveEdgeState
      ),
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

      if (chartRef.current === chart) {
        chartRef.current = null;
      }
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

    if (!chart) {
      return;
    }

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

  useEffect(() => {
    chartRef.current?.setSeries(1, { show: ch1Visible });
  }, [ch1Visible]);

  useEffect(() => {
    chartRef.current?.setSeries(2, { show: ch2Visible });
  }, [ch2Visible]);

  useEffect(() => {
    snapToLive(true);
  }, [snapToLive, windowSeconds]);

  return (
    <section className="fx2-card fx2-outline w-full min-h-[280px] sm:min-h-[360px] lg:min-h-[480px]">
      <div className="mb-4 flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              {[10, 30, 60].map((seconds) => {
                const value = seconds as WindowSeconds;
                const isActive = windowSeconds === value;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onWindowChange(value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                      isActive
                        ? "bg-[#2563EB] text-white"
                        : ` ${secondaryButtonClass}`
                    }`}
                  >
                    {value}s
                  </button>
                );
              })}
            </div>

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

              {isUart ? (
                <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  UART 모드 0-255
                </span>
              ) : null}
            </div>
          </div>

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
