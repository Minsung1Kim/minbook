"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
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
  ISeriesMarkersPluginApi,
  Time,
  UTCTimestamp,
  SeriesMarker
} from "lightweight-charts";
import { TradeLogEntry } from "../../types/app";
import { OHLCVBar } from "../../types/market";
import { RiskBoxPrimitive } from "../chart/RiskBoxPrimitive";
import { VerticalTimeHighlightPrimitive } from "../chart/primitives";
import { formatETDateTime, sanitizeCandleBars, computeCumulativeVWAP } from "../chart/MinBookChart";
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  FastForward,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  Maximize2
} from "lucide-react";

export interface TradeReplayChartProps {
  trade: TradeLogEntry;
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// Deterministic Synthetic Bar Generator for Offline / Historical Trades
// ---------------------------------------------------------------------------
export function generateSyntheticSessionBars(trade: TradeLogEntry): OHLCVBar[] {
  // Parse trade date YYYY-MM-DD
  const dateParts = trade.tradeDate.split("-").map((n) => parseInt(n, 10));
  const year = dateParts[0] || 2026;
  const month = (dateParts[1] || 11) - 1;
  const day = dateParts[2] || 20;

  // Start at 08:30:00 ET, end at 10:30:00 ET (120 1-minute bars)
  // Compute UTC timestamp corresponding to 08:30 ET
  // In standard America/New_York (UTC-5 in winter, UTC-4 in summer)
  const isDST = month >= 2 && month <= 10;
  const utcOffsetHours = isDST ? 4 : 5;

  const startUtcMs = Date.UTC(year, month, day, 8 + utcOffsetHours, 30, 0);

  const entry = trade.entryPrice;
  const stop = trade.stopPrice;
  const exit = trade.exitPrice;
  const riskPts = Math.max(1, Math.abs(entry - stop));
  const isLong = trade.direction === "LONG";

  const worst =
    trade.worstPrice !== undefined
      ? trade.worstPrice
      : isLong
      ? entry - (trade.maeR || 0.25) * riskPts
      : entry + (trade.maeR || 0.25) * riskPts;

  const best =
    trade.bestPrice !== undefined
      ? trade.bestPrice
      : isLong
      ? entry + (trade.mfeR || Math.max(0.5, trade.actualPnlR)) * riskPts
      : entry - (trade.mfeR || Math.max(0.5, trade.actualPnlR)) * riskPts;

  const bars: OHLCVBar[] = [];
  const totalMinutes = 121; // 08:30 to 10:30 inclusive

  // Key minute milestones (relative to 08:30 = minute 0):
  // Min 60 = 09:30 ET (Open)
  // Min 64 = 09:34 ET (Entry tapped)
  // Min 68 = 09:38 ET (Worst price / MAE trough)
  // Min 80 = 09:50 ET (Best price / MFE peak)
  // Min 88 = 09:58 ET (Exit price reached)
  // Min 120 = 10:30 ET (Post-session drift)

  let curPrice = entry + (isLong ? 2.5 : -2.5);

  for (let m = 0; m < totalMinutes; m++) {
    const barTimeMs = startUtcMs + m * 60 * 1000;
    const barOpen = curPrice;
    let targetForBar = curPrice;

    if (m < 60) {
      // 08:30 - 09:29: Pre-market drift around equilibrium
      const phase = Math.sin((m / 60) * Math.PI * 2);
      targetForBar = entry + phase * (riskPts * 0.4);
    } else if (m < 64) {
      // 09:30 - 09:33: Opening drive sweep
      targetForBar = isLong ? entry + riskPts * 0.5 : entry - riskPts * 0.5;
    } else if (m === 64) {
      // 09:34: Retrace tap into entry level
      targetForBar = entry;
    } else if (m <= 68) {
      // 09:35 - 09:38: Adverse excursion / shakeout towards worst price
      const prog = (m - 64) / 4;
      targetForBar = entry + (worst - entry) * prog;
    } else if (m <= 80) {
      // 09:39 - 09:50: Strong trend impulse towards best price
      const prog = (m - 68) / 12;
      targetForBar = worst + (best - worst) * prog;
    } else if (m <= 88) {
      // 09:51 - 09:58: Consolidation / exit run
      const prog = (m - 80) / 8;
      targetForBar = best + (exit - best) * prog;
    } else {
      // 09:59 - 10:30: Post-exit session drift
      const offset = (m - 88) * 0.15;
      targetForBar = exit + (isLong ? offset : -offset);
    }

    const noise = (Math.sin(m * 17) + Math.cos(m * 31)) * 0.35;
    const barClose = Math.round((targetForBar + noise) * 100) / 100;
    const barHigh = Math.round((Math.max(barOpen, barClose) + Math.abs(noise) + 0.5) * 100) / 100;
    const barLow = Math.round((Math.min(barOpen, barClose) - Math.abs(noise) - 0.5) * 100) / 100;
    const barVolume = Math.round(500 + Math.abs(Math.sin(m)) * 2500);

    bars.push({
      timestamp: new Date(barTimeMs).toISOString(),
      open: barOpen,
      high: barHigh,
      low: barLow,
      close: barClose,
      volume: barVolume
    });

    curPrice = barClose;
  }

  return bars;
}

export default function TradeReplayChart({ trade, onClose }: TradeReplayChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line", Time> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const riskBoxRef = useRef<RiskBoxPrimitive | null>(null);
  const verticalBoxRef = useRef<VerticalTimeHighlightPrimitive | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2>(1);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Parse or synthesize all session bars
  const allBars = useMemo<OHLCVBar[]>(() => {
    if (trade.sessionBarsJson) {
      try {
        const parsed = JSON.parse(trade.sessionBarsJson);
        if (Array.isArray(parsed) && parsed.length > 5) {
          return parsed;
        }
      } catch (e) {
        console.warn("Could not parse trade.sessionBarsJson, using synthetic fallback:", e);
      }
    }
    return generateSyntheticSessionBars(trade);
  }, [trade]);

  // Derived timestamps for key trade events
  const eventTimestamps = useMemo(() => {
    // 09:30 open bar is at 60 minutes into 08:30 start
    const openBarIdx = Math.min(60, Math.floor(allBars.length * 0.5));
    const entryBarIdx = Math.min(64, Math.floor(allBars.length * 0.53));
    const worstBarIdx = Math.min(68, Math.floor(allBars.length * 0.56));
    const bestBarIdx = Math.min(80, Math.floor(allBars.length * 0.66));
    const exitBarIdx = Math.min(88, Math.floor(allBars.length * 0.73));

    const getTimeSec = (idx: number) => {
      if (idx >= 0 && idx < allBars.length) {
        return Math.floor(new Date(allBars[idx].timestamp).getTime() / 1000);
      }
      return 0;
    };

    return {
      openTimeSec: getTimeSec(openBarIdx),
      entryTimeSec: getTimeSec(entryBarIdx),
      worstTimeSec: getTimeSec(worstBarIdx),
      bestTimeSec: getTimeSec(bestBarIdx),
      exitTimeSec: getTimeSec(exitBarIdx),
      entryBarIdx,
      exitBarIdx
    };
  }, [allBars]);

  // Point value and sizing
  const pointValue = trade.symbol === "NQ" ? 20 : 2;
  const contracts = trade.contracts || 1;
  const isLong = trade.direction === "LONG";
  const stopPts = Math.abs(trade.entryPrice - trade.stopPrice);
  const targetPts = Math.abs(trade.targetPrice - trade.entryPrice);
  const rawRR = stopPts > 0 ? targetPts / stopPts : 2.2;

  // Initialize Lightweight Charts v5
  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = containerRef.current;
    const initialWidth = container.clientWidth || 700;
    const initialHeight = 420;

    const chart = createChart(container, {
      width: initialWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#090d16" },
        textColor: "#94a3b8",
        fontFamily: "monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, sans-serif",
        fontSize: 11
      },
      grid: {
        vertLines: { color: "rgba(30, 41, 59, 0.45)", style: LineStyle.Dotted },
        horzLines: { color: "rgba(30, 41, 59, 0.45)", style: LineStyle.Dotted }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(56, 189, 248, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#0f172a"
        },
        horzLine: {
          color: "rgba(56, 189, 248, 0.4)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#0f172a"
        }
      },
      rightPriceScale: {
        borderColor: "#1e293b",
        scaleMargins: { top: 0.12, bottom: 0.12 },
        autoScale: true
      },
      timeScale: {
        borderColor: "#1e293b",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 10,
        barSpacing: 8,
        tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) => {
          const tsSec = typeof time === "number" ? time : typeof time === "string" ? new Date(time).getTime() / 1000 : 0;
          const d = new Date(tsSec * 1000);
          return d.toLocaleTimeString("en-US", {
            timeZone: "America/New_York",
            hour12: false,
            hour: "2-digit",
            minute: "2-digit"
          });
        }
      },
      localization: {
        locale: "en-US",
        dateFormat: "yyyy-MM-dd",
        timeFormatter: (time: Time) => formatETDateTime(time)
      }
    });

    chartRef.current = chart;

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderUpColor: "#10b981",
      borderDownColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: { type: "price", precision: 2, minMove: 0.25 }
    });
    candleSeriesRef.current = candleSeries;

    // 2. VWAP Series
    const vwapSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "Session VWAP"
    });
    vwapSeriesRef.current = vwapSeries;

    // 3. Custom Canvas Primitives: Risk Box & Session Window Highlight
    const riskBox = new RiskBoxPrimitive();
    candleSeries.attachPrimitive(riskBox);
    riskBoxRef.current = riskBox;

    // Populate Risk Box
    riskBox.setData({
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      stopPrice: trade.stopPrice,
      targetPrice: trade.targetPrice,
      stopPts,
      targetPts,
      rawRR,
      contracts: trade.contracts,
      instrument: trade.symbol,
      visible: true
    });

    const vertBox = new VerticalTimeHighlightPrimitive();
    candleSeries.attachPrimitive(vertBox);
    vertBox.setBars(allBars);
    verticalBoxRef.current = vertBox;

    // 4. Responsive ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && chartRef.current) {
        chartRef.current.applyOptions({
          width,
          height: height > 200 ? height : 420
        });
      }
    });
    resizeObserver.observe(container);

    // Initial setup: start at entry bar or full session
    setCurrentIndex(allBars.length - 1);

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
      riskBoxRef.current = null;
      verticalBoxRef.current = null;
    };
  }, [trade, allBars, stopPts, targetPts, rawRR]);

  // Update visible bars and markers whenever currentIndex changes
  useEffect(() => {
    if (!candleSeriesRef.current || !vwapSeriesRef.current || allBars.length === 0) return;

    const visibleBars = allBars.slice(0, currentIndex + 1);
    const sanitizedCandles = sanitizeCandleBars(visibleBars);
    if (sanitizedCandles.length === 0) return;

    candleSeriesRef.current.setData(sanitizedCandles);

    // Compute running VWAP on visible bars
    const vwapData = computeCumulativeVWAP(visibleBars, false);
    vwapSeriesRef.current.setData(vwapData);

    // Build Event Markers visible up to current bar timestamp
    const currentBarTimeSec = sanitizedCandles[sanitizedCandles.length - 1].time as number;
    const markers: SeriesMarker<Time>[] = [];

    // Opening Bell Marker (09:30 ET)
    if (eventTimestamps.openTimeSec > 0 && currentBarTimeSec >= eventTimestamps.openTimeSec) {
      markers.push({
        time: eventTimestamps.openTimeSec as UTCTimestamp,
        position: "aboveBar",
        color: "#38bdf8",
        shape: "arrowDown",
        text: "09:30 OPEN"
      });
    }

    // Trade Entry Marker
    if (eventTimestamps.entryTimeSec > 0 && currentBarTimeSec >= eventTimestamps.entryTimeSec) {
      markers.push({
        time: eventTimestamps.entryTimeSec as UTCTimestamp,
        position: isLong ? "belowBar" : "aboveBar",
        color: isLong ? "#10b981" : "#f43f5e",
        shape: isLong ? "arrowUp" : "arrowDown",
        text: `ENTRY ${trade.entryPrice.toFixed(2)}`
      });
    }

    // MAE Heat Pin Marker
    if (eventTimestamps.worstTimeSec > 0 && currentBarTimeSec >= eventTimestamps.worstTimeSec) {
      markers.push({
        time: eventTimestamps.worstTimeSec as UTCTimestamp,
        position: isLong ? "belowBar" : "aboveBar",
        color: "#f59e0b",
        shape: "square",
        text: `MAE -${trade.maeR.toFixed(2)}R`
      });
    }

    // MFE Peak Pin Marker
    if (eventTimestamps.bestTimeSec > 0 && currentBarTimeSec >= eventTimestamps.bestTimeSec) {
      markers.push({
        time: eventTimestamps.bestTimeSec as UTCTimestamp,
        position: isLong ? "aboveBar" : "belowBar",
        color: "#10b981",
        shape: "square",
        text: `MFE +${trade.mfeR.toFixed(2)}R`
      });
    }

    // Trade Exit Marker
    if (eventTimestamps.exitTimeSec > 0 && currentBarTimeSec >= eventTimestamps.exitTimeSec) {
      const isWin = trade.actualPnlR >= 0;
      markers.push({
        time: eventTimestamps.exitTimeSec as UTCTimestamp,
        position: isWin ? "aboveBar" : "belowBar",
        color: isWin ? "#10b981" : "#f43f5e",
        shape: "circle",
        text: `EXIT ${isWin ? "+" : ""}${trade.actualPnlR.toFixed(2)}R ($${trade.actualPnlDollars >= 0 ? "+" : ""}${trade.actualPnlDollars.toFixed(0)})`
      });
    }

    // Ascending sort required
    markers.sort((a, b) => Number(a.time) - Number(b.time));

    if (markersPluginRef.current) {
      try {
        markersPluginRef.current.setMarkers(markers);
      } catch {
        markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
      }
    } else {
      markersPluginRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
    }
  }, [currentIndex, allBars, eventTimestamps, trade, isLong]);

  // Playback timer loop
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = playbackSpeed === 2 ? 250 : 500;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= allBars.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, allBars.length]);

  // Live HUD calculations at currentIndex
  const currentBar = allBars[currentIndex] || allBars[0];
  const curClose = currentBar ? currentBar.close : trade.entryPrice;
  const isPreEntry = currentIndex < eventTimestamps.entryBarIdx;
  const isPostExit = currentIndex >= eventTimestamps.exitBarIdx;
  const isInTrade = !isPreEntry && !isPostExit;

  const runningPts = isLong ? curClose - trade.entryPrice : trade.entryPrice - curClose;
  const runningDollars = runningPts * pointValue * contracts;
  const runningR = stopPts > 0 ? runningPts / stopPts : 0;

  return (
    <div className="rounded-lg bg-[#0b0f19] border border-cyan-900/60 shadow-xl overflow-hidden flex flex-col font-sans">
      {/* 1. Replay Header */}
      <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2.5">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-white tracking-tight">
            Visual Trade Replay Player
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
            {trade.tradeDate} • {trade.symbol}
          </span>
          <span
            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
              trade.direction === "LONG"
                ? "bg-emerald-950 text-emerald-400 border border-emerald-800/80"
                : "bg-rose-950 text-rose-400 border border-rose-800/80"
            }`}
          >
            {trade.direction}
          </span>
          <span className="text-slate-400 font-mono text-[11px]">
            Retrace: {trade.retraceLevelUsed}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-[11px] font-mono text-slate-400">
            Realized:{" "}
            <strong
              className={
                trade.actualPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"
              }
            >
              ${trade.actualPnlDollars >= 0 ? "+" : ""}
              {trade.actualPnlDollars.toFixed(0)} ({trade.actualPnlR >= 0 ? "+" : ""}
              {trade.actualPnlR.toFixed(2)}R)
            </strong>
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* 2. Chart Canvas Container with Running HUD */}
      <div className="relative w-full h-[400px] bg-[#090d16]">
        {/* Floating Running HUD Card */}
        <div className="absolute top-2.5 left-3 z-10 pointer-events-none flex flex-col space-y-1">
          <div className="p-2 px-3 rounded bg-slate-950/90 backdrop-blur-xs border border-slate-800/90 shadow-xl font-mono text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-slate-400 font-sans text-[10px]">
              {formatETDateTime(new Date(currentBar.timestamp).getTime() / 1000)}
            </span>
            <span className="text-slate-600">|</span>
            <span>
              <span className="text-slate-400 font-sans text-[10px]">PRICE:</span>{" "}
              <strong className="text-white">{curClose.toFixed(2)}</strong>
            </span>
            <span className="text-slate-600">|</span>

            {isPreEntry && (
              <span className="text-amber-400 font-medium font-sans text-[10px] flex items-center space-x-1">
                <span>PRE-ENTRY: Waiting for Retrace to {trade.entryPrice.toFixed(2)}</span>
              </span>
            )}

            {isInTrade && (
              <span className="flex items-center space-x-2">
                <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[9px] font-bold animate-pulse">
                  TRADE ACTIVE
                </span>
                <span
                  className={`font-bold ${
                    runningDollars >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {runningDollars >= 0 ? "+" : ""}
                  ${runningDollars.toFixed(0)} ({runningR >= 0 ? "+" : ""}
                  {runningR.toFixed(2)}R • {runningPts >= 0 ? "+" : ""}
                  {runningPts.toFixed(1)} pts)
                </span>
              </span>
            )}

            {isPostExit && (
              <span className="flex items-center space-x-1.5">
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[9px] font-semibold">
                  TRADE CLOSED
                </span>
                <span
                  className={`font-bold ${
                    trade.actualPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  Final: ${trade.actualPnlDollars >= 0 ? "+" : ""}
                  {trade.actualPnlDollars.toFixed(0)} ({trade.actualPnlR >= 0 ? "+" : ""}
                  {trade.actualPnlR.toFixed(2)}R)
                </span>
              </span>
            )}
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-slate-300">
              Entry: <strong className="text-white">{trade.entryPrice.toFixed(2)}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-rose-300">
              Stop: <strong className="text-rose-400">{trade.stopPrice.toFixed(2)}</strong> (-{stopPts.toFixed(1)} pts)
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-emerald-300">
              Target: <strong className="text-emerald-400">{trade.targetPrice.toFixed(2)}</strong> (+{targetPts.toFixed(1)} pts)
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-amber-300">
              MAE: <strong>-{trade.maeR.toFixed(2)}R</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-emerald-300">
              MFE: <strong>+{trade.mfeR.toFixed(2)}R</strong>
            </span>
          </div>
        </div>

        {/* Lightweight Charts Canvas Element */}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* 3. Replay Scrubber & Control Bar */}
      <div className="px-4 py-3 bg-slate-900/90 border-t border-slate-800 flex flex-col space-y-2">
        {/* Timeline Slider */}
        <div className="flex items-center space-x-3">
          <span className="text-[10px] font-mono text-slate-400 w-12 text-left">
            Bar {currentIndex + 1}/{allBars.length}
          </span>
          <input
            type="range"
            min={0}
            max={allBars.length - 1}
            value={currentIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentIndex(parseInt(e.target.value, 10));
            }}
            className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300"
          />
          <span className="text-[10px] font-mono text-slate-400 w-16 text-right">
            {formatETDateTime(new Date(currentBar.timestamp).getTime() / 1000).split(" ")[1]}
          </span>
        </div>

        {/* Buttons Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {/* Left: Step Controls */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentIndex(0);
              }}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Reset to 08:30 AM"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentIndex((prev) => Math.max(0, prev - 1));
              }}
              disabled={currentIndex <= 0}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 hover:text-white text-[11px] font-medium flex items-center space-x-1 transition-colors"
              title="Step -1 Bar"
            >
              <SkipBack className="w-3 h-3" />
              <span>-1 Bar</span>
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-3 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] flex items-center space-x-1.5 transition-colors shadow-xs"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isPlaying ? "Pause" : "Play Replay"}</span>
            </button>

            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentIndex((prev) => Math.min(allBars.length - 1, prev + 1));
              }}
              disabled={currentIndex >= allBars.length - 1}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 hover:text-white text-[11px] font-medium flex items-center space-x-1 transition-colors"
              title="Step +1 Bar"
            >
              <span>+1 Bar</span>
              <SkipForward className="w-3 h-3" />
            </button>

            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentIndex(allBars.length - 1);
              }}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-medium flex items-center space-x-1 transition-colors"
              title="Jump to Full Session"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Full Session</span>
            </button>
          </div>

          {/* Right: Playback Speed & Event Jump Shortcuts */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPlaybackSpeed((s) => (s === 1 ? 2 : 1))}
              className="px-2 py-0.8 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 text-[10px] font-mono transition-colors"
            >
              {playbackSpeed}x Speed
            </button>

            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentIndex(eventTimestamps.entryBarIdx);
              }}
              className="px-2 py-0.8 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono transition-colors"
            >
              Jump to Entry
            </button>

            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentIndex(eventTimestamps.exitBarIdx);
              }}
              className="px-2 py-0.8 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono transition-colors"
            >
              Jump to Exit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
