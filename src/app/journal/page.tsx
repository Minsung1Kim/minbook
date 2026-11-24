"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { TradeLogEntry, JournalAnalytics } from "@/types/app";
import { OpenBriefData } from "@/types/market";
import {
  BookOpen,
  PlusCircle,
  Trash2,
  HelpCircle,
  ShieldAlert,
  CheckCircle2,
  Bot,
  PlayCircle,
  ImageIcon,
  X,
  ExternalLink,
} from "lucide-react";
import { DailyPrediction, PredictionGrade } from "@/types/calibration";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const TradeReplayChart = dynamic(
  () => import("@/components/journal/TradeReplayChart"),
  { ssr: false }
);

export function JournalPage() {
  const [symbol, setSymbol] = useState<"NQ" | "MNQ">("NQ");
  const [trades, setTrades] = useState<TradeLogEntry[]>([]);
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
  const [currentBrief, setCurrentBrief] = useState<OpenBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogForm, setShowLogForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Screenshot state (Drop / Cmd+V Paste bar)
  const [screenshotData, setScreenshotData] = useState<string | null>(null);

  // Selected trade for right-side Sheet drawer
  const [selectedTrade, setSelectedTrade] = useState<TradeLogEntry | null>(null);

  // Form states
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split("T")[0]);
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [worstPrice, setWorstPrice] = useState("");
  const [bestPrice, setBestPrice] = useState("");
  const [maeR, setMaeR] = useState("");
  const [mfeR, setMfeR] = useState("");
  const [stoppedOut, setStoppedOut] = useState(false);
  const [retraceLevelUsed, setRetraceLevelUsed] = useState("");
  const [notes, setNotes] = useState("");
  const [auditMap, setAuditMap] = useState<
    Record<string, { prediction: DailyPrediction; grade: PredictionGrade | null }>
  >({});

  // Check for planned trade forwarded from chart
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("minbook_planned_trade") || sessionStorage.getItem("openpulse_planned_trade");
      if (stored) {
        const p = JSON.parse(stored);
        if (p.symbol) setSymbol(p.symbol);
        if (p.direction) setDirection(p.direction);
        if (p.entryPrice) setEntryPrice(p.entryPrice.toString());
        if (p.stopPrice) setStopPrice(p.stopPrice.toString());
        if (p.targetPrice) setTargetPrice(p.targetPrice.toString());
        if (p.retraceLevelUsed) setRetraceLevelUsed(p.retraceLevelUsed);
        if (p.notes) setNotes(p.notes);
        setShowLogForm(true);
        sessionStorage.removeItem("minbook_planned_trade");
        sessionStorage.removeItem("openpulse_planned_trade");
      }
    } catch (e) {
      console.warn("Could not load planned trade from sessionStorage:", e);
    }
  }, []);

  // Handle Screenshot Paste (Cmd+V)
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              setScreenshotData(event.target.result as string);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setScreenshotData(event.target.result as string);
        }
      };
      reader.readAsDataURL(files[0]);
    }
  };

  const fetchJournal = async () => {
    try {
      const res = await fetch("/api/journal");
      const json = await res.json();
      if (json.success) {
        setTrades(json.trades || []);
        setAnalytics(json.analytics || null);
      }

      const auditRes = await fetch("/api/calibration/audit");
      const auditJson = await auditRes.json();
      if (auditJson.success && auditJson.data?.history) {
        const map: Record<string, { prediction: DailyPrediction; grade: PredictionGrade | null }> = {};
        for (const item of auditJson.data.history) {
          map[item.prediction.targetTradeDate] = item;
        }
        setAuditMap(map);
      }
    } catch (err) {
      console.error("fetchJournal error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMarketDataForSnapshot = async () => {
    try {
      const res = await fetch(`/api/market-data?symbol=${symbol}`);
      const json = await res.json();
      if (json.success && json.data) {
        setCurrentBrief(json.data);
      }
    } catch {}
  };

  useEffect(() => {
    fetchJournal();
    fetchMarketDataForSnapshot();
  }, [symbol]);

  // Dynamic MAE/MFE calculation
  useEffect(() => {
    const entry = parseFloat(entryPrice);
    const stop = parseFloat(stopPrice);
    const exit = parseFloat(exitPrice);
    const worst = parseFloat(worstPrice);
    const best = parseFloat(bestPrice);

    if (!isNaN(entry) && !isNaN(stop)) {
      const riskPts = Math.abs(entry - stop);
      if (riskPts > 0) {
        if (!isNaN(worst)) {
          const maePts = direction === "LONG" ? Math.max(0, entry - worst) : Math.max(0, worst - entry);
          setMaeR((maePts / riskPts).toFixed(2));
        } else if (stoppedOut) {
          setMaeR("1.00");
        }

        if (!isNaN(best)) {
          const mfePts = direction === "LONG" ? Math.max(0, best - entry) : Math.max(0, entry - best);
          setMfeR((mfePts / riskPts).toFixed(2));
        } else if (!isNaN(exit)) {
          const actualPts = direction === "LONG" ? exit - entry : entry - exit;
          if (actualPts > 0) {
            setMfeR((actualPts / riskPts).toFixed(2));
          }
        }
      }
    }
  }, [entryPrice, stopPrice, exitPrice, worstPrice, bestPrice, direction, stoppedOut]);

  const handleCreateTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const plannedRiskPts = Math.abs(parseFloat(entryPrice) - parseFloat(stopPrice));
    const plannedTargetPts = Math.abs(parseFloat(targetPrice) - parseFloat(entryPrice));
    const pointValue = symbol === "NQ" ? 20 : 2;

    const plannedRiskDollars = plannedRiskPts * pointValue;
    const plannedTargetDollars = plannedTargetPts * pointValue;

    const actualPts =
      direction === "LONG"
        ? parseFloat(exitPrice) - parseFloat(entryPrice)
        : parseFloat(entryPrice) - parseFloat(exitPrice);

    const actualPnlDollars = actualPts * pointValue;
    const actualPnlR = plannedRiskPts > 0 ? Number((actualPts / plannedRiskPts).toFixed(2)) : 0;

    const payload = {
      tradeDate,
      symbol,
      direction,
      entryPrice: parseFloat(entryPrice),
      stopPrice: parseFloat(stopPrice),
      targetPrice: parseFloat(targetPrice),
      exitPrice: parseFloat(exitPrice),
      worstPrice: worstPrice ? parseFloat(worstPrice) : undefined,
      bestPrice: bestPrice ? parseFloat(bestPrice) : undefined,
      plannedRiskDollars,
      plannedTargetDollars,
      actualPnlDollars,
      actualPnlR,
      maeR: parseFloat(maeR) || (stoppedOut ? 1.0 : 0.25),
      mfeR: parseFloat(mfeR) || Math.max(0, actualPnlR),
      stoppedOut,
      retraceLevelUsed: retraceLevelUsed || "Session VWAP",
      notes: notes + (screenshotData ? " [Screenshot Attached]" : ""),
      vxnSnapshot: currentBrief?.macro?.volatilitySurface?.vxn,
      termRatioSnapshot: currentBrief?.macro?.volatilitySurface?.termRatio,
      vvixSnapshot: currentBrief?.macro?.volatilitySurface?.vvix,
      vrpSnapshot: currentBrief?.macro?.volatilitySurface?.vrp,
      inventoryPercentSnapshot: currentBrief?.sessionMetrics?.inventoryPercent,
      smtSnapshot: currentBrief?.sessionMetrics?.smtDivergence?.divergenceType,
      biasVerdictSnapshot: currentBrief?.bias?.verdict,
      sessionBarsJson:
        currentBrief?.intradayBars && currentBrief.intradayBars.length > 0
          ? JSON.stringify(currentBrief.intradayBars)
          : undefined,
      screenshotData: screenshotData || undefined,
    };

    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setShowLogForm(false);
        setEntryPrice("");
        setStopPrice("");
        setTargetPrice("");
        setExitPrice("");
        setWorstPrice("");
        setBestPrice("");
        setMaeR("");
        setMfeR("");
        setNotes("");
        setStoppedOut(false);
        setScreenshotData(null);
        fetchJournal();
      }
    } catch (err) {
      console.error("handleCreateTrade error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTrade = async (id: string) => {
    if (!confirm("Delete this journal trade?")) return;
    try {
      const res = await fetch(`/api/journal?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        if (selectedTrade?.id === id) {
          setSelectedTrade(null);
        }
        fetchJournal();
      }
    } catch (err) {
      console.error("handleDeleteTrade error:", err);
    }
  };

  const totalNetPnl = analytics?.totalPnlDollars ?? 0;
  const winRate = analytics?.winRatePercent ?? 0;
  const avgR = analytics?.avgPnlR ?? 0;
  const avgWinnerMae = analytics?.avgMaeWinningTradesR ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Header selectedInstrument={symbol} onSelectInstrument={(inst) => setSymbol(inst)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 space-y-3.5">
        {/* 1. COMPACT 1-LINE SUMMARY BAR */}
        <div className="px-4 py-3 rounded-lg bg-zinc-900/70 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <span className="text-zinc-500 uppercase text-[10px] block">Net P&L</span>
              <span
                className={`text-sm font-bold tabular-nums ${
                  totalNetPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                ${totalNetPnl >= 0 ? "+" : ""}
                {totalNetPnl.toLocaleString()}
              </span>
            </div>

            <div className="border-l border-zinc-800/80 pl-4">
              <span className="text-zinc-500 uppercase text-[10px] block">Win Rate</span>
              <span className="text-sm font-bold tabular-nums text-zinc-100">
                {winRate.toFixed(1)}%
              </span>
            </div>

            <div className="border-l border-zinc-800/80 pl-4">
              <span className="text-zinc-500 uppercase text-[10px] block">Avg R</span>
              <span className="text-sm font-bold tabular-nums text-zinc-100">
                {avgR >= 0 ? "+" : ""}
                {avgR.toFixed(2)}R
              </span>
            </div>

            <div className="border-l border-zinc-800/80 pl-4">
              <span className="text-zinc-500 uppercase text-[10px] block">Avg Winner MAE</span>
              <span className="text-sm font-bold tabular-nums text-amber-400">
                {avgWinnerMae.toFixed(2)}R
              </span>
            </div>

            <div className="border-l border-zinc-800/80 pl-4">
              <span className="text-zinc-500 uppercase text-[10px] block">Trades</span>
              <span className="text-sm font-bold tabular-nums text-zinc-100">
                {trades.length}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2 font-sans">
            <button
              onClick={() => setShowLogForm(!showLogForm)}
              className="px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-white text-zinc-900 font-semibold text-xs transition-colors flex items-center space-x-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{showLogForm ? "Cancel" : "Log Trade"}</span>
            </button>
          </div>
        </div>

        {/* MAE Sample Calibration Banner */}
        {analytics?.sampleSizeGate && (
          <div className="px-4 py-2 rounded-lg bg-zinc-900/50 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center space-x-2">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${analytics.sampleSizeGate.isCalibrated ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
                {analytics.sampleSizeGate.isCalibrated ? "CALIBRATED" : "COLLECTING"}
              </span>
              <span className="text-zinc-400 text-[11px]">{analytics.sampleSizeGate.statusMessage}</span>
            </div>
            {analytics.upper90BootstrapMaeWinners !== undefined && (
              <span className="text-zinc-300 text-[11px]">
                Upper 90% Bootstrap P90 MAE: <strong className="text-amber-400">{analytics.upper90BootstrapMaeWinners.toFixed(2)}R</strong>
              </span>
            )}
          </div>
        )}

        {/* 2. SLIM QUIET 1-SCREENSHOT DROP / CMD+V PASTE BAR */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border border-dashed border-zinc-800/80 hover:border-zinc-700 bg-zinc-950/40 hover:bg-zinc-900/30 rounded-lg p-2.5 transition-colors text-center cursor-pointer group"
        >
          {screenshotData ? (
            <div className="flex items-center justify-between px-2 text-xs font-mono">
              <div className="flex items-center space-x-2">
                <img
                  src={screenshotData}
                  alt="Screenshot preview"
                  className="w-8 h-8 object-cover rounded border border-zinc-700"
                />
                <span className="text-zinc-300 font-medium">Chart Screenshot Attached</span>
                <span className="text-zinc-500 text-[10px]">(Will attach to trade)</span>
              </div>
              <button
                type="button"
                onClick={() => setScreenshotData(null)}
                className="text-zinc-500 hover:text-zinc-200 p-1"
                title="Remove screenshot"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center space-x-2 text-xs text-zinc-500 font-mono">
              <ImageIcon className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300" />
              <span>
                Drop screenshot or press <kbd className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400">Cmd+V</kbd> to attach chart
              </span>
            </div>
          )}
        </div>

        {/* Collapsible Log Trade Form */}
        {showLogForm && (
          <form
            onSubmit={handleCreateTrade}
            className="p-4 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-3.5 text-xs font-mono"
          >
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <span className="text-zinc-200 font-semibold text-xs font-sans">
                Log Morning Session Trade
              </span>
              <span className="text-zinc-500 text-[11px]">
                {symbol} ({symbol === "NQ" ? "$20/pt" : "$2/pt"})
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">Date</label>
                <input
                  type="date"
                  value={tradeDate}
                  onChange={(e) => setTradeDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 font-mono text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Direction</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "LONG" | "SHORT")}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 font-medium text-xs"
                >
                  <option value="LONG">LONG (Bullish)</option>
                  <option value="SHORT">SHORT (Bearish)</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Entry Price</label>
                <input
                  type="number"
                  step="0.25"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 tabular-nums text-xs"
                  placeholder="e.g. 21100.00"
                  required
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Planned Stop</label>
                <input
                  type="number"
                  step="0.25"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-rose-400 tabular-nums text-xs"
                  placeholder="e.g. 21085.00"
                  required
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Planned Target</label>
                <input
                  type="number"
                  step="0.25"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-emerald-400 tabular-nums text-xs"
                  placeholder="e.g. 21150.00"
                  required
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Exit Price</label>
                <input
                  type="number"
                  step="0.25"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 tabular-nums text-xs"
                  placeholder="e.g. 21145.00"
                  required
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Worst Price (MAE)</label>
                <input
                  type="number"
                  step="0.25"
                  value={worstPrice}
                  onChange={(e) => setWorstPrice(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-rose-400 tabular-nums text-xs"
                  placeholder="e.g. 21095.00"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Best Price (MFE)</label>
                <input
                  type="number"
                  step="0.25"
                  value={bestPrice}
                  onChange={(e) => setBestPrice(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-emerald-400 tabular-nums text-xs"
                  placeholder="e.g. 21155.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">Retrace Level Used</label>
                <input
                  type="text"
                  value={retraceLevelUsed}
                  onChange={(e) => setRetraceLevelUsed(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-zinc-200 text-xs"
                  placeholder="e.g. Session VWAP"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-zinc-200 text-xs"
                  placeholder="e.g. Tapped VWAP after 9:34 AM drive."
                />
              </div>

              <div className="flex items-center space-x-2 pt-4">
                <input
                  type="checkbox"
                  id="stoppedOut"
                  checked={stoppedOut}
                  onChange={(e) => setStoppedOut(e.target.checked)}
                  className="w-4 h-4 accent-rose-500 rounded bg-zinc-950 border border-zinc-800"
                />
                <label htmlFor="stoppedOut" className="text-zinc-300 text-xs font-sans cursor-pointer">
                  Full Stop Hit
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-800/80 font-sans">
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-1 rounded bg-zinc-100 hover:bg-white text-zinc-900 font-semibold text-xs transition-colors disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save Trade"}
              </button>
            </div>
          </form>
        )}

        {/* 3. ULTRA-CLEAN 1-ROW-PER-DAY LEDGER TABLE */}
        <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden font-mono">
          <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[11px]">
              Trade Ledger ({trades.length} Sessions)
            </span>
            <span className="text-zinc-500 text-[11px] font-sans">
              Click any row to open Replay & Critique drawer
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-zinc-500 text-[10px] uppercase tracking-wider border-b border-zinc-800/80">
                <tr>
                  <th className="py-2.5 px-4">Day / Date</th>
                  <th className="py-2.5 px-3 text-right">P&L</th>
                  <th className="py-2.5 px-3 text-right">R</th>
                  <th className="py-2.5 px-3">Dir & Size</th>
                  <th className="py-2.5 px-3">Window</th>
                  <th className="py-2.5 px-4">AI Grade</th>
                  <th className="py-2.5 px-3 text-center w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 tabular-nums">
                {trades.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500 font-mono text-xs">
                      No trades logged yet. Click &quot;+ Log Trade&quot; to record your first session.
                    </td>
                  </tr>
                ) : (
                  trades.map((t) => {
                    const audit = auditMap[t.tradeDate];
                    const grade = audit?.grade;
                    const isWin = t.actualPnlDollars >= 0;

                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTrade(t)}
                        className="hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                      >
                        {/* Day / Date */}
                        <td className="py-3 px-4 text-zinc-200 font-medium">
                          {t.tradeDate}
                        </td>

                        {/* P&L */}
                        <td
                          className={`py-3 px-3 text-right font-bold ${
                            isWin ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          ${isWin ? "+" : ""}
                          {t.actualPnlDollars.toLocaleString()}
                        </td>

                        {/* R Multiple */}
                        <td
                          className={`py-3 px-3 text-right font-semibold ${
                            t.actualPnlR >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {t.actualPnlR >= 0 ? "+" : ""}
                          {t.actualPnlR.toFixed(2)}R
                        </td>

                        {/* Direction & Instrument */}
                        <td className="py-3 px-3">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                              t.direction === "LONG"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            }`}
                          >
                            {t.direction} {t.symbol}
                          </span>
                        </td>

                        {/* Window & Retrace */}
                        <td className="py-3 px-3 text-zinc-400 font-sans text-xs">
                          {t.retraceLevelUsed}
                        </td>

                        {/* AI Grade */}
                        <td className="py-3 px-4">
                          {grade ? (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                grade.biasCorrect
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              }`}
                            >
                              {grade.compositeScore}/100 {grade.biasCorrect ? "PASS" : "FAIL"}
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-[11px]">Pending Grade</span>
                          )}
                        </td>

                        {/* Row Action Arrow */}
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTrade(t);
                            }}
                            className="p-1 rounded text-zinc-500 hover:text-zinc-200 opacity-60 group-hover:opacity-100 transition-opacity"
                            title="Open Replay & Critique drawer"
                          >
                            <PlayCircle className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. RIGHT-SIDE SHEET DRAWER (Replay, Screenshot & Critique) */}
        <Sheet open={!!selectedTrade} onOpenChange={(open) => !open && setSelectedTrade(null)}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-2xl bg-zinc-950 border-l border-zinc-800 p-0 overflow-y-auto"
          >
            {selectedTrade && (
              <div className="p-5 space-y-4 font-mono text-xs">
                {/* Drawer Header */}
                <SheetHeader className="p-0 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <SheetTitle className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
                        <span>{selectedTrade.tradeDate}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            selectedTrade.direction === "LONG"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          }`}
                        >
                          {selectedTrade.direction} {selectedTrade.symbol}
                        </span>
                      </SheetTitle>
                      <SheetDescription className="text-zinc-500 text-[11px] mt-0.5">
                        Execution at {selectedTrade.retraceLevelUsed}
                      </SheetDescription>
                    </div>

                    <div className="text-right tabular-nums pr-6">
                      <div
                        className={`text-base font-bold ${
                          selectedTrade.actualPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        ${selectedTrade.actualPnlDollars >= 0 ? "+" : ""}
                        {selectedTrade.actualPnlDollars.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {selectedTrade.actualPnlR >= 0 ? "+" : ""}
                        {selectedTrade.actualPnlR.toFixed(2)}R
                      </div>
                    </div>
                  </div>
                </SheetHeader>

                {/* Key Execution Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block uppercase">Entry</span>
                    <strong className="text-zinc-100 tabular-nums">
                      {selectedTrade.entryPrice.toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block uppercase">Stop Loss</span>
                    <strong className="text-rose-400 tabular-nums">
                      {selectedTrade.stopPrice.toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block uppercase">Exit Price</span>
                    <strong className="text-zinc-100 tabular-nums">
                      {selectedTrade.exitPrice.toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded bg-zinc-900/60 border border-zinc-800">
                    <span className="text-[10px] text-zinc-500 block uppercase">MAE (Heat)</span>
                    <strong className="text-amber-400 tabular-nums">
                      {selectedTrade.maeR.toFixed(2)}R
                    </strong>
                  </div>
                </div>

                {/* Visual Trade Replay Player */}
                <div className="space-y-1.5 pt-1">
                  <span className="font-semibold text-zinc-400 uppercase text-[10px] tracking-wider block">
                    Visual Trade Replay (Session Bars)
                  </span>
                  <div className="rounded-lg border border-zinc-800/80 overflow-hidden bg-zinc-950">
                    <TradeReplayChart
                      trade={selectedTrade}
                      onClose={() => setSelectedTrade(null)}
                    />
                  </div>
                </div>

                {/* Attached Screenshot (Supabase Storage) */}
                {selectedTrade.screenshotSignedUrl && (
                  <div className="space-y-1.5 pt-1">
                    <span className="font-semibold text-zinc-400 uppercase text-[10px] tracking-wider block">
                      Execution Screenshot (Supabase Storage)
                    </span>
                    <div className="rounded-lg border border-zinc-800/80 overflow-hidden bg-black p-1">
                      <img
                        src={selectedTrade.screenshotSignedUrl}
                        alt="Trade screenshot"
                        className="w-full max-h-72 object-contain rounded"
                      />
                    </div>
                  </div>
                )}

                {/* AI Journal Bot Diagnosis */}
                {(() => {
                  const audit = auditMap[selectedTrade.tradeDate];
                  const pred = audit?.prediction;
                  const grade = audit?.grade;

                  if (!audit || !pred || !grade) {
                    return (
                      <div className="p-3 rounded bg-zinc-900/50 border border-zinc-800 text-xs text-zinc-400 font-sans">
                        <span className="font-semibold text-zinc-300 font-mono">
                          MinBook Archive:
                        </span>{" "}
                        No pre-market snapshot recorded for {selectedTrade.tradeDate}. Historical replay is verified.
                      </div>
                    );
                  }

                  const isWin = selectedTrade.actualPnlR > 0;
                  const isHighMae = selectedTrade.maeR > 0.5;

                  let diagnosisTitle = "";
                  let diagnosisDesc = "";
                  let pillBorder = "";

                  if (pred.biasVerdict.includes("CAUTION") && !isWin) {
                    diagnosisTitle = "Discipline Breach: Traded on Stand Aside Day";
                    diagnosisDesc = `MinBook signaled CAUTION / STAND ASIDE due to chop risk. The trade resulted in a ${selectedTrade.actualPnlR.toFixed(2)}R loss. Protect capital by passing when the engine flags chop.`;
                    pillBorder = "text-rose-400 border-rose-500/20 bg-rose-500/10";
                  } else if (grade.biasCorrect && grade.retraceTapped.includes("VWAP")) {
                    if (isWin && !isHighMae) {
                      diagnosisTitle = "Flawless Execution: Institutional Retrace Alignment";
                      diagnosisDesc = `Full alignment: MinBook called the direction right, price tapped VWAP, and you entered with minimal heat (${selectedTrade.maeR.toFixed(2)}R MAE), capturing +${selectedTrade.actualPnlR.toFixed(2)}R.`;
                      pillBorder = "text-emerald-400 border-emerald-500/20 bg-emerald-500/10";
                    } else {
                      diagnosisTitle = "Execution Error: Entered Early / Chased Open";
                      diagnosisDesc = `MinBook called direction correctly, but trade suffered severe heat (${selectedTrade.maeR.toFixed(2)}R MAE). Entered before the 09:34 AM retrace absorption.`;
                      pillBorder = "text-amber-400 border-amber-500/20 bg-amber-500/10";
                    }
                  } else if (!grade.biasCorrect) {
                    diagnosisTitle = "Systemic Directional Invalidation";
                    diagnosisDesc = `MinBook's call failed (price broke invalidation by ${grade.adverseExcursionPts.toFixed(1)} pts). The loss of ${selectedTrade.actualPnlR.toFixed(2)}R was systemic and aligned with the plan.`;
                    pillBorder = "text-zinc-300 border-zinc-700 bg-zinc-900";
                  } else {
                    diagnosisTitle = "Execution Feedback";
                    diagnosisDesc = `Trade completed with ${selectedTrade.actualPnlR >= 0 ? "+" : ""}${selectedTrade.actualPnlR.toFixed(2)}R PnL and ${selectedTrade.maeR.toFixed(2)}R MAE. Daily composite grade was ${grade.compositeScore}/100.`;
                    pillBorder = "text-zinc-300 border-zinc-700 bg-zinc-900";
                  }

                  return (
                    <div className="p-3.5 rounded bg-zinc-900/60 border border-zinc-800 space-y-1.5 text-xs">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${pillBorder}`}>
                          {diagnosisTitle}
                        </span>
                      </div>
                      <p className="text-zinc-300 leading-relaxed font-sans text-xs">
                        {diagnosisDesc}
                      </p>
                    </div>
                  );
                })()}

                {/* Delete Trade Button */}
                <div className="pt-2 border-t border-zinc-800/80 flex justify-end font-sans">
                  <button
                    onClick={() => handleDeleteTrade(selectedTrade.id)}
                    className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-900/60 text-xs transition-colors flex items-center space-x-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Trade Entry</span>
                  </button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </main>
    </div>
  );
}

export default JournalPage;
