"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { TradeLogEntry, JournalAnalytics } from "@/types/app";
import { OpenBriefData } from "@/types/market";
import {
  BookOpen,
  PlusCircle,
  BarChart2,
  Trash2,
  HelpCircle,
  ShieldAlert,
  Percent,
  CheckCircle2,
  Activity
} from "lucide-react";

export function JournalPage() {
  const [symbol, setSymbol] = useState<"NQ" | "MNQ">("NQ");
  const [trades, setTrades] = useState<TradeLogEntry[]>([]);
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
  const [currentBrief, setCurrentBrief] = useState<OpenBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogForm, setShowLogForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const fetchJournal = async () => {
    try {
      const res = await fetch("/api/journal");
      const json = await res.json();
      if (json.success) {
        setTrades(json.trades || []);
        setAnalytics(json.analytics || null);
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

  // Dynamic calculation of MAE and MFE when prices change
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

    const actualPts = direction === "LONG"
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
      notes,
      vxnSnapshot: currentBrief?.macro?.volatilitySurface?.vxn,
      termRatioSnapshot: currentBrief?.macro?.volatilitySurface?.termRatio,
      vvixSnapshot: currentBrief?.macro?.volatilitySurface?.vvix,
      vrpSnapshot: currentBrief?.macro?.volatilitySurface?.vrp,
      inventoryPercentSnapshot: currentBrief?.sessionMetrics?.inventoryPercent,
      smtSnapshot: currentBrief?.sessionMetrics?.smtDivergence?.divergenceType,
      biasVerdictSnapshot: currentBrief?.bias?.verdict
    };

    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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
        fetchJournal();
      }
    } catch (err) {
      console.error("handleDeleteTrade error:", err);
    }
  };

  const sampleGate = analytics?.sampleSizeGate;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <Header selectedInstrument={symbol} onSelectInstrument={(inst) => setSymbol(inst)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-lg bg-[#0f1624] border border-slate-800">
          <div>
            <div className="flex items-center space-x-2.5">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <h1 className="text-lg font-semibold tracking-tight text-white">
                1 Trade/Day MAE & MFE Journal (v2.0)
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Empirical Maximum Adverse Excursion (drawdown heat), peak profit MFE, and Exit Efficiency on morning continuation retraces.
            </p>
          </div>

          <button
            onClick={() => setShowLogForm(!showLogForm)}
            className="px-3.5 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center space-x-1.5 transition-colors self-start sm:self-auto"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{showLogForm ? "Close Form" : "Log Trade (30s)"}</span>
          </button>
        </div>

        {/* Small Sample Size Gate Warning / Calibration Banner */}
        {sampleGate && (
          <div
            className={`p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              sampleGate.isCalibrated
                ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                : "bg-amber-950/20 border-amber-800/40 text-amber-300"
            }`}
          >
            <div className="flex items-center space-x-2.5">
              {sampleGate.isCalibrated ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
              )}
              <div>
                <span className="font-semibold tracking-wide uppercase text-[11px] block">
                  {sampleGate.statusMessage}
                </span>
                <span className="text-[11px] text-slate-400">
                  {sampleGate.isCalibrated
                    ? "Sample size is statistically sufficient to derive empirical stop calibration percentiles."
                    : "Statistical reliability requires at least 50 logged sessions to prevent small-sample curve fitting."}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-3 sm:self-center">
              <div className="w-28 sm:w-36 bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                <div
                  className={`h-full transition-all duration-300 ${sampleGate.isCalibrated ? "bg-emerald-400" : "bg-amber-400"}`}
                  style={{ width: `${Math.min(100, (sampleGate.currentCount / sampleGate.targetSampleSize) * 100)}%` }}
                />
              </div>
              <span className="font-mono tabular-nums text-[11px] text-slate-300 font-medium">
                {sampleGate.currentCount}/{sampleGate.targetSampleSize}
              </span>
            </div>
          </div>
        )}

        {/* 30-Second Post-Trade Form */}
        {showLogForm && (
          <form
            onSubmit={handleCreateTrade}
            className="p-5 rounded-lg bg-[#0f1624] border border-slate-800 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-white font-semibold text-sm">
                Log Session Trade with Regime Snapshot
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                NQ ($20/pt) • MNQ ($2/pt)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Date</label>
                <input
                  type="date"
                  value={tradeDate}
                  onChange={(e) => setTradeDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Direction</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "LONG" | "SHORT")}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white font-medium"
                >
                  <option value="LONG">LONG (Bullish Continuation)</option>
                  <option value="SHORT">SHORT (Bearish Rejection)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Entry Price</label>
                <input
                  type="number"
                  step="0.25"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono tabular-nums font-semibold"
                  placeholder="e.g. 26780.00"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Planned Stop</label>
                <input
                  type="number"
                  step="0.25"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-rose-300 font-mono tabular-nums font-semibold"
                  placeholder="e.g. 26768.00"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Planned Target</label>
                <input
                  type="number"
                  step="0.25"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-emerald-300 font-mono tabular-nums font-semibold"
                  placeholder="e.g. 26815.00"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Actual Exit Price</label>
                <input
                  type="number"
                  step="0.25"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono tabular-nums font-semibold"
                  placeholder="e.g. 26812.50"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 flex items-center space-x-1">
                  <span>Worst Price (Heat)</span>
                  <span title="Lowest price reached for LONG, or highest price reached for SHORT before exit.">
                    <HelpCircle className="w-3 h-3 text-slate-500" />
                  </span>
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={worstPrice}
                  onChange={(e) => setWorstPrice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-rose-300 font-mono tabular-nums"
                  placeholder="e.g. 26774.50"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 flex items-center space-x-1">
                  <span>Best Price (Peak Open)</span>
                  <span title="Highest price reached for LONG, or lowest price reached for SHORT before exit.">
                    <HelpCircle className="w-3 h-3 text-slate-500" />
                  </span>
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={bestPrice}
                  onChange={(e) => setBestPrice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-emerald-300 font-mono tabular-nums"
                  placeholder="e.g. 26820.00"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Calculated MAE (R)</label>
                <input
                  type="number"
                  step="0.05"
                  value={maeR}
                  onChange={(e) => setMaeR(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-rose-300 font-mono tabular-nums"
                  placeholder="Auto from worst price"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Calculated MFE (R)</label>
                <input
                  type="number"
                  step="0.05"
                  value={mfeR}
                  onChange={(e) => setMfeR(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-emerald-300 font-mono tabular-nums"
                  placeholder="Auto from best price"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="text-slate-400 block mb-1">Retrace Level Used</label>
                <input
                  type="text"
                  value={retraceLevelUsed}
                  onChange={(e) => setRetraceLevelUsed(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                  placeholder="e.g. Session VWAP + ON Mid"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Execution Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                  placeholder="e.g. Waited for 9:34 AM drive to fail into VWAP."
                />
              </div>

              <div className="flex flex-col justify-center">
                <label className="text-slate-400 block mb-1">Stopped Out?</label>
                <label className="flex items-center space-x-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={stoppedOut}
                    onChange={(e) => setStoppedOut(e.target.checked)}
                    className="w-4 h-4 accent-rose-500"
                  />
                  <span className="text-slate-300 font-medium">
                    {stoppedOut ? "Yes (Full Stop Hit)" : "No (Target / Manual Exit)"}
                  </span>
                </label>
              </div>
            </div>

            {/* Auto-attached regime preview */}
            {currentBrief && (
              <div className="p-3 rounded bg-slate-900/60 border border-slate-800 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                <span className="text-slate-300 font-semibold">Auto-Attaching Regime Snapshot:</span>
                <span>VXN: <strong className="text-slate-200">{currentBrief.macro?.volatilitySurface?.vxn.toFixed(1) ?? "--"}</strong></span>
                <span>VRP: <strong className="text-slate-200">{currentBrief.macro?.volatilitySurface?.vrp.toFixed(1) ?? "--"}%</strong></span>
                <span>Term Ratio: <strong className="text-slate-200">{currentBrief.macro?.volatilitySurface?.termRatio.toFixed(2) ?? "--"}</strong></span>
                <span>Overnight Inventory: <strong className="text-slate-200">{currentBrief.sessionMetrics?.inventoryPercent ?? 50}%</strong></span>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="px-3.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold transition-colors disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save Trade Entry"}
              </button>
            </div>
          </form>
        )}

        {/* Analytics KPI Strip */}
        {analytics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="p-3.5 rounded-lg bg-[#0f1624] border border-slate-800">
              <span className="text-xs text-slate-400 block">Win Rate</span>
              <div className="text-xl font-bold font-mono tabular-nums text-white mt-1">
                {analytics.winRatePercent}%
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                {analytics.wins}W • {analytics.losses}L • {analytics.scratches}S
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0f1624] border border-slate-800">
              <span className="text-xs text-slate-400 block">Total P&L</span>
              <div
                className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                  analytics.totalPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                ${analytics.totalPnlDollars >= 0 ? "+" : ""}
                {analytics.totalPnlDollars.toLocaleString()}
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Avg: {analytics.avgPnlR >= 0 ? "+" : ""}{analytics.avgPnlR}R
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0f1624] border border-slate-800">
              <span className="text-xs text-slate-400 block">Profit Factor</span>
              <div className="text-xl font-bold font-mono tabular-nums text-cyan-400 mt-1">
                {analytics.profitFactor.toFixed(2)}
              </div>
              <span className="text-[11px] text-slate-500">Gross wins / losses</span>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0f1624] border border-slate-800">
              <span className="text-xs text-slate-400 block">Avg MAE (Winners)</span>
              <div className="text-xl font-bold font-mono tabular-nums text-amber-400 mt-1">
                {analytics.avgMaeWinningTradesR.toFixed(2)}R
              </div>
              <span className="text-[11px] text-slate-500">Heat on winning trades</span>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0f1624] border border-slate-800">
              <span className="text-xs text-slate-400 block">Avg MFE</span>
              <div className="text-xl font-bold font-mono tabular-nums text-emerald-400 mt-1">
                +{analytics.avgMfeTradesR.toFixed(2)}R
              </div>
              <span className="text-[11px] text-slate-500">Peak open run</span>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0f1624] border border-slate-800">
              <span className="text-xs text-slate-400 block">Exit Efficiency</span>
              <div className="text-xl font-bold font-mono tabular-nums text-cyan-400 mt-1">
                {analytics.avgExitEfficiencyPercent.toFixed(1)}%
              </div>
              <span className="text-[11px] text-slate-500">Target 65%–80%</span>
            </div>

            <div className="p-3.5 rounded-lg bg-[#0f1624] border border-slate-800">
              <span className="text-xs text-slate-400 block">Expectancy</span>
              <div className="text-xl font-bold font-mono tabular-nums text-white mt-1">
                +{analytics.expectancyR.toFixed(2)}R
              </div>
              <span className="text-[11px] text-slate-500">Per trade edge</span>
            </div>
          </div>
        )}

        {/* Empirical MAE / MFE Edge Card */}
        {analytics && (
          <div className="p-5 rounded-lg bg-[#0f1624] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <BarChart2 className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-white tracking-tight">
                  Empirical Retrace Drawdown Distribution (MAE)
                </h2>
              </div>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                {analytics.totalTrades} Recorded Trades
              </span>
            </div>

            <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              <span className="text-white font-medium">Empirical Analytics Directive:</span>{" "}
              {analytics.recommendation}
            </div>

            {/* Threshold Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded bg-slate-900/40 border border-slate-800">
                <span className="text-slate-400 block">Clean Continuation (&lt;0.25R MAE)</span>
                <div className="text-base font-bold font-mono tabular-nums text-emerald-400 mt-1">
                  {analytics.deepHeatDistribution.under25PctR} trades ({analytics.totalTrades > 0 ? ((analytics.deepHeatDistribution.under25PctR / analytics.totalTrades) * 100).toFixed(0) : 0}%)
                </div>
                <span className="text-[11px] text-slate-500">Direct continuation drive</span>
              </div>

              <div className="p-3 rounded bg-slate-900/40 border border-slate-800">
                <span className="text-slate-400 block">Normal Retrace Heat (0.25–0.50R)</span>
                <div className="text-base font-bold font-mono tabular-nums text-cyan-400 mt-1">
                  {analytics.deepHeatDistribution.under50PctR} trades ({analytics.totalTrades > 0 ? ((analytics.deepHeatDistribution.under50PctR / analytics.totalTrades) * 100).toFixed(0) : 0}%)
                </div>
                <span className="text-[11px] text-slate-500">Healthy wick absorption</span>
              </div>

              <div className="p-3 rounded bg-slate-900/40 border border-slate-800">
                <span className="text-slate-400 block">Deep Shakeout (0.50–0.75R)</span>
                <div className="text-base font-bold font-mono tabular-nums text-amber-400 mt-1">
                  {analytics.deepHeatDistribution.under75PctR} trades ({analytics.totalTrades > 0 ? ((analytics.deepHeatDistribution.under75PctR / analytics.totalTrades) * 100).toFixed(0) : 0}%)
                </div>
                <span className="text-[11px] text-slate-500">High stop clip risk zone</span>
              </div>

              <div className="p-3 rounded bg-slate-900/40 border border-slate-800">
                <span className="text-slate-400 block">Extreme Drawdown (&gt;0.75R)</span>
                <div className="text-base font-bold font-mono tabular-nums text-rose-400 mt-1">
                  {analytics.deepHeatDistribution.severeDrawdown} trades ({analytics.totalTrades > 0 ? ((analytics.deepHeatDistribution.severeDrawdown / analytics.totalTrades) * 100).toFixed(0) : 0}%)
                </div>
                <span className="text-[11px] text-slate-500">Failed structure / full stop</span>
              </div>
            </div>
          </div>
        )}

        {/* Trade Log Table */}
        <div className="rounded-lg bg-[#0f1624] border border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-white">
              Session Trade History & Regime Snapshots
            </h2>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              {trades.length} recorded sessions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-medium">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-2">Side</th>
                  <th className="py-2.5 px-3">Retrace Level</th>
                  <th className="py-2.5 px-2 text-right">Entry</th>
                  <th className="py-2.5 px-2 text-right">Exit</th>
                  <th className="py-2.5 px-2 text-right">P&L ($)</th>
                  <th className="py-2.5 px-2 text-right">P&L (R)</th>
                  <th className="py-2.5 px-2 text-right">MAE</th>
                  <th className="py-2.5 px-2 text-right">MFE</th>
                  <th className="py-2.5 px-2 text-right">Exit Eff.</th>
                  <th className="py-2.5 px-3 hidden md:table-cell">Regime Snapshot</th>
                  <th className="py-2.5 px-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {trades.map((t) => {
                  return (
                    <tr key={t.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2.5 px-3 text-slate-200 font-mono tabular-nums">{t.tradeDate}</td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`font-semibold text-[11px] ${
                            t.direction === "LONG" ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{t.retraceLevelUsed}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200">{t.entryPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200">{t.exitPrice.toFixed(2)}</td>
                      <td className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold ${t.actualPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        ${t.actualPnlDollars >= 0 ? "+" : ""}{t.actualPnlDollars.toLocaleString()}
                      </td>
                      <td className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold ${t.actualPnlR >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {t.actualPnlR >= 0 ? "+" : ""}{t.actualPnlR.toFixed(2)}R
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-amber-400">{t.maeR.toFixed(2)}R</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-400">+{t.mfeR.toFixed(2)}R</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-cyan-400">
                        {t.exitEfficiencyPercent !== undefined ? `${t.exitEfficiencyPercent.toFixed(0)}%` : "--"}
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell text-slate-400 text-[11px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {t.vrpSnapshot !== undefined && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px]">
                              VRP: {t.vrpSnapshot.toFixed(1)}%
                            </span>
                          )}
                          {t.inventoryPercentSnapshot !== undefined && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px]">
                              Inv: {t.inventoryPercentSnapshot}%
                            </span>
                          )}
                          {t.smtSnapshot && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-cyan-300">
                              SMT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          onClick={() => handleDeleteTrade(t.id)}
                          className="p-1 rounded hover:bg-rose-950/40 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Delete trade"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export default JournalPage;
