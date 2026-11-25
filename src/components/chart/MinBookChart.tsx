"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  ISeriesMarkersPluginApi,
  Time,
  UTCTimestamp,
  CandlestickData,
  LineData,
  SeriesMarker
} from "lightweight-charts";
import {
  VerticalTimeHighlightPrimitive,
  HorizontalRetraceZonePrimitive,
  UserDrawingsPrimitive,
  ChartDrawing,
  ChartDrawingColor,
  DRAWING_COLOR_PALETTE,
  RectDrawing,
  DrawingDragMode,
  DrawingScreenBox,
  timeSecToLogicalIndex,
  timeSecToChartX,
  chartXToTimeSec,
  hitTestScreenBoxes,
  applyDrawingDragLogical
} from "./primitives";
import { OpenBriefData, KeyLevel, OHLCVBar } from "../../types/market";
import { useTimezone } from "../../context/TimezoneContext";
import { SupportedTimezone } from "../../lib/market/timezone";
import {
  Activity,
  Layers,
  Clock,
  Eye,
  EyeOff,
  Crosshair,
  TrendingUp,
  TrendingDown,
  X,
  RefreshCw,
  ExternalLink,
  Minus,
  Plus,
  Minimize2,
  Maximize2,
  MousePointer,
  Square,
  Type as TypeIcon,
  Undo2,
  Trash2
} from "lucide-react";

export interface MinBookChartProps {
  brief: OpenBriefData;
  selectedInstrument: "NQ" | "MNQ";
  focusedLevel?: KeyLevel | null;
  onClearFocusedLevel?: () => void;
  onSelectLevel?: (level: KeyLevel) => void;
  replayCutoffMs?: number | null;
  replayLabel?: string;
  fullIntradayBars?: OHLCVBar[];
  showReplayOutcome?: boolean;
  onToggleReplayOutcome?: () => void;
}

export type OpenPulseChartProps = MinBookChartProps;

interface OHLCState {
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePercent: number;
  timeStr: string;
}

interface ActiveLayers {
  liquidity: boolean;
  retrace: boolean;
  vwap: boolean;
  zones: boolean;
  subSessions: boolean;
  volatility: boolean;
  gex: boolean;
  footprint: boolean;
  smt: boolean;
}

// ---------------------------------------------------------------------------
// Timestamp & Sanitization Helpers
// ---------------------------------------------------------------------------
export function formatETTime(time: Time | number, withSeconds: boolean = false): string {
  const tsSec = typeof time === "number" ? time : typeof time === "string" ? new Date(time).getTime() / 1000 : 0;
  const d = new Date(tsSec * 1000);
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {})
  });
}

export function formatETDateTime(
  time: Time | number,
  tz: SupportedTimezone = "America/New_York",
  code: string = "ET"
): string {
  const tsSec = typeof time === "number" ? time : typeof time === "string" ? new Date(time).getTime() / 1000 : 0;
  const d = new Date(tsSec * 1000);
  const dateStr = d.toLocaleDateString("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric"
  });
  const timeStr = d.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${dateStr} ${timeStr} ${code}`;
}

export function sanitizeCandleBars(bars: OHLCVBar[]): CandlestickData<Time>[] {
  const map = new Map<number, CandlestickData<Time>>();
  for (const b of bars) {
    const timeSec = Math.floor(new Date(b.timestamp).getTime() / 1000);
    if (!isNaN(timeSec) && !isNaN(b.open) && !isNaN(b.high) && !isNaN(b.low) && !isNaN(b.close)) {
      map.set(timeSec, {
        time: timeSec as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.time as number) - (b.time as number));
}

export function computeCumulativeVWAP(
  bars: OHLCVBar[],
  isTwap: boolean
): LineData<Time>[] {
  if (bars.length === 0) return [];

  // Sort ascending by time
  const sorted = [...bars].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const pointsMap = new Map<number, number>();
  let sumPV = 0;
  let sumV = 0;
  let sumPrice = 0;
  let count = 0;
  let lastSessionKey = "";

  for (const b of sorted) {
    const dt = new Date(b.timestamp);
    const timeSec = Math.floor(dt.getTime() / 1000);
    if (isNaN(timeSec)) continue;

    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      hour12: false
    }).formatToParts(dt);

    const year = parts.find((p) => p.type === "year")?.value || "";
    const month = parts.find((p) => p.type === "month")?.value || "";
    const day = parts.find((p) => p.type === "day")?.value || "";
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

    // Session determination: Globex session begins 18:00 ET; RTH begins 09:30 ET
    let sessionKey: string;
    if (hour >= 18) {
      sessionKey = `${year}-${month}-${day}_globex`;
    } else if (hour < 9 || (hour === 9 && minute < 30)) {
      sessionKey = `${year}-${month}-${day}_overnight`;
    } else {
      sessionKey = `${year}-${month}-${day}_rth`;
    }

    if (sessionKey !== lastSessionKey) {
      sumPV = 0;
      sumV = 0;
      sumPrice = 0;
      count = 0;
      lastSessionKey = sessionKey;
    }

    const typPrice = (b.high + b.low + b.close) / 3;
    const vol = typeof b.volume === "number" && b.volume > 0 ? b.volume : 0;

    sumPV += typPrice * vol;
    sumV += vol;
    sumPrice += typPrice;
    count++;

    const val =
      !isTwap && sumV > 0
        ? sumPV / sumV
        : sumPrice / Math.max(count, 1);

    pointsMap.set(timeSec, Math.round(val * 100) / 100);
  }

  const result: LineData<Time>[] = [];
  for (const [timeSec, value] of pointsMap.entries()) {
    result.push({
      time: timeSec as UTCTimestamp,
      value
    });
  }

  return result.sort((a, b) => (a.time as number) - (b.time as number));
}

// ---------------------------------------------------------------------------
// MinBookChart Component
// ---------------------------------------------------------------------------
export default function MinBookChart({
  brief,
  selectedInstrument,
  focusedLevel,
  onClearFocusedLevel,
  replayCutoffMs = null,
  replayLabel,
  fullIntradayBars,
  showReplayOutcome = false,
  onToggleReplayOutcome
}: MinBookChartProps) {
  const { timezone, timezoneCode, config } = useTimezone();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line", Time> | null>(null);
  const smtLineSeriesRef = useRef<ISeriesApi<"Line", Time> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const userHLineRefs = useRef<IPriceLine[]>([]);
  const userHLineMapRef = useRef<Record<string, IPriceLine>>({});
  const focusedLineRef = useRef<IPriceLine | null>(null);

  // Primitives
  const verticalPrimitiveRef = useRef<VerticalTimeHighlightPrimitive | null>(null);
  const retraceBoxPrimitiveRef = useRef<HorizontalRetraceZonePrimitive | null>(null);
  const htfGoldenBoxPrimitiveRef = useRef<HorizontalRetraceZonePrimitive | null>(null);
  const userDrawingsPrimitiveRef = useRef<UserDrawingsPrimitive | null>(null);

  // User Chart Drawing Tools State (H-Line, Square, Type) & Object Manipulation
  type DrawingTool = "cursor" | "hline" | "rect" | "text";
  const [activeTool, setActiveTool] = useState<DrawingTool>("cursor");
  const [drawingColor, setDrawingColor] = useState<ChartDrawingColor>("CYAN");
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingPriceInput, setEditingPriceInput] = useState<string>("");
  const [canvasCursor, setCanvasCursor] = useState<string>("default");
  const [rectDraftStart, setRectDraftStart] = useState<{
    timeSec: number;
    price: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [pendingTextAnchor, setPendingTextAnchor] = useState<{
    timeSec: number;
    price: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const [pendingTextValue, setPendingTextValue] = useState<string>("");
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const barTimesRef = useRef<number[]>([]);
  const intervalSecRef = useRef<number>(900);
  const isDraggingRectRef = useRef<boolean>(false);
  const chartNavDisabledRef = useRef<boolean>(false);
  const liveDrawingsRef = useRef<ChartDrawing[]>([]);
  const activeDragRef = useRef<{
    id: string;
    type: ChartDrawing["type"];
    mode: DrawingDragMode;
    startLogical: number;
    startPrice: number;
    snapshot: ChartDrawing;
  } | null>(null);

  // Timeframe state
  type ChartTimeframe = "5m" | "15m" | "1h" | "4h";
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("15m");
  const [loadingTimeframe, setLoadingTimeframe] = useState<boolean>(false);
  const [cachedBarsByTf, setCachedBarsByTf] = useState<Record<string, OHLCVBar[]>>({});

  // Overlays toggle state - default all to false for clean, non-overwhelming initial view
  const [layers, setLayers] = useState<ActiveLayers>({
    liquidity: false,
    retrace: false,
    vwap: false,
    zones: false,
    subSessions: false,
    volatility: false,
    gex: false,
    footprint: false,
    smt: false
  });

  // Window minimization states - default HUD to hidden for clean uncluttered chart
  const [isGexMinimized, setIsGexMinimized] = useState<boolean>(true);
  const [isOhlcMinimized, setIsOhlcMinimized] = useState<boolean>(true);
  const [allHudsHidden, setAllHudsHidden] = useState<boolean>(true);

  // HUD Crosshair State
  const [crosshairOHLC, setCrosshairOHLC] = useState<OHLCState | null>(null);
  const [freeCursor, setFreeCursor] = useState<{ price: number | null; dist: number | null }>({
    price: null,
    dist: null
  });
  const latestBarRef = useRef<OHLCState | null>(null);

  const metrics = brief.sessionMetrics;
  const quote = brief.quote;
  const plan = brief.tacticalPlan;
  const isTwapMode = metrics.vwapCalculationMode === "TWAP_FALLBACK";

  // Distances to nearest liquidity magnet and retrace level
  const nearestInfo = useMemo(() => {
    const cp = quote.price;
    const magnets = brief.keyLevels.filter((l) => l.role === "LIQUIDITY POOL" || l.role === "MAGNET");
    const retraces = brief.keyLevels.filter((l) => l.role === "RETRACE ZONE" || l.role === "EQUILIBRIUM");

    let nearestMagnet: KeyLevel | null = null;
    let minMagnetDist = Infinity;
    for (const m of magnets) {
      const d = Math.abs(m.price - cp);
      if (d < minMagnetDist) {
        minMagnetDist = d;
        nearestMagnet = m;
      }
    }

    let nearestRetrace: KeyLevel | null = null;
    let minRetraceDist = Infinity;
    for (const r of retraces) {
      const d = Math.abs(r.price - cp);
      if (d < minRetraceDist) {
        minRetraceDist = d;
        nearestRetrace = r;
      }
    }

    return { nearestMagnet, nearestRetrace };
  }, [brief.keyLevels, quote.price]);

  // Handle layer toggle
  const toggleLayer = (layer: keyof ActiveLayers) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Fetch or retrieve bars for selected timeframe + instrument (causally sliced when in 12H Replay)
  const activeBars = useMemo(() => {
    const key = `${selectedInstrument}_${timeframe}`;
    const raw =
      timeframe === "15m"
        ? showReplayOutcome && fullIntradayBars && fullIntradayBars.length > 0
          ? fullIntradayBars
          : brief.intradayBars || cachedBarsByTf[key] || []
        : cachedBarsByTf[key] || [];

    if (!replayCutoffMs || showReplayOutcome) {
      return raw;
    }

    if (timeframe === "5m" || timeframe === "15m") {
      return raw.filter((b) => Date.parse(b.timestamp) < replayCutoffMs);
    }
    if (timeframe === "1h") {
      return raw.filter((b) => Date.parse(b.timestamp) + 3600_000 <= replayCutoffMs);
    }
    return raw.filter((b) => Date.parse(b.timestamp) + 14400_000 <= replayCutoffMs);
  }, [
    timeframe,
    cachedBarsByTf,
    brief.intradayBars,
    fullIntradayBars,
    selectedInstrument,
    replayCutoffMs,
    showReplayOutcome
  ]);

  // Populate full 15m cache only from live brief (never overwrite with replay slice)
  useEffect(() => {
    if (!replayCutoffMs && brief.intradayBars && brief.intradayBars.length > 0) {
      setCachedBarsByTf((prev) => ({
        ...prev,
        [`${selectedInstrument}_15m`]: brief.intradayBars!
      }));
    }
  }, [brief.intradayBars, selectedInstrument, replayCutoffMs]);

  const fetchTimeframeBars = useCallback(
    async (tf: ChartTimeframe, forceFresh: boolean = false) => {
      setLoadingTimeframe(true);
      try {
        const res = await fetch(
          `/api/market-data/chart?symbol=${selectedInstrument}&interval=${tf}${forceFresh ? "&refresh=true" : ""}&t=${Date.now()}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (json.success && Array.isArray(json.bars)) {
          setCachedBarsByTf((prev) => ({
            ...prev,
            [`${selectedInstrument}_${tf}`]: json.bars
          }));
        }
      } catch (err) {
        console.error(`Failed to fetch ${tf} bars:`, err);
      } finally {
        setLoadingTimeframe(false);
      }
    },
    [selectedInstrument]
  );

  // Keep non-15m charts synced with live feed without refetching on replay scrub
  useEffect(() => {
    if (timeframe !== "15m" && !replayCutoffMs) {
      fetchTimeframeBars(timeframe, true);
    }
  }, [timeframe, brief.dataSource.lastUpdated, selectedInstrument, replayCutoffMs, fetchTimeframeBars]);

  // Fetch selected timeframe on switcher click
  const handleSelectTimeframe = useCallback(
    async (tf: ChartTimeframe) => {
      setTimeframe(tf);
      if (tf === "15m" && brief.intradayBars && brief.intradayBars.length > 0) {
        return;
      }
      await fetchTimeframeBars(tf, true);
    },
    [brief.intradayBars, fetchTimeframeBars]
  );

  // ---------------------------------------------------------------------------
  // Initialize Chart Instance
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    // Destroy any existing chart instance in case of hot-reload
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = containerRef.current;
    const initialWidth = container.clientWidth || 800;
    const initialHeight = 560;

    const chart = createChart(container, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#09090b" },
        textColor: "#a1a1aa",
        fontFamily: "var(--font-geist-mono), monospace, ui-monospace, sans-serif",
        fontSize: 11
      },
      grid: {
        vertLines: { color: "rgba(39, 39, 42, 0.45)", style: LineStyle.Dotted },
        horzLines: { color: "rgba(39, 39, 42, 0.45)", style: LineStyle.Dotted }
      },
      crosshair: {
        mode: CrosshairMode.Normal, // Free movement anywhere on canvas (allows trader to freely observe price levels & stops)
        vertLine: {
          color: "rgba(161, 161, 170, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#18181b",
          labelVisible: true
        },
        horzLine: {
          color: "rgba(161, 161, 170, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#18181b",
          labelVisible: true
        }
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true
      },
      rightPriceScale: {
        borderColor: "#1e293b",
        scaleMargins: {
          top: 0.12,
          bottom: 0.12
        },
        autoScale: true
      },
      timeScale: {
        borderColor: "#1e293b",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12, // Free whitespace on right to observe and project future price moves
        barSpacing: 9,
        minBarSpacing: 2,
        tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) => {
          const tsSec = typeof time === "number" ? time : typeof time === "string" ? new Date(time).getTime() / 1000 : 0;
          const d = new Date(tsSec * 1000);

          if (
            tickMarkType === TickMarkType.DayOfMonth ||
            tickMarkType === TickMarkType.Month ||
            tickMarkType === TickMarkType.Year
          ) {
            return d.toLocaleDateString("en-US", {
              timeZone: timezone,
              month: "short",
              day: "numeric"
            });
          }

          return d.toLocaleTimeString("en-US", {
            timeZone: timezone,
            hour12: false,
            hour: "2-digit",
            minute: "2-digit"
          });
        }
      },
      localization: {
        locale: "en-US",
        dateFormat: "yyyy-MM-dd",
        timeFormatter: (time: Time) => {
          return formatETDateTime(time, timezone, timezoneCode);
        }
      }
    });

    chartRef.current = chart;

    // 1. Candlestick Series (v5 API: chart.addSeries(CandlestickSeries, ...))
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderUpColor: "#10b981",
      borderDownColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: {
        type: "price",
        precision: 2,
        minMove: 0.25
      }
    });
    candleSeriesRef.current = candleSeries;

    // 2. VWAP Series (v5 API: chart.addSeries(LineSeries, ...))
    const vwapSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: true,
      visible: false,
      title: isTwapMode ? "TWAP" : "VWAP"
    });
    vwapSeriesRef.current = vwapSeries;

    // 3. SMT Divergence Line Series (Dotted trendline connecting swing points)
    const smtLine = chart.addSeries(LineSeries, {
      color: "#34d399",
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      visible: false,
      title: "SMT Divergence"
    });
    smtLineSeriesRef.current = smtLine;

    // 4. Custom Canvas Primitives (default disabled for clean initial canvas)
    const vertHighlight = new VerticalTimeHighlightPrimitive();
    vertHighlight.setEnabled(false);
    candleSeries.attachPrimitive(vertHighlight);
    verticalPrimitiveRef.current = vertHighlight;

    const retraceBox = new HorizontalRetraceZonePrimitive();
    retraceBox.setEnabled(false);
    candleSeries.attachPrimitive(retraceBox);
    retraceBoxPrimitiveRef.current = retraceBox;

    const htfGoldenBox = new HorizontalRetraceZonePrimitive();
    htfGoldenBox.setEnabled(false);
    candleSeries.attachPrimitive(htfGoldenBox);
    htfGoldenBoxPrimitiveRef.current = htfGoldenBox;

    const userDrawingsPrim = new UserDrawingsPrimitive();
    candleSeries.attachPrimitive(userDrawingsPrim);
    userDrawingsPrimitiveRef.current = userDrawingsPrim;

    // 5. Subscribe to Crosshair Moves for Live HUD OHLC & Free Cursor Price
    chart.subscribeCrosshairMove((param) => {
      const candleSeries = candleSeriesRef.current;
      if (!param.point || !candleSeries) {
        // Cursor exited canvas
        setFreeCursor({ price: null, dist: null });
        if (latestBarRef.current) {
          setCrosshairOHLC(latestBarRef.current);
        }
        return;
      }

      // Free cursor price at mouse Y coordinate anywhere on chart canvas (unlocked from candle)
      const cursorPrice = candleSeries.coordinateToPrice(param.point.y);
      if (cursorPrice !== null) {
        const p = Math.round(cursorPrice * 100) / 100;
        const dist = Math.round((p - quote.price) * 100) / 100;
        setFreeCursor({ price: p, dist });
      } else {
        setFreeCursor({ price: null, dist: null });
      }

      if (param.time) {
        const barData = param.seriesData.get(candleSeries);
        if (barData && "open" in barData) {
          const o = barData.open;
          const h = barData.high;
          const l = barData.low;
          const c = barData.close;
          const change = c - o;
          const changePercent = o > 0 ? (change / o) * 100 : 0;
          const timeStr = formatETDateTime(param.time, timezone, timezoneCode);

          setCrosshairOHLC({
            open: o,
            high: h,
            low: l,
            close: c,
            change: Math.round(change * 100) / 100,
            changePercent: Math.round(changePercent * 100) / 100,
            timeStr
          });
        }
      } else {
        if (latestBarRef.current) {
          setCrosshairOHLC(latestBarRef.current);
        }
      }
    });

    // 6. Responsive ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && chartRef.current) {
        chartRef.current.applyOptions({
          width,
          height: height > 200 ? height : 480
        });
      }
    });
    resizeObserver.observe(container);

    // Cleanup on unmount (prevents React Strict Mode duplicate canvases)
    return () => {
      resizeObserver.disconnect();
      if (markersPluginRef.current) {
        try {
          markersPluginRef.current.detach();
        } catch {}
        markersPluginRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      candleSeriesRef.current = null;
      vwapSeriesRef.current = null;
      smtLineSeriesRef.current = null;
      verticalPrimitiveRef.current = null;
      retraceBoxPrimitiveRef.current = null;
      htfGoldenBoxPrimitiveRef.current = null;
      userDrawingsPrimitiveRef.current = null;
      priceLinesRef.current = [];
      userHLineRefs.current = [];
      userHLineMapRef.current = {};
      focusedLineRef.current = null;
    };
  }, [isTwapMode]);

  // ---------------------------------------------------------------------------
  // Populate / Update Bar Data & Markers
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current || !vwapSeriesRef.current) return;

    if (activeBars.length === 0) return;

    // Sanitize candles: strictly ascending Unix seconds, deduplicated
    const candleData = sanitizeCandleBars(activeBars);
    if (candleData.length === 0) return;

    candleSeriesRef.current.setData(candleData);

    // Compute & set VWAP line data
    const vwapData = computeCumulativeVWAP(activeBars, isTwapMode);
    vwapSeriesRef.current.setData(vwapData);
    vwapSeriesRef.current.applyOptions({
      title: isTwapMode ? "TWAP" : "VWAP"
    });

    // Update Latest Bar for Default HUD
    const lastBar = candleData[candleData.length - 1];
    const change = lastBar.close - lastBar.open;
    const changePct = lastBar.open > 0 ? (change / lastBar.open) * 100 : 0;
    const defaultState: OHLCState = {
      open: lastBar.open,
      high: lastBar.high,
      low: lastBar.low,
      close: lastBar.close,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePct * 100) / 100,
      timeStr: formatETDateTime(lastBar.time)
    };
    latestBarRef.current = defaultState;
    setCrosshairOHLC(defaultState);

    // Update Vertical Highlight Primitive & User Drawings Coordinate Context
    const barTimes = candleData.map((c) => c.time as number);
    const intervalSec =
      timeframe === "5m"
        ? 300
        : timeframe === "15m"
        ? 900
        : timeframe === "1h"
        ? 3600
        : 14400;
    barTimesRef.current = barTimes;
    intervalSecRef.current = intervalSec;
    if (verticalPrimitiveRef.current) {
      verticalPrimitiveRef.current.setBars(activeBars);
    }
    if (userDrawingsPrimitiveRef.current) {
      userDrawingsPrimitiveRef.current.setContext(barTimes, intervalSec);
    }

    // Build Markers (v5 API: createSeriesMarkers(series, markers))
    const markers: SeriesMarker<Time>[] = [];

    // 1. Find 09:30 AM ET bar to place Opening Bell Marker (5m / 15m intraday only)
    if (timeframe === "5m" || timeframe === "15m") {
      for (const b of activeBars) {
        const dt = new Date(b.timestamp);
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "numeric",
          hour12: false
        }).formatToParts(dt);
        const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
        const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

        if (h === 9 && m === 30) {
          markers.push({
            time: Math.floor(dt.getTime() / 1000) as UTCTimestamp,
            position: "aboveBar",
            color: "#38bdf8",
            shape: "arrowDown",
            text: "09:30 OPEN"
          });
        }
      }
    }

    // 2. Free 1m-Derived Footprint & Absorption Markers (intraday 5m / 15m)
    if (layers.footprint && (timeframe === "5m" || timeframe === "15m") && brief.footprint?.bars) {
      for (const fBar of brief.footprint.bars) {
        if (!fBar.signal) continue;
        if (fBar.signal === "VWWR_BUY" || fBar.signal === "ABS_BUY") {
          markers.push({
            time: fBar.timeSec as UTCTimestamp,
            position: "belowBar",
            color: "#22d3ee",
            shape: "arrowUp",
            text: "VWWR BUY"
          });
        } else if (fBar.signal === "VWWR_SELL" || fBar.signal === "ABS_SELL") {
          markers.push({
            time: fBar.timeSec as UTCTimestamp,
            position: "aboveBar",
            color: "#f43f5e",
            shape: "arrowDown",
            text: "VWWR SELL"
          });
        } else if (fBar.signal === "IMP_BUY") {
          markers.push({
            time: fBar.timeSec as UTCTimestamp,
            position: "belowBar",
            color: "#10b981",
            shape: "circle",
            text: "IMP+"
          });
        } else if (fBar.signal === "IMP_SELL") {
          markers.push({
            time: fBar.timeSec as UTCTimestamp,
            position: "aboveBar",
            color: "#f43f5e",
            shape: "circle",
            text: "IMP-"
          });
        } else if (fBar.signal === "CVD_DIV_BEAR") {
          markers.push({
            time: fBar.timeSec as UTCTimestamp,
            position: "aboveBar",
            color: "#fb923c",
            shape: "square",
            text: "CVD DIV ▼"
          });
        } else if (fBar.signal === "CVD_DIV_BULL") {
          markers.push({
            time: fBar.timeSec as UTCTimestamp,
            position: "belowBar",
            color: "#a855f7",
            shape: "square",
            text: "CVD DIV ▲"
          });
        }
      }
    }

    // 3. SMT (Smart Money Technique) Dotted Trendline & Swing Markers
    if (smtLineSeriesRef.current) {
      const smt = brief.sessionMetrics.smtDivergence;
      if (layers.smt && smt?.hasDivergence && smt.nqSwingPoints) {
        const [pt1, pt2] = smt.nqSwingPoints;
        const smtColor = smt.direction === "BULLISH" ? "#34d399" : "#f43f5e";

        smtLineSeriesRef.current.applyOptions({
          color: smtColor,
          visible: true,
          title:
            smt.direction === "BULLISH"
              ? "Bullish SMT Divergence (vs ES)"
              : "Bearish SMT Divergence (vs ES)"
        });
        smtLineSeriesRef.current.setData([
          { time: pt1.timeSec as UTCTimestamp, value: pt1.price },
          { time: pt2.timeSec as UTCTimestamp, value: pt2.price }
        ]);

        markers.push({
          time: pt1.timeSec as UTCTimestamp,
          position: smt.direction === "BULLISH" ? "belowBar" : "aboveBar",
          color: smtColor,
          shape: "circle",
          text: `NQ ${pt1.label}`
        });

        markers.push({
          time: pt2.timeSec as UTCTimestamp,
          position: smt.direction === "BULLISH" ? "belowBar" : "aboveBar",
          color: smtColor,
          shape: smt.direction === "BULLISH" ? "arrowUp" : "arrowDown",
          text: `${smt.direction === "BULLISH" ? "BULL SMT" : "BEAR SMT"} (${smt.leadingAsset} Leads)`
        });
      } else {
        smtLineSeriesRef.current.setData([]);
        smtLineSeriesRef.current.applyOptions({ visible: false });
      }
    }

    // Optional Replay Pivot Marker at selected hour cutoff
    if (replayCutoffMs && candleData.length > 0) {
      const cutoffSec = Math.floor(replayCutoffMs / 1000);
      let pivotCandle = candleData[candleData.length - 1];
      for (const c of candleData) {
        if ((c.time as number) < cutoffSec) {
          pivotCandle = c;
        }
      }
      markers.push({
        time: pivotCandle.time,
        position: "aboveBar",
        color: "#fbbf24",
        shape: "arrowDown",
        text: replayLabel ? `REPLAY ${replayLabel}` : "REPLAY"
      });
    }

    // Strict ascending order required by Lightweight Charts
    markers.sort((a, b) => Number(a.time) - Number(b.time));

    // Attach or update series markers
    if (markersPluginRef.current) {
      try {
        markersPluginRef.current.setMarkers(markers);
      } catch {
        markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
      }
    } else {
      markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
    }

    // Fit content cleanly; for higher timeframes with long lookbacks, focus recent ~120 candles
    if ((timeframe === "1h" || timeframe === "4h") && candleData.length > 130) {
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: candleData.length - 120,
        to: candleData.length + 4
      });
    } else {
      chartRef.current.timeScale().fitContent();
    }
  }, [activeBars, timeframe, replayCutoffMs, replayLabel, isTwapMode, layers.footprint, layers.smt, brief.footprint, brief.sessionMetrics.smtDivergence]);

  // Update Chart Timezone Localization dynamically when user switches ET / CT / PT
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      timeScale: {
        tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) => {
          const tsSec = typeof time === "number" ? time : typeof time === "string" ? new Date(time).getTime() / 1000 : 0;
          const d = new Date(tsSec * 1000);
          if (
            tickMarkType === TickMarkType.DayOfMonth ||
            tickMarkType === TickMarkType.Month ||
            tickMarkType === TickMarkType.Year
          ) {
            return d.toLocaleDateString("en-US", {
              timeZone: timezone,
              month: "short",
              day: "numeric"
            });
          }
          return d.toLocaleTimeString("en-US", {
            timeZone: timezone,
            hour12: false,
            hour: "2-digit",
            minute: "2-digit"
          });
        }
      },
      localization: {
        timeFormatter: (time: Time) => {
          return formatETDateTime(time, timezone, timezoneCode);
        }
      }
    });
  }, [timezone, timezoneCode]);

  // Toggle SMT Series Visibility
  useEffect(() => {
    if (smtLineSeriesRef.current) {
      smtLineSeriesRef.current.applyOptions({ visible: layers.smt });
    }
  }, [layers.smt]);

  // ---------------------------------------------------------------------------
  // Update Custom Retrace Zone Primitives
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!retraceBoxPrimitiveRef.current) return;

    // Primary Retrace Zone Box
    const biasVerdict = brief.bias.verdict;
    const isBull = biasVerdict.includes("BULLISH");
    const isBear = biasVerdict.includes("BEARISH");
    const biasType = isBull ? "BULLISH" : isBear ? "BEARISH" : "NEUTRAL";

    const zone = brief.bias.idealRetraceZone;
    if (zone && zone.startPrice > 0 && zone.endPrice > 0) {
      retraceBoxPrimitiveRef.current.setZone(
        zone.startPrice,
        zone.endPrice,
        isBull ? "DISCOUNT RETRACE ZONE" : isBear ? "PREMIUM RETRACE ZONE" : "EQUILIBRIUM ZONE",
        biasType
      );
    }

    // HTF 50%–61.8% Golden Pocket Zone Box
    if (htfGoldenBoxPrimitiveRef.current && metrics.htf50Retrace > 0 && metrics.htf618Retrace > 0) {
      htfGoldenBoxPrimitiveRef.current.setZone(
        metrics.htf50Retrace,
        metrics.htf618Retrace,
        "HTF GOLDEN POCKET (50%–61.8%)",
        metrics.htfImpulseDirection === "BULLISH" ? "BULLISH" : "BEARISH"
      );
    }
  }, [brief.bias, metrics]);

  // ---------------------------------------------------------------------------
  // Manage Categorized Price Lines (createPriceLine / removePriceLine)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    // 1. Remove all previously added categorized price lines
    priceLinesRef.current.forEach((line) => {
      try {
        candleSeries.removePriceLine(line);
      } catch {}
    });
    priceLinesRef.current = [];

    // Helper to safely add price line and track reference
    const addLine = (
      price: number,
      title: string,
      color: string,
      lineStyle: LineStyle = LineStyle.Dashed,
      lineWidth: number = 1
    ) => {
      if (!price || isNaN(price) || price <= 0) return;
      try {
        const line = candleSeries.createPriceLine({
          price: Math.round(price * 100) / 100,
          color,
          lineWidth: lineWidth as any,
          lineStyle,
          axisLabelVisible: true,
          title
        });
        priceLinesRef.current.push(line);
      } catch (e) {
        console.warn(`Could not add price line for ${title}:`, e);
      }
    };

    // Category 1: Liquidity / Targets (PDH, PDL, ONH, ONL)
    if (layers.liquidity) {
      addLine(metrics.onh, "ONH (BSL)", "#f43f5e", LineStyle.Solid, 1);
      addLine(metrics.onl, "ONL (SSL)", "#10b981", LineStyle.Solid, 1);
      addLine(metrics.pdh, "PDH", "#fb7185", LineStyle.Dashed, 1);
      addLine(metrics.pdl, "PDL", "#34d399", LineStyle.Dashed, 1);
    }

    // Category 2: Retrace Anchors (PDC, ON Mid, HTF 50%, HTF 61.8%)
    if (layers.retrace) {
      addLine(metrics.pdc, "PDC (Close)", "#94a3b8", LineStyle.Dotted, 1);
      addLine(metrics.onMid, "ON Mid (EQ)", "#38bdf8", LineStyle.Dashed, 1);
      if (metrics.htf50Retrace > 0) {
        addLine(metrics.htf50Retrace, "HTF 50% EQ", "#a78bfa", LineStyle.Dashed, 1);
      }
      if (metrics.htf618Retrace > 0) {
        addLine(metrics.htf618Retrace, "HTF 61.8% GP", "#e879f9", LineStyle.Dashed, 1);
      }
    }

    // Category 3: Sub-Sessions (LonH, LonL, AsiaH, AsiaL) - Off by default
    if (layers.subSessions) {
      if (metrics.londonHigh) addLine(metrics.londonHigh, "LonH", "#64748b", LineStyle.SparseDotted, 1);
      if (metrics.londonLow) addLine(metrics.londonLow, "LonL", "#64748b", LineStyle.SparseDotted, 1);
      if (metrics.asiaHigh) addLine(metrics.asiaHigh, "AsiaH", "#475569", LineStyle.SparseDotted, 1);
      if (metrics.asiaLow) addLine(metrics.asiaLow, "AsiaL", "#475569", LineStyle.SparseDotted, 1);
    }

    // Category 4: Volatility Bands (Straddle & 1-SD Range)
    if (layers.volatility) {
      if (metrics.upperStraddle) addLine(metrics.upperStraddle, "Upper Straddle", "#c084fc", LineStyle.Dashed, 1);
      if (metrics.lowerStraddle) addLine(metrics.lowerStraddle, "Lower Straddle", "#c084fc", LineStyle.Dashed, 1);
      if (metrics.upper1SD) addLine(metrics.upper1SD, "Upper 1-SD", "#7c3aed", LineStyle.Dotted, 1);
      if (metrics.lower1SD) addLine(metrics.lower1SD, "Lower 1-SD", "#7c3aed", LineStyle.Dotted, 1);
    }

    // Category 5: GEX Levels (Gamma Flip, Call Wall, Put Wall)
    if (layers.gex && brief.gex) {
      if (brief.gex.gammaFlipNq > 0) {
        addLine(brief.gex.gammaFlipNq, `γ FLIP (${brief.gex.gammaFlipNq.toFixed(0)})`, "#c084fc", LineStyle.Dashed, 1);
      }
      if (brief.gex.callWallNq > 0) {
        addLine(brief.gex.callWallNq, `CALL WALL (${brief.gex.callWallNq.toFixed(0)})`, "#38bdf8", LineStyle.Dashed, 1);
      }
      if (brief.gex.putWallNq > 0) {
        addLine(brief.gex.putWallNq, `PUT WALL (${brief.gex.putWallNq.toFixed(0)})`, "#f43f5e", LineStyle.Dashed, 1);
      }
    }
  }, [layers, metrics, brief.gex]);

  // Toggle VWAP Series Visibility
  useEffect(() => {
    if (vwapSeriesRef.current) {
      vwapSeriesRef.current.applyOptions({ visible: layers.vwap });
    }
  }, [layers.vwap]);

  // Toggle Custom Canvas Primitives Visibility
  useEffect(() => {
    if (verticalPrimitiveRef.current) {
      verticalPrimitiveRef.current.setEnabled(layers.subSessions);
    }
    if (retraceBoxPrimitiveRef.current) {
      retraceBoxPrimitiveRef.current.setEnabled(layers.zones);
    }
    if (htfGoldenBoxPrimitiveRef.current) {
      htfGoldenBoxPrimitiveRef.current.setEnabled(layers.zones);
    }
  }, [layers.subSessions, layers.zones]);

  // ---------------------------------------------------------------------------
  // Bonus: Handle Focused Level (Highlighted Price Line from Key Levels Table)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    if (focusedLineRef.current) {
      try {
        candleSeries.removePriceLine(focusedLineRef.current);
      } catch {}
      focusedLineRef.current = null;
    }

    if (focusedLevel && focusedLevel.price > 0) {
      try {
        const line = candleSeries.createPriceLine({
          price: Math.round(focusedLevel.price * 100) / 100,
          color: "#22d3ee",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `★ FOCUS: ${focusedLevel.shortName}`
        });
        focusedLineRef.current = line;
      } catch (err) {
        console.warn("Could not create focused price line:", err);
      }
    }
  }, [focusedLevel]);

  // ---------------------------------------------------------------------------
  // User Drawing Persistence, Sync & Interactions (H-Line, Square, Type)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(`minbook_chart_drawings_${selectedInstrument}`) ||
        localStorage.getItem(`tapebook_chart_drawings_${selectedInstrument}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setDrawings(parsed);
          return;
        }
      }
    } catch {}
    setDrawings([]);
  }, [selectedInstrument]);

  useEffect(() => {
    liveDrawingsRef.current = drawings;
    try {
      localStorage.setItem(
        `minbook_chart_drawings_${selectedInstrument}`,
        JSON.stringify(drawings)
      );
    } catch {}

    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    // 1. Sync Rectangle & Text drawings to canvas primitive
    if (userDrawingsPrimitiveRef.current) {
      userDrawingsPrimitiveRef.current.setDrawings(drawings);
      userDrawingsPrimitiveRef.current.setSelectedId(selectedDrawingId);
    }

    // 2. Sync Straight Horizontal Lines as native price lines with axis labels
    for (const line of userHLineRefs.current) {
      try {
        candleSeries.removePriceLine(line);
      } catch {}
    }
    userHLineRefs.current = [];
    userHLineMapRef.current = {};

    for (const d of drawings) {
      if (d.type === "hline") {
        const palette = DRAWING_COLOR_PALETTE[d.color] || DRAWING_COLOR_PALETTE.CYAN;
        const isSelected = d.id === selectedDrawingId;
        try {
          const line = candleSeries.createPriceLine({
            price: d.price,
            color: isSelected ? "#ffffff" : palette.hex,
            lineWidth: isSelected ? 3 : 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: isSelected ? "★ LINE" : "LINE"
          });
          userHLineRefs.current.push(line);
          userHLineMapRef.current[d.id] = line;
        } catch {}
      }
    }
  }, [drawings, selectedDrawingId, selectedInstrument, activeBars, isTwapMode]);

  const selectedDrawing = useMemo(
    () => drawings.find((d) => d.id === selectedDrawingId) ?? null,
    [drawings, selectedDrawingId]
  );

  useEffect(() => {
    if (selectedDrawing?.type === "hline") {
      setEditingPriceInput(selectedDrawing.price.toFixed(2));
    } else {
      setEditingPriceInput("");
    }
  }, [selectedDrawing]);

  // Focus text input automatically when user taps chart in Type mode or edits existing text
  useEffect(() => {
    if (pendingTextAnchor) {
      setTimeout(() => textInputRef.current?.focus(), 20);
    }
  }, [pendingTextAnchor]);

  const setChartNavigationEnabled = useCallback((enabled: boolean) => {
    const wantDisabled = !enabled;
    if (chartNavDisabledRef.current === wantDisabled) return;
    chartNavDisabledRef.current = wantDisabled;
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: enabled,
        horzTouchDrag: enabled,
        vertTouchDrag: enabled
      },
      handleScale: {
        axisPressedMouseMove: enabled,
        mouseWheel: true,
        pinch: enabled
      }
    });
  }, []);

  // Escape key cancels active drawing / clears selection; Delete/Backspace removes selected object
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      const isTyping = targetTag === "INPUT" || targetTag === "TEXTAREA";

      if (e.key === "Escape") {
        setRectDraftStart(null);
        isDraggingRectRef.current = false;
        activeDragRef.current = null;
        setChartNavigationEnabled(true);
        setCanvasCursor("default");
        setPendingTextAnchor(null);
        setPendingTextValue("");
        setEditingTextId(null);
        setSelectedDrawingId(null);
        userDrawingsPrimitiveRef.current?.setPreview(null, null);
        setActiveTool("cursor");
        return;
      }

      if (!isTyping && (e.key === "Delete" || e.key === "Backspace") && selectedDrawingId) {
        e.preventDefault();
        activeDragRef.current = null;
        setChartNavigationEnabled(true);
        setCanvasCursor("default");
        setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawingId));
        setSelectedDrawingId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedDrawingId, setChartNavigationEnabled]);

  const getChartPointFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      const chart = chartRef.current;
      const series = candleSeriesRef.current;
      if (!container || !chart || !series) return null;

      const rect = container.getBoundingClientRect();
      // Clamp within actual plot pane (exclude right price axis & bottom time axis)
      const plotWidth = Math.max(1, chart.timeScale().width() || rect.width);
      const plotHeight = Math.max(1, chart.paneSize().height || rect.height);
      const x = Math.max(0, Math.min(clientX - rect.left, plotWidth - 1));
      const y = Math.max(0, Math.min(clientY - rect.top, plotHeight - 1));

      const rawPrice = series.coordinateToPrice(y);
      if (rawPrice === null || !Number.isFinite(rawPrice)) return null;

      // Snap cleanly to NQ 0.25 tick
      const price = Math.round((rawPrice as number) * 4) / 4;
      const timeSec = chartXToTimeSec(
        chart,
        barTimesRef.current,
        intervalSecRef.current,
        x
      );
      if (timeSec === null || !Number.isFinite(timeSec)) return null;

      const rawLogical = chart.timeScale().coordinateToLogical(x);
      const logical =
        rawLogical !== null && Number.isFinite(rawLogical)
          ? (rawLogical as number)
          : timeSecToLogicalIndex(barTimesRef.current, intervalSecRef.current, timeSec);
      if (logical === null || !Number.isFinite(logical)) return null;

      return { x, y, price, timeSec, logical, width: plotWidth, height: plotHeight };
    },
    []
  );

  const computeCurrentScreenBoxes = useCallback((sourceDrawings?: ChartDrawing[]): DrawingScreenBox[] => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return [];
    const list = sourceDrawings ?? liveDrawingsRef.current;
    const boxes: DrawingScreenBox[] = [];

    for (const d of list) {
      if (d.type === "hline") {
        const y1 = series.priceToCoordinate(d.price);
        if (y1 !== null) boxes.push({ drawing: d, y1: y1 as number });
      } else if (d.type === "text") {
        const x1 = timeSecToChartX(chart, barTimesRef.current, intervalSecRef.current, d.timeSec);
        const y1 = series.priceToCoordinate(d.price);
        if (x1 !== null && y1 !== null) boxes.push({ drawing: d, x1, y1: y1 as number });
      } else if (d.type === "rect") {
        const x1 = timeSecToChartX(chart, barTimesRef.current, intervalSecRef.current, d.timeSec1);
        const x2 = timeSecToChartX(chart, barTimesRef.current, intervalSecRef.current, d.timeSec2);
        const y1 = series.priceToCoordinate(d.price1);
        const y2 = series.priceToCoordinate(d.price2);
        if (x1 !== null && x2 !== null && y1 !== null && y2 !== null) {
          boxes.push({ drawing: d, x1, y1: y1 as number, x2, y2: y2 as number });
        }
      }
    }
    return boxes;
  }, []);

  const getCursorForHit = (hit: ReturnType<typeof hitTestScreenBoxes>, isDragging: boolean): string => {
    if (!hit) return "default";
    if (hit.mode === "NW" || hit.mode === "SE") return "nwse-resize";
    if (hit.mode === "NE" || hit.mode === "SW") return "nesw-resize";
    if (hit.mode === "N" || hit.mode === "S" || hit.type === "hline") return "ns-resize";
    if (hit.mode === "E" || hit.mode === "W") return "ew-resize";
    return isDragging ? "grabbing" : "grab";
  };

  const commitActiveDrag = useCallback(() => {
    if (!activeDragRef.current) return;
    activeDragRef.current = null;
    setChartNavigationEnabled(true);
    setCanvasCursor("default");
    setDrawings([...liveDrawingsRef.current]);
  }, [setChartNavigationEnabled]);

  // Block Lightweight Charts native mousedown pan when interacting with a drawing
  const handleCanvasMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== "cursor" || pendingTextAnchor) return;
    if ((e.target as HTMLElement | null)?.closest("[data-chart-hud='true']")) return;
    if (activeDragRef.current) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation?.();
      e.preventDefault();
      return;
    }
    const pt = getChartPointFromEvent(e.clientX, e.clientY);
    if (!pt) return;
    const hit = hitTestScreenBoxes(pt.x, pt.y, computeCurrentScreenBoxes(drawings), 9);
    if (hit) {
      setChartNavigationEnabled(false);
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation?.();
      e.preventDefault();
    }
  };

  const handleCanvasPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    // Do not intercept HUD clicks, inline text editor clicks, or active draw-mode overlay clicks
    if (activeTool !== "cursor" || pendingTextAnchor) return;
    if ((e.target as HTMLElement | null)?.closest("[data-chart-hud='true']")) return;

    const pt = getChartPointFromEvent(e.clientX, e.clientY);
    if (!pt) return;

    liveDrawingsRef.current = drawings;
    const boxes = computeCurrentScreenBoxes(drawings);
    const hit = hitTestScreenBoxes(pt.x, pt.y, boxes, 9);

    if (!hit) {
      setSelectedDrawingId(null);
      setChartNavigationEnabled(true);
      return; // Let Lightweight Charts pan normally!
    }

    const hitDrawing = drawings.find((d) => d.id === hit.id);
    if (!hitDrawing) return;

    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation?.();
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    setSelectedDrawingId(hitDrawing.id);
    setDrawingColor(hitDrawing.color);
    setChartNavigationEnabled(false);
    setCanvasCursor(getCursorForHit(hit, true));

    activeDragRef.current = {
      id: hitDrawing.id,
      type: hitDrawing.type,
      mode: hit.mode,
      startLogical: pt.logical,
      startPrice: pt.price,
      snapshot: { ...hitDrawing }
    };
  };

  const handleCanvasPointerMoveCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== "cursor") return;

    const drag = activeDragRef.current;
    if (drag) {
      const pt = getChartPointFromEvent(e.clientX, e.clientY);
      if (!pt) return;
      const deltaLogical = pt.logical - drag.startLogical;
      const deltaPrice = pt.price - drag.startPrice;
      const updated = applyDrawingDragLogical(
        drag.snapshot,
        drag.mode,
        deltaLogical,
        deltaPrice,
        barTimesRef.current,
        intervalSecRef.current,
        0.25
      );
      const nextList = liveDrawingsRef.current.map((d) => (d.id === drag.id ? updated : d));
      liveDrawingsRef.current = nextList;

      if (updated.type === "hline") {
        const line = userHLineMapRef.current[drag.id];
        if (line) {
          line.applyOptions({ price: updated.price });
        }
        userDrawingsPrimitiveRef.current?.setDrawings(nextList);
      } else {
        userDrawingsPrimitiveRef.current?.setDrawings(nextList);
      }
      return;
    }

    // Hover cursor feedback & pre-lock chart scroll while pointing at a drawing
    const pt = getChartPointFromEvent(e.clientX, e.clientY);
    if (!pt || drawings.length === 0) {
      if (canvasCursor !== "default") setCanvasCursor("default");
      setChartNavigationEnabled(true);
      return;
    }
    const hit = hitTestScreenBoxes(pt.x, pt.y, computeCurrentScreenBoxes(drawings), 8);
    if (!hit) {
      if (canvasCursor !== "default") setCanvasCursor("default");
      setChartNavigationEnabled(true);
    } else {
      setChartNavigationEnabled(false);
      setCanvasCursor(getCursorForHit(hit, false));
    }
  };

  useEffect(() => {
    const endActiveDrag = () => {
      commitActiveDrag();
    };
    window.addEventListener("pointerup", endActiveDrag);
    window.addEventListener("pointercancel", endActiveDrag);
    window.addEventListener("blur", endActiveDrag);
    return () => {
      window.removeEventListener("pointerup", endActiveDrag);
      window.removeEventListener("pointercancel", endActiveDrag);
      window.removeEventListener("blur", endActiveDrag);
    };
  }, [commitActiveDrag]);

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== "cursor") return;
    if ((e.target as HTMLElement | null)?.closest("[data-chart-hud='true']")) return;
    const pt = getChartPointFromEvent(e.clientX, e.clientY);
    if (!pt) return;
    const hit = hitTestScreenBoxes(pt.x, pt.y, computeCurrentScreenBoxes(), 9);
    if (!hit) return;

    const hitDrawing = drawings.find((d) => d.id === hit.id);
    if (hitDrawing?.type === "text") {
      setSelectedDrawingId(hitDrawing.id);
      setEditingTextId(hitDrawing.id);
      setPendingTextValue(hitDrawing.text);
      setPendingTextAnchor({
        timeSec: hitDrawing.timeSec,
        price: hitDrawing.price,
        screenX: pt.x,
        screenY: pt.y
      });
    }
  };

  const handleSelectTool = (tool: DrawingTool) => {
    setActiveTool(tool);
    setRectDraftStart(null);
    isDraggingRectRef.current = false;
    activeDragRef.current = null;
    setChartNavigationEnabled(true);
    setPendingTextAnchor(null);
    setPendingTextValue("");
    setEditingTextId(null);
    if (tool !== "cursor") {
      setSelectedDrawingId(null);
    }
    userDrawingsPrimitiveRef.current?.setPreview(null, null);
  };

  const handleDrawingPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === "cursor") return;
    e.preventDefault();
    const pt = getChartPointFromEvent(e.clientX, e.clientY);
    if (!pt) return;

    if (activeTool === "hline") {
      const next: ChartDrawing = {
        id: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "hline",
        price: pt.price,
        color: drawingColor
      };
      setDrawings((prev) => [...prev, next]);
      userDrawingsPrimitiveRef.current?.setPreview(null, null);
      setActiveTool("cursor");
      return;
    }

    if (activeTool === "text") {
      setPendingTextAnchor({
        timeSec: pt.timeSec,
        price: pt.price,
        screenX: pt.x,
        screenY: pt.y
      });
      setPendingTextValue("");
      return;
    }

    if (activeTool === "rect") {
      if (!rectDraftStart) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
        setRectDraftStart({
          timeSec: pt.timeSec,
          price: pt.price,
          screenX: pt.x,
          screenY: pt.y
        });
        isDraggingRectRef.current = true;
      } else {
        // Second click completes square/rectangle
        const next: RectDrawing = {
          id: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: "rect",
          timeSec1: rectDraftStart.timeSec,
          price1: rectDraftStart.price,
          timeSec2: pt.timeSec,
          price2: pt.price,
          color: drawingColor
        };
        setDrawings((prev) => [...prev, next]);
        setSelectedDrawingId(next.id);
        setRectDraftStart(null);
        isDraggingRectRef.current = false;
        userDrawingsPrimitiveRef.current?.setPreview(null, null);
        setActiveTool("cursor");
      }
    }
  };

  const handleDrawingPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === "cursor") return;
    const pt = getChartPointFromEvent(e.clientX, e.clientY);
    if (!pt) return;

    if (activeTool === "hline") {
      userDrawingsPrimitiveRef.current?.setPreview(null, {
        price: pt.price,
        color: drawingColor
      });
    } else if (activeTool === "rect" && rectDraftStart) {
      userDrawingsPrimitiveRef.current?.setPreview(
        {
          type: "rect",
          timeSec1: rectDraftStart.timeSec,
          price1: rectDraftStart.price,
          timeSec2: pt.timeSec,
          price2: pt.price,
          color: drawingColor
        },
        null
      );
    }
  };

  const handleDrawingPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== "rect" || !rectDraftStart || !isDraggingRectRef.current) return;
    isDraggingRectRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    const pt = getChartPointFromEvent(e.clientX, e.clientY);
    if (!pt) return;

    // If user dragged > 10px, finish square immediately on pointerup; otherwise keep 2-click flow open
    const distPx = Math.hypot(pt.x - rectDraftStart.screenX, pt.y - rectDraftStart.screenY);
    if (distPx >= 10) {
      const next: RectDrawing = {
        id: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "rect",
        timeSec1: rectDraftStart.timeSec,
        price1: rectDraftStart.price,
        timeSec2: pt.timeSec,
        price2: pt.price,
        color: drawingColor
      };
      setDrawings((prev) => [...prev, next]);
      setSelectedDrawingId(next.id);
      setRectDraftStart(null);
      userDrawingsPrimitiveRef.current?.setPreview(null, null);
      setActiveTool("cursor");
    }
  };

  const handleCommitPendingText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pendingTextAnchor) return;
    const trimmed = pendingTextValue.trim();

    if (editingTextId) {
      if (trimmed) {
        setDrawings((prev) =>
          prev.map((d) => (d.id === editingTextId && d.type === "text" ? { ...d, text: trimmed } : d))
        );
      }
      setEditingTextId(null);
      setPendingTextAnchor(null);
      setPendingTextValue("");
      setActiveTool("cursor");
      return;
    }

    if (trimmed) {
      const nextId = `draw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const next: ChartDrawing = {
        id: nextId,
        type: "text",
        timeSec: pendingTextAnchor.timeSec,
        price: pendingTextAnchor.price,
        text: trimmed,
        color: drawingColor
      };
      setDrawings((prev) => [...prev, next]);
      setSelectedDrawingId(nextId);
    }
    setPendingTextAnchor(null);
    setPendingTextValue("");
    setActiveTool("cursor");
  };

  const handleSelectColor = (col: ChartDrawingColor) => {
    setDrawingColor(col);
    if (selectedDrawingId) {
      setDrawings((prev) =>
        prev.map((d) => (d.id === selectedDrawingId ? { ...d, color: col } : d))
      );
    }
  };

  const handleApplySelectedLinePrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDrawing || selectedDrawing.type !== "hline") return;
    const parsed = parseFloat(editingPriceInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const snapped = Math.round(parsed * 4) / 4;
    setDrawings((prev) =>
      prev.map((d) => (d.id === selectedDrawing.id && d.type === "hline" ? { ...d, price: snapped } : d))
    );
    setEditingPriceInput(snapped.toFixed(2));
  };

  const handleOpenEditSelectedText = () => {
    if (!selectedDrawing || selectedDrawing.type !== "text") return;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const x =
      chart && timeSecToChartX(chart, barTimesRef.current, intervalSecRef.current, selectedDrawing.timeSec);
    const y = series?.priceToCoordinate(selectedDrawing.price);
    setEditingTextId(selectedDrawing.id);
    setPendingTextValue(selectedDrawing.text);
    setPendingTextAnchor({
      timeSec: selectedDrawing.timeSec,
      price: selectedDrawing.price,
      screenX: typeof x === "number" ? x : 100,
      screenY: typeof y === "number" ? y : 100
    });
  };

  const handleDeleteSelected = () => {
    if (!selectedDrawingId) return;
    setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawingId));
    setSelectedDrawingId(null);
    setEditingTextId(null);
  };

  const handleUndoDrawing = () => {
    setDrawings((prev) => {
      const next = prev.slice(0, -1);
      if (selectedDrawingId && !next.some((d) => d.id === selectedDrawingId)) {
        setSelectedDrawingId(null);
      }
      return next;
    });
  };

  const handleClearDrawings = () => {
    setDrawings([]);
    setSelectedDrawingId(null);
    setEditingTextId(null);
    setRectDraftStart(null);
    setPendingTextAnchor(null);
    setPendingTextValue("");
    userDrawingsPrimitiveRef.current?.setPreview(null, null);
  };

  // Latency Pill Status
  const isDelayed = quote.status === "DELAYED";
  const latencyBadgeText = isDelayed ? "DELAYED 10–15m CME" : "LIVE PROXY";

  return (
    <div className="rounded-lg bg-zinc-950 border border-zinc-800/80 overflow-hidden flex flex-col">
      {/* 1. Header Toolbar */}
      <div className="px-3.5 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        {/* Left: Title & Instrument & Timeframe Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-1.5 font-mono">
            <span className="font-semibold text-zinc-100 tracking-tight text-xs">
              NQ Market Structure
            </span>
            <span className="px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400 text-[10px] border border-zinc-800">
              {quote.symbol}
            </span>
            {replayCutoffMs && (
              <div className="flex items-center space-x-1">
                <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[10px] border border-amber-500/30 font-semibold">
                  REPLAY {replayLabel || ""}
                </span>
                {onToggleReplayOutcome && (
                  <button
                    type="button"
                    onClick={onToggleReplayOutcome}
                    className={`px-1.5 py-0.2 rounded text-[10px] border transition-colors ${
                      showReplayOutcome
                        ? "bg-sky-500/15 text-sky-300 border-sky-500/30 font-semibold"
                        : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200"
                    }`}
                    title="Toggle seeing candles after the selected replay hour"
                  >
                    {showReplayOutcome ? "Showing After" : "Reveal After"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Timeframe Switcher (5m / 15m / 1h / 4h) */}
          <div className="flex items-center rounded bg-zinc-900 p-0.5 border border-zinc-800">
            {(["5m", "15m", "1h", "4h"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => handleSelectTimeframe(tf)}
                disabled={loadingTimeframe}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors ${
                  timeframe === tf
                    ? "bg-zinc-700 text-zinc-100 font-bold shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tf}
              </button>
            ))}
            {loadingTimeframe && (
              <RefreshCw className="w-3 h-3 text-zinc-400 animate-spin ml-1 mr-1" />
            )}
          </div>
        </div>

        {/* Right: Layer Toggle Pills */}
        <div className="flex items-center overflow-x-auto no-scrollbar gap-1 text-[11px] font-mono py-0.5 max-w-full">
          <button
            onClick={() => toggleLayer("liquidity")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              layers.liquidity
                ? "bg-zinc-800 border-zinc-700 text-zinc-100 font-semibold"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle PDH, PDL, ONH, ONL Liquidity levels"
          >
            <span>Liquidity</span>
          </button>

          <button
            onClick={() => toggleLayer("retrace")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              layers.retrace
                ? "bg-zinc-800 border-zinc-700 text-zinc-100 font-semibold"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle PDC, ON Mid, HTF 50%, HTF 61.8% GP"
          >
            <span>Retrace</span>
          </button>

          <button
            onClick={() => toggleLayer("vwap")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              layers.vwap
                ? "bg-zinc-800 border-zinc-700 text-zinc-100 font-semibold"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle Session VWAP / TWAP overlay"
          >
            <span>{isTwapMode ? "TWAP" : "VWAP"}</span>
          </button>

          <button
            onClick={() => toggleLayer("zones")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              layers.zones
                ? "bg-zinc-800 border-zinc-700 text-zinc-100 font-semibold"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle 09:30-10:00 Window and Retrace Zone boxes"
          >
            <span>Zones</span>
          </button>

          <button
            onClick={() => toggleLayer("subSessions")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              layers.subSessions
                ? "bg-zinc-800 border-zinc-700 text-zinc-100 font-semibold"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle London and Asia highs and lows"
          >
            <span>Sub-Sessions</span>
          </button>

          <button
            onClick={() => toggleLayer("volatility")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              layers.volatility
                ? "bg-zinc-800 border-zinc-700 text-zinc-100 font-semibold"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle Straddle and 1-SD Volatility range bands"
          >
            <span>Volatility</span>
          </button>

          <button
            onClick={() => toggleLayer("gex")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              layers.gex
                ? "bg-zinc-800 border-zinc-700 text-zinc-100 font-semibold"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle GEX Flip, Call Wall, Put Wall & Top Gamma strikes"
          >
            <span>GEX</span>
          </button>

          <button
            onClick={() => toggleLayer("footprint")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              layers.footprint
                ? "bg-zinc-800 border-zinc-700 text-zinc-100 font-semibold"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Free 1m-Derived Intrabar Delta Proxy"
          >
            <span>Footprint</span>
          </button>

          <button
            onClick={() => toggleLayer("smt")}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              layers.smt
                ? "bg-zinc-800 border-zinc-700 text-zinc-100 font-semibold"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Toggle SMT NQ vs ES dotted trendline & markers"
          >
            <span>SMT</span>
          </button>

          <button
            onClick={() => setAllHudsHidden(!allHudsHidden)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors flex items-center space-x-1 ${
              allHudsHidden
                ? "bg-zinc-800 border-zinc-700 text-zinc-100 font-semibold"
                : "bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Minimize or restore all floating HUD windows on the chart canvas"
          >
            {allHudsHidden ? <Eye className="w-3 h-3 text-zinc-300" /> : <EyeOff className="w-3 h-3" />}
            <span>{allHudsHidden ? "Show HUD" : "Hide HUD"}</span>
          </button>
        </div>
      </div>

      {/* 1B. Simple Chart Drawing Tools Bar (Cursor, Straight H-Line, Square, Type) */}
      <div className="px-3.5 py-1.5 border-b border-zinc-800/80 bg-zinc-950/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1 hidden sm:inline">
            Draw:
          </span>
          <button
            type="button"
            onClick={() => handleSelectTool("cursor")}
            className={`px-2 py-0.5 rounded border transition-colors flex items-center space-x-1 ${
              activeTool === "cursor"
                ? "bg-zinc-800 border-zinc-600 text-zinc-100 font-semibold"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Pan and inspect chart"
          >
            <MousePointer className="w-3 h-3" />
            <span>Cursor</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTool(activeTool === "hline" ? "cursor" : "hline")}
            className={`px-2 py-0.5 rounded border transition-colors flex items-center space-x-1 ${
              activeTool === "hline"
                ? "bg-sky-500/20 border-sky-500/50 text-sky-300 font-semibold"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Click chart to draw a straight horizontal line"
          >
            <Minus className="w-3 h-3" />
            <span>Line</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTool(activeTool === "rect" ? "cursor" : "rect")}
            className={`px-2 py-0.5 rounded border transition-colors flex items-center space-x-1 ${
              activeTool === "rect"
                ? "bg-sky-500/20 border-sky-500/50 text-sky-300 font-semibold"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Drag or click two corners to draw a box/square"
          >
            <Square className="w-3 h-3" />
            <span>Square</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTool(activeTool === "text" ? "cursor" : "text")}
            className={`px-2 py-0.5 rounded border transition-colors flex items-center space-x-1 ${
              activeTool === "text"
                ? "bg-sky-500/20 border-sky-500/50 text-sky-300 font-semibold"
                : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
            title="Click chart to type a note"
          >
            <TypeIcon className="w-3 h-3" />
            <span>Type</span>
          </button>

          {/* 4-Color Dots (styles active/selected drawing or next drawing) */}
          <div className="flex items-center space-x-1 pl-1.5 ml-1 border-l border-zinc-800">
            {(Object.keys(DRAWING_COLOR_PALETTE) as ChartDrawingColor[]).map((col) => {
              const p = DRAWING_COLOR_PALETTE[col];
              const isSelected = (selectedDrawing?.color || drawingColor) === col;
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => handleSelectColor(col)}
                  aria-label={`Drawing color ${p.label}`}
                  title={selectedDrawing ? `Change selected color to ${p.label}` : p.label}
                  className={`w-3.5 h-3.5 rounded-full border transition-transform ${
                    isSelected ? "scale-110 ring-1 ring-white border-white" : "border-zinc-700 opacity-70 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: p.hex }}
                />
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {selectedDrawing && (
            <div className="flex flex-wrap items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-[10px]">
              <span className="text-zinc-300 font-semibold uppercase">
                {selectedDrawing.type === "hline"
                  ? "Line"
                  : selectedDrawing.type === "rect"
                  ? "Square"
                  : "Text"}
              </span>

              {selectedDrawing.type === "hline" && (
                <form onSubmit={handleApplySelectedLinePrice} className="flex items-center space-x-1">
                  <input
                    type="number"
                    step="0.25"
                    value={editingPriceInput}
                    onChange={(e) => setEditingPriceInput(e.target.value)}
                    onBlur={handleApplySelectedLinePrice}
                    className="w-20 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.2 text-[11px] text-zinc-100 font-mono tabular-nums focus:outline-none focus:border-sky-500"
                  />
                </form>
              )}

              {selectedDrawing.type === "text" && (
                <button
                  type="button"
                  onClick={handleOpenEditSelectedText}
                  className="px-1.5 py-0.2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-600"
                >
                  Edit
                </button>
              )}

              <button
                type="button"
                onClick={handleDeleteSelected}
                className="px-1.5 py-0.2 rounded bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 border border-rose-800/70 flex items-center space-x-0.5"
                title="Delete selected object (or press Delete/Backspace)"
              >
                <X className="w-2.5 h-2.5" />
                <span>Delete</span>
              </button>
            </div>
          )}

          {activeTool !== "cursor" && !selectedDrawing && (
            <span className="text-[10px] text-sky-300 hidden sm:inline">
              {activeTool === "hline"
                ? "Click price to place line"
                : activeTool === "rect"
                ? rectDraftStart
                  ? "Click second corner"
                  : "Drag or click 2 corners"
                : "Click chart to type"}
            </span>
          )}
          {!selectedDrawing && activeTool === "cursor" && drawings.length > 0 && (
            <span className="text-[10px] text-zinc-500 hidden xl:inline">
              Click any object to drag, resize, or edit
            </span>
          )}
          {drawings.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleUndoDrawing}
                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 flex items-center space-x-1 transition-colors"
                title="Undo last drawing"
              >
                <Undo2 className="w-3 h-3" />
                <span>Undo</span>
              </button>
              <button
                type="button"
                onClick={handleClearDrawings}
                className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-rose-950/50 border border-zinc-800 hover:border-rose-900/60 text-zinc-400 hover:text-rose-300 flex items-center space-x-1 transition-colors"
                title="Clear all custom drawings"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear ({drawings.length})</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Chart Canvas Container with HUD Overlays */}
      <div
        onMouseDownCapture={handleCanvasMouseDownCapture}
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onPointerMove={handleCanvasPointerMoveCapture}
        onPointerUpCapture={(e) => {
          if (activeDragRef.current) {
            try {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            } catch {}
            commitActiveDrag();
          }
        }}
        onPointerCancelCapture={() => commitActiveDrag()}
        onPointerLeave={() => {
          if (!activeDragRef.current) {
            setChartNavigationEnabled(true);
            if (canvasCursor !== "default") setCanvasCursor("default");
          }
        }}
        onDoubleClick={handleCanvasDoubleClick}
        style={{ cursor: activeTool === "cursor" ? canvasCursor : "crosshair" }}
        className="relative w-full h-[320px] sm:h-[440px] lg:h-[540px] xl:h-[600px] 2xl:h-[660px] bg-[#09090b]"
      >
        {/* Top-Right GEX Regime HUD Card */}
        {layers.gex && brief.gex && !allHudsHidden && (
          <div
            data-chart-hud="true"
            className="absolute top-2 right-2 sm:top-2.5 sm:right-3 z-10 pointer-events-auto flex flex-col items-end space-y-1 max-w-[46%] sm:max-w-xs"
          >
            {isGexMinimized ? (
              <button
                onClick={() => setIsGexMinimized(false)}
                className="px-2.5 py-1 rounded bg-zinc-950/95 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[11px] flex items-center space-x-1.5 shadow-md transition-colors"
                title="Expand Dealer Gamma (GEX) Window"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    brief.gex.netGammaRegime === "POSITIVE_GAMMA" ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
                <span className="font-semibold">
                  GEX: {brief.gex.netGammaRegime === "POSITIVE_GAMMA" ? "+Γ Dampened" : "-Γ Expansion"}
                </span>
                <span className="text-zinc-400 font-normal">
                  Flip: {brief.gex.gammaFlipNq > 0 ? brief.gex.gammaFlipNq.toFixed(0) : "N/A"}
                </span>
                <Plus className="w-3 h-3 text-zinc-400 ml-0.5" />
              </button>
            ) : (
              <div className="p-2.5 rounded bg-zinc-950/95 border border-zinc-800 shadow-xl font-mono text-[11px] space-y-1.5">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-1">
                  <span className="text-zinc-400 font-mono text-[11px] uppercase tracking-wider font-semibold">
                    Dealer Gamma (GEX)
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${
                        brief.gex.netGammaRegime === "POSITIVE_GAMMA"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      }`}
                    >
                      {brief.gex.netGammaRegime === "POSITIVE_GAMMA" ? "+Γ Dampened" : "-Γ Expansion"}
                    </span>
                    <button
                      onClick={() => setIsGexMinimized(true)}
                      className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                      title="Minimize Dealer Gamma window"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] pt-0.5">
                  <div>
                    <div className="text-zinc-500 text-[11px]">γ FLIP</div>
                    <div className="text-zinc-200 font-bold tabular-nums">
                      {brief.gex.gammaFlipNq > 0 ? brief.gex.gammaFlipNq.toFixed(1) : "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500 text-[11px]">CALL WALL</div>
                    <div className="text-emerald-400 font-bold tabular-nums">
                      {brief.gex.callWallNq > 0 ? brief.gex.callWallNq.toFixed(1) : "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500 text-[11px]">PUT WALL</div>
                    <div className="text-rose-400 font-bold tabular-nums">
                      {brief.gex.putWallNq > 0 ? brief.gex.putWallNq.toFixed(1) : "N/A"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60 tabular-nums">
                  <span>0DTE: ${(brief.gex.zeroDteNetGex / 1e6).toFixed(1)}M</span>
                  <span>Basis: {brief.gex.basisRatio.toFixed(3)}x</span>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Top-Left HUD Overlay inside chart container */}
        {!allHudsHidden && (
          <div
            data-chart-hud="true"
            className="absolute top-2 left-2 sm:top-2.5 sm:left-3 z-10 pointer-events-none flex flex-col space-y-1.5 max-w-[52%] sm:max-w-lg"
          >
            {/* Bar OHLC Strip */}
            {isOhlcMinimized ? (
              <button
                onClick={() => setIsOhlcMinimized(false)}
                className="px-2.5 py-1 rounded bg-zinc-950/95 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-[11px] flex items-center space-x-2 shadow-md transition-colors pointer-events-auto self-start"
                title="Expand Bar OHLC Strip"
              >
                <span className="text-zinc-400 font-sans font-semibold">OHLC:</span>
                <span className="text-zinc-400">{quote.symbol}</span>
                <strong className="text-white font-mono">{quote.price.toFixed(2)}</strong>
                <Plus className="w-3 h-3 text-zinc-400 ml-1" />
              </button>
            ) : (
              <div className="p-1.5 px-2.5 rounded bg-zinc-950/95 border border-zinc-800 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-mono tabular-nums shadow-lg pointer-events-auto">
                {crosshairOHLC ? (
                  <>
                    <span className="text-zinc-400">{crosshairOHLC.timeStr}</span>
                    <span className="text-zinc-600">|</span>
                    <span>
                      <strong className="text-zinc-500 font-normal">O:</strong>{" "}
                      <span className="text-zinc-100">{crosshairOHLC.open.toFixed(2)}</span>
                    </span>
                    <span>
                      <strong className="text-zinc-500 font-normal">H:</strong>{" "}
                      <span className="text-zinc-100">{crosshairOHLC.high.toFixed(2)}</span>
                    </span>
                    <span>
                      <strong className="text-zinc-500 font-normal">L:</strong>{" "}
                      <span className="text-zinc-100">{crosshairOHLC.low.toFixed(2)}</span>
                    </span>
                    <span>
                      <strong className="text-zinc-500 font-normal">C:</strong>{" "}
                      <span className="text-zinc-100">{crosshairOHLC.close.toFixed(2)}</span>
                    </span>
                    <span
                      className={`font-semibold ${
                        crosshairOHLC.change >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {crosshairOHLC.change >= 0 ? "+" : ""}
                      {crosshairOHLC.change.toFixed(2)} ({crosshairOHLC.change >= 0 ? "+" : ""}
                      {crosshairOHLC.changePercent.toFixed(2)}%)
                    </span>
                    {freeCursor.price !== null && (
                      <>
                        <span className="text-zinc-600">|</span>
                        <span className="flex items-center space-x-1">
                          <span className="text-zinc-400 font-mono text-[11px] font-semibold">CURSOR:</span>
                          <strong className="text-white font-mono">{freeCursor.price.toFixed(2)}</strong>
                          <span
                            className={`font-mono text-[11px] ${
                              freeCursor.dist! >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            ({freeCursor.dist! >= 0 ? "+" : ""}{freeCursor.dist!.toFixed(1)} pts)
                          </span>
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {freeCursor.price !== null ? (
                      <span className="flex items-center space-x-1.5">
                        <span className="text-zinc-400 font-mono text-[11px] font-semibold">FREE CURSOR:</span>
                        <strong className="text-white font-mono">{freeCursor.price.toFixed(2)}</strong>
                        <span
                          className={`font-mono text-[11px] ${
                            freeCursor.dist! >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          ({freeCursor.dist! >= 0 ? "+" : ""}{freeCursor.dist!.toFixed(1)} pts vs quote)
                        </span>
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-[11px]">Hover crosshair over chart to observe price & OHLC</span>
                    )}
                  </>
                )}

                {/* Latency badge */}
                <span
                  className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-medium border ${
                    isDelayed
                      ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                      : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                  }`}
                >
                  {latencyBadgeText}
                </span>

                {/* Minimize Button */}
                <button
                  onClick={() => setIsOhlcMinimized(true)}
                  className="ml-auto p-0.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                  title="Minimize OHLC strip"
                >
                  <Minus className="w-3 h-3" />
                </button>
              </div>
            )}

          {/* Nearest Structural Levels Magnet / Retrace HUD Pill */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono pointer-events-auto">
            {nearestInfo.nearestMagnet && (
              <div className="px-2 py-0.5 rounded bg-zinc-950/95 border border-zinc-800 text-zinc-300 flex items-center space-x-1.5">
                <span className="text-zinc-500 font-mono text-[11px]">Magnet:</span>
                <strong className="text-rose-400 font-medium">
                  {nearestInfo.nearestMagnet.shortName} ({nearestInfo.nearestMagnet.price.toFixed(1)})
                </strong>
                <span
                  className={
                    nearestInfo.nearestMagnet.distancePoints >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }
                >
                  {nearestInfo.nearestMagnet.distancePoints >= 0 ? "+" : ""}
                  {nearestInfo.nearestMagnet.distancePoints.toFixed(1)} pts
                </span>
              </div>
            )}

            {nearestInfo.nearestRetrace && (
              <div className="px-2 py-0.5 rounded bg-zinc-950/95 border border-zinc-800 text-zinc-300 flex items-center space-x-1.5">
                <span className="text-zinc-500 font-mono text-[11px]">Retrace:</span>
                <strong className="text-emerald-400 font-medium">
                  {nearestInfo.nearestRetrace.shortName} ({nearestInfo.nearestRetrace.price.toFixed(1)})
                </strong>
                <span
                  className={
                    nearestInfo.nearestRetrace.distancePoints >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }
                >
                  {nearestInfo.nearestRetrace.distancePoints >= 0 ? "+" : ""}
                  {nearestInfo.nearestRetrace.distancePoints.toFixed(1)} pts
                </span>
              </div>
            )}

            {/* Focused Level Tag */}
            {focusedLevel && (
              <div className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 flex items-center space-x-1.5">
                <span className="font-mono font-semibold text-[11px] text-zinc-400">★ FOCUSED:</span>
                <span className="font-semibold">{focusedLevel.shortName}</span>
                <span>({focusedLevel.price.toFixed(2)})</span>
                <span className="text-zinc-400">[{focusedLevel.role}]</span>
                {onClearFocusedLevel && (
                  <button
                    onClick={onClearFocusedLevel}
                    className="ml-1 text-zinc-400 hover:text-white"
                    title="Clear level focus"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Lightweight Charts Mount Point */}
        <div ref={containerRef} className="w-full h-full" />

        {/* Transparent Interactive Drawing Overlay (active only when drawing tool selected) */}
        {activeTool !== "cursor" && (
          <div
            onPointerDown={handleDrawingPointerDown}
            onPointerMove={handleDrawingPointerMove}
            onPointerUp={handleDrawingPointerUp}
            onPointerLeave={() => {
              if (!rectDraftStart) {
                userDrawingsPrimitiveRef.current?.setPreview(null, null);
              }
            }}
            className="absolute inset-0 z-20 cursor-crosshair touch-none"
          />
        )}

        {/* Inline Chart Text Input Popover (Type tool) */}
        {pendingTextAnchor && (
          <form
            onSubmit={handleCommitPendingText}
            onClick={(e) => e.stopPropagation()}
            style={{
              left: `clamp(8px, ${Math.round(pendingTextAnchor.screenX)}px, calc(100% - 235px))`,
              top: `clamp(8px, ${Math.round(pendingTextAnchor.screenY - 18)}px, calc(100% - 46px))`
            }}
            className="absolute z-30 flex items-center space-x-1 p-1 rounded bg-zinc-950/95 border border-zinc-700 shadow-xl"
          >
            <input
              ref={textInputRef}
              type="text"
              value={pendingTextValue}
              onChange={(e) => setPendingTextValue(e.target.value)}
              placeholder="Type note..."
              className="w-36 sm:w-44 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              className="px-2 py-1 rounded bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-mono font-semibold"
            >
              {editingTextId ? "Save" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingTextAnchor(null);
                setPendingTextValue("");
                setEditingTextId(null);
              }}
              className="p-1 text-zinc-400 hover:text-zinc-200"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* Bottom TradingView Attribution (Apache-2.0 License Requirement) */}
        <div
          data-chart-hud="true"
          className="absolute bottom-1 right-2 z-10 text-[9px] text-slate-500 font-sans pointer-events-auto"
        >
          <a
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cyan-400 transition-colors flex items-center space-x-1"
            title="Lightweight Charts by TradingView"
          >
            <span>Charts by TradingView</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      {/* 3. Bottom Summary Strip */}
      <div className="px-3.5 py-2 border-t border-zinc-800/80 bg-zinc-950/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400 font-mono">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            <span>Window ({config.retraceWindowRange})</span>
          </span>
          {layers.vwap && (
            <span className="flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>{isTwapMode ? "TWAP" : "VWAP"}</span>
            </span>
          )}
          {layers.liquidity && (
            <>
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <span>ONH ({metrics.onh.toFixed(1)})</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>ONL ({metrics.onl.toFixed(1)})</span>
              </span>
            </>
          )}

          {layers.footprint && brief.footprint && (
            <div className="flex items-center space-x-2 border-l border-zinc-800 pl-2">
              <span className="flex items-center space-x-1">
                <span className="text-[11px] text-zinc-500">CVD:</span>
                <span
                  className={`font-semibold tabular-nums ${
                    brief.footprint.sessionCvd >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {brief.footprint.sessionCvd >= 0 ? "+" : ""}
                  {(brief.footprint.sessionCvd / 1000).toFixed(1)}k
                </span>
              </span>
            </div>
          )}

          {layers.smt && brief.sessionMetrics.smtDivergence?.hasDivergence && (
            <div className="flex items-center space-x-1.5 border-l border-zinc-800 pl-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  brief.sessionMetrics.smtDivergence.direction === "BULLISH"
                    ? "bg-emerald-400"
                    : "bg-rose-400"
                }`}
              />
              <span className="text-[11px]">
                SMT:{" "}
                <strong
                  className={
                    brief.sessionMetrics.smtDivergence.direction === "BULLISH"
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }
                >
                  {brief.sessionMetrics.smtDivergence.divergenceType}
                </strong>
              </span>
            </div>
          )}
        </div>

        <span className="text-zinc-500 text-[11px]">
          {timezone} ({timezoneCode})
        </span>
      </div>
    </div>
  );
}

export { MinBookChart as OpenPulseChart };
