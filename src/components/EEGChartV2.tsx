import { memo, useEffect, useRef, useState } from "react";
import {
  type ChartOptions,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineType,
  PriceScaleMode,
  createChart,
  type DeepPartial,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

type WindowSeconds = 10 | 30 | 60;
type ChartTheme = "light" | "dark";

export interface EEGChartV2Props {
  ch1: number[];
  ch2: number[];
  timestamps: number[];
  mode: "demo" | "bluetooth" | "uart";
  windowSeconds: WindowSeconds;
  paused: boolean;
  ch1Visible: boolean;
  ch2Visible: boolean;
  theme: ChartTheme;
  onPauseToggle: () => void;
  onWindowChange: (seconds: WindowSeconds) => void;
  onCh1Toggle?: () => void;
  onCh2Toggle?: () => void;
  onThemeToggle?: () => void;
}

interface PendingPair {
  ch1: LineData<Time>;
  ch2: LineData<Time>;
}

const THEME_OPTIONS: Record<ChartTheme, DeepPartial<ChartOptions>> = {
  light: {
    layout: {
      background: { type: ColorType.Solid, color: "#FFFFFF" },
      textColor: "#6B7280",
    },
    grid: {
      vertLines: { color: "#F1F5F9" },
      horzLines: { color: "#F1F5F9" },
    },
  },
  dark: {
    layout: {
      background: { type: ColorType.Solid, color: "#1E293B" },
      textColor: "#94A3B8",
    },
    grid: {
      vertLines: { color: "#334155" },
      horzLines: { color: "#334155" },
    },
  },
};

const uartAutoscaleInfoProvider = () => ({
  priceRange: {
    minValue: 0,
    maxValue: 255,
  },
});

const formatValue = (value: number | undefined) =>
  value === undefined ? "—" : value.toFixed(2);

const formatChartTime = (time: Time) => {
  if (typeof time === "number") {
    return new Date(time * 1000).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return String(time);
};

const buildPointPairs = (
  ch1: number[],
  ch2: number[],
  timestamps: number[],
  startIndex: number,
  previousRenderedTime: number | null
) => {
  const pointCount = Math.min(ch1.length, ch2.length, timestamps.length);
  const nextPairs: PendingPair[] = [];
  let nextRenderedTime = previousRenderedTime;

  for (let index = startIndex; index < pointCount; index += 1) {
    const incomingTime = timestamps[index] / 1000;
    const normalizedTime =
      nextRenderedTime === null || incomingTime > nextRenderedTime
        ? incomingTime
        : nextRenderedTime + 0.001;

    const pointTime = normalizedTime as UTCTimestamp;

    nextPairs.push({
      ch1: { time: pointTime, value: ch1[index] ?? 0 },
      ch2: { time: pointTime, value: ch2[index] ?? 0 },
    });

    nextRenderedTime = normalizedTime;
  }

  return {
    nextPairs,
    nextRenderedTime,
    pointCount,
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const ch1SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ch2SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastRenderedTimeRef = useRef<number | null>(null);
  const lastProcessedCountRef = useRef(0);
  const lastInputTimestampRef = useRef<number | null>(null);
  const pendingPairsRef = useRef<PendingPair[]>([]);
  const atLiveEdgeRef = useRef(true);
  const [showLiveButton, setShowLiveButton] = useState(false);

  const isUart = mode === "uart";
  const latestCh1 = ch1[ch1.length - 1];
  const latestCh2 = ch2[ch2.length - 1];

  const syncLiveEdgeState = () => {
    const chart = chartRef.current;

    if (!chart) {
      return;
    }

    const distanceFromLive = Math.abs(chart.timeScale().scrollPosition());
    const isAtLiveEdge = distanceFromLive < 0.5;

    atLiveEdgeRef.current = isAtLiveEdge;
    setShowLiveButton(!isAtLiveEdge);
  };

  const snapToLive = (force = false) => {
    const chart = chartRef.current;
    const latestRenderedTime = lastRenderedTimeRef.current;

    if (!chart || latestRenderedTime === null) {
      return;
    }

    if (!force && !atLiveEdgeRef.current) {
      return;
    }

    const startTime = Math.max(latestRenderedTime - windowSeconds, 0) as UTCTimestamp;

    chart.timeScale().setVisibleRange({
      from: startTime,
      to: latestRenderedTime as UTCTimestamp,
    });
    chart.timeScale().scrollToRealTime();

    atLiveEdgeRef.current = true;
    setShowLiveButton(false);
  };

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#FFFFFF" },
        textColor: "#6B7280",
      },
      grid: {
        vertLines: { color: "#F1F5F9" },
        horzLines: { color: "#F1F5F9" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      leftPriceScale: {
        visible: false,
      },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.12 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,
      },
      localization: {
        timeFormatter: formatChartTime,
      },
    });

    const sharedSeriesOptions = {
      lineWidth: 2 as const,
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
      priceScaleId: "right" as const,
    };

    const ch1Series = chart.addSeries(LineSeries, {
      ...sharedSeriesOptions,
      color: "#06B6D4",
    });
    const ch2Series = chart.addSeries(LineSeries, {
      ...sharedSeriesOptions,
      color: "#2563EB",
    });

    chartRef.current = chart;
    ch1SeriesRef.current = ch1Series;
    ch2SeriesRef.current = ch2Series;

    const handleVisibleRangeChange = () => {
      syncLiveEdgeState();
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });

    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    return () => {
      resizeObserver.disconnect();
      resizeObserverRef.current = null;
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      chart.remove();
      chartRef.current = null;
      ch1SeriesRef.current = null;
      ch2SeriesRef.current = null;
      lastRenderedTimeRef.current = null;
      lastProcessedCountRef.current = 0;
      lastInputTimestampRef.current = null;
      pendingPairsRef.current = [];
      atLiveEdgeRef.current = true;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.applyOptions(THEME_OPTIONS[theme]);
  }, [theme]);

  useEffect(() => {
    const ch1Series = ch1SeriesRef.current;
    const ch2Series = ch2SeriesRef.current;

    if (!ch1Series || !ch2Series) {
      return;
    }

    if (isUart) {
      chartRef.current?.priceScale("right").applyOptions({
        autoScale: true,
        mode: PriceScaleMode.Normal,
      });
      ch1Series.applyOptions({
        lineType: LineType.WithSteps,
        priceFormat: { type: "price", precision: 0, minMove: 1 },
        autoscaleInfoProvider: uartAutoscaleInfoProvider,
      });
      ch2Series.applyOptions({
        lineType: LineType.WithSteps,
        priceFormat: { type: "price", precision: 0, minMove: 1 },
        autoscaleInfoProvider: uartAutoscaleInfoProvider,
      });
      return;
    }

    ch1Series.applyOptions({
      lineType: LineType.Simple,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      autoscaleInfoProvider: undefined,
    });
    ch2Series.applyOptions({
      lineType: LineType.Simple,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      autoscaleInfoProvider: undefined,
    });
  }, [isUart]);

  useEffect(() => {
    ch1SeriesRef.current?.applyOptions({ visible: ch1Visible });
  }, [ch1Visible]);

  useEffect(() => {
    ch2SeriesRef.current?.applyOptions({ visible: ch2Visible });
  }, [ch2Visible]);

  useEffect(() => {
    snapToLive(true);
  }, [windowSeconds]);

  useEffect(() => {
    if (paused) {
      return;
    }

    const ch1Series = ch1SeriesRef.current;
    const ch2Series = ch2SeriesRef.current;

    if (!ch1Series || !ch2Series || pendingPairsRef.current.length === 0) {
      if (atLiveEdgeRef.current) {
        snapToLive(true);
      }
      return;
    }

    pendingPairsRef.current.forEach((pair) => {
      ch1Series.update(pair.ch1);
      ch2Series.update(pair.ch2);
    });

    pendingPairsRef.current = [];

    if (atLiveEdgeRef.current) {
      snapToLive(true);
    }
  }, [paused, windowSeconds]);

  useEffect(() => {
    const ch1Series = ch1SeriesRef.current;
    const ch2Series = ch2SeriesRef.current;

    if (!ch1Series || !ch2Series) {
      return;
    }

    const pointCount = Math.min(ch1.length, ch2.length, timestamps.length);

    if (pointCount === 0) {
      ch1Series.setData([]);
      ch2Series.setData([]);
      pendingPairsRef.current = [];
      lastRenderedTimeRef.current = null;
      lastProcessedCountRef.current = 0;
      lastInputTimestampRef.current = null;
      return;
    }

    const latestInputTimestamp = timestamps[pointCount - 1];
    const needsFullReset =
      lastProcessedCountRef.current === 0 ||
      pointCount < lastProcessedCountRef.current ||
      (lastInputTimestampRef.current !== null &&
        latestInputTimestamp < lastInputTimestampRef.current);

    const startIndex = needsFullReset ? 0 : lastProcessedCountRef.current;
    const { nextPairs, nextRenderedTime } = buildPointPairs(
      ch1,
      ch2,
      timestamps,
      startIndex,
      needsFullReset ? null : lastRenderedTimeRef.current
    );

    if (needsFullReset) {
      ch1Series.setData(nextPairs.map((pair) => pair.ch1));
      ch2Series.setData(nextPairs.map((pair) => pair.ch2));
      pendingPairsRef.current = [];
    } else if (paused) {
      pendingPairsRef.current.push(...nextPairs);
    } else {
      nextPairs.forEach((pair) => {
        ch1Series.update(pair.ch1);
        ch2Series.update(pair.ch2);
      });
    }

    lastRenderedTimeRef.current = nextRenderedTime;
    lastProcessedCountRef.current = pointCount;
    lastInputTimestampRef.current = latestInputTimestamp;

    if (!paused && atLiveEdgeRef.current) {
      snapToLive(true);
    }
  }, [ch1, ch2, paused, timestamps, windowSeconds]);

  return (
    <section className="fx2-card w-full min-h-[400px]">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
                    : "bg-[#EAF0F8] text-[#6B7280] hover:bg-[#2563EB] hover:text-white"
                }`}
              >
                {value}s
              </button>
            );
          })}

          <button
            type="button"
            onClick={onPauseToggle}
            className="rounded-full bg-[#EAF0F8] px-3 py-1.5 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white"
          >
            {paused ? "▶ 재개" : "⏸ 일시정지"}
          </button>

          <button
            type="button"
            onClick={onCh1Toggle}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
              ch1Visible
                ? "bg-cyan-100 text-cyan-700"
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
                : "bg-[#EAF0F8] text-[#6B7280] hover:bg-blue-100 hover:text-blue-700"
            }`}
          >
            CH2
          </button>

          <button
            type="button"
            onClick={onThemeToggle}
            className="rounded-full bg-[#EAF0F8] px-3 py-1.5 text-xs font-semibold text-[#6B7280] transition-colors duration-200 hover:bg-[#111827] hover:text-white"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          {isUart ? (
            <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700">
              바이너리 모드 · 0–255
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className="rounded-full bg-cyan-100 px-3 py-1.5 text-xs font-semibold text-cyan-700">
            CH1 {formatValue(latestCh1)}
          </span>
          <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700">
            CH2 {formatValue(latestCh2)}
          </span>
        </div>
      </div>

      <div className="relative h-[340px] min-h-[340px] w-full overflow-hidden rounded-2xl md:h-[400px]">
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
