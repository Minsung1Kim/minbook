"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { TradeLogEntry, JournalAnalytics } from "@/types/app";
import {
  BookOpen,
  PlusCircle,
  BarChart2,
  Trash2,
  HelpCircle
} from "lucide-react";

export function JournalPage() {
  const [symbol, setSymbol] = useState<"NQ" | "MNQ">("NQ");
  const [trades, setTrades] = useState<TradeLogEntry[]>([]);
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
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

  useEffect(() => {
    fetchJournal();
  }, []);

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
      plannedRiskDollars,
      plannedTargetDollars,
      actualPnlDollars,
      actualPnlR,
      maeR: parseFloat(maeR) || (stoppedOut ? 1.0 : 0.25),
      mfeR: parseFloat(mfeR) || Math.max(0, actualPnlR),
      stoppedOut,
      retraceLevelUsed: retraceLevelUsed || "Session VWAP",
      notes
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
                1 Trade/Day MAE & MFE Journal
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Track Maximum Adverse Excursion (drawdown heat) and Maximum Favorable Excursion on morning continuation retraces.
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

        {/* 30-Second Post-Trade Form */}
        {showLogForm && (
          <form
            onSubmit={handleCreateTrade}
            className="p-5 rounded-lg bg-[#0f1624] border border-slate-800 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-white font-semibold text-sm">
                Log Session Trade
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
                <label className="text-slate-400 block mb-1">Planned Stop (Invalidation)</label>
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
                  <span>MAE in R (Adverse Heat)</span>
                  <span title="Worst unrealized drawdown during the trade before exiting. E.g. 0.3R means price drew down 30% toward your stop.">
                    <HelpCircle className="w-3 h-3 text-slate-500" />
                  </span>
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1.5"
                  value={maeR}
                  onChange={(e) => setMaeR(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-rose-300 font-mono tabular-nums"
                  placeholder="e.g. 0.25"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 flex items-center space-x-1">
                  <span>MFE in R (Peak Profit)</span>
                  <span title="Peak unrealized open profit reached before exit. E.g. 2.4R means price was up 2.4x your risk at peak.">
                    <HelpCircle className="w-3 h-3 text-slate-500" />
                  </span>
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="10"
                  value={mfeR}
                  onChange={(e) => setMfeR(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-emerald-300 font-mono tabular-nums"
                  placeholder="e.g. 2.40"
                  required
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
                Avg R: {analytics.avgPnlR >= 0 ? "+" : ""}{analytics.avgPnlR}R
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
                  MAE & Retrace Drawdown Distribution
                </h2>
              </div>
              <span className="text-xs text-slate-400">
                1 Trade/Day Sample ({analytics.totalTrades} Trades)
              </span>
            </div>

            <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              <span className="text-white font-medium">Empirical Retrace Heat:</span>{" "}
              {analytics.recommendation}
            </div>

            {/* Threshold Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded bg-slate-900/40 border border-slate-800">
                <span className="text-slate-400 block">Clean Continuation (&lt;0.25R MAE)</span>
                <div className="text-base font-bold font-mono tabular-nums text-emerald-400 mt-1">
                  {analytics.deepHeatDistribution.under25PctR} trades ({((analytics.deepHeatDistribution.under25PctR / analytics.totalTrades) * 100).toFixed(0)}%)
                </div>
                <span className="text-[11px] text-slate-500">Instant continuation</span>
              </div>

              <div className="p-3 rounded bg-slate-900/40 border border-slate-800">
                <span className="text-slate-400 block">Normal Retrace Heat (0.25–0.50R)</span>
                <div className="text-base font-bold font-mono tabular-nums text-cyan-400 mt-1">
                  {analytics.deepHeatDistribution.under50PctR} trades ({((analytics.deepHeatDistribution.under50PctR / analytics.totalTrades) * 100).toFixed(0)}%)
                </div>
                <span className="text-[11px] text-slate-500">Standard wick absorption</span>
              </div>

              <div className="p-3 rounded bg-slate-900/40 border border-slate-800">
                <span className="text-slate-400 block">Deep Shakeout (0.50–0.75R)</span>
                <div className="text-base font-bold font-mono tabular-nums text-amber-400 mt-1">
                  {analytics.deepHeatDistribution.under75PctR} trades ({((analytics.deepHeatDistribution.under75PctR / analytics.totalTrades) * 100).toFixed(0)}%)
                </div>
                <span className="text-[11px] text-slate-500">High stop clip zone</span>
              </div>

              <div className="p-3 rounded bg-slate-900/40 border border-slate-800">
                <span className="text-slate-400 block">Extreme Drawdown (&gt;0.75R)</span>
                <div className="text-base font-bold font-mono tabular-nums text-rose-400 mt-1">
                  {analytics.deepHeatDistribution.severeDrawdown} trades ({((analytics.deepHeatDistribution.severeDrawdown / analytics.totalTrades) * 100).toFixed(0)}%)
                </div>
                <span className="text-[11px] text-slate-500">Failed structure / stopped</span>
              </div>
            </div>
          </div>
        )}

        {/* Trade Log Table */}
        <div className="rounded-lg bg-[#0f1624] border border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-white">
              Session Trade History
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
                  <th className="py-2.5 px-2 text-center">Result</th>
                  <th className="py-2.5 px-3 hidden lg:table-cell">Notes</th>
                  <th className="py-2.5 px-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {trades.map((t) => {
                  const isWin = t.actualPnlR >= 0.5;
                  const isLoss = t.actualPnlR <= -0.5;

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
                      <td className="py-2.5 px-3 text-slate-300 text-[11px] truncate max-w-xs">{t.retraceLevelUsed}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200">{t.entryPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-200">{t.exitPrice.toFixed(2)}</td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold ${
                          t.actualPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        ${t.actualPnlDollars >= 0 ? "+" : ""}{t.actualPnlDollars.toFixed(0)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold ${
                          t.actualPnlR >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {t.actualPnlR >= 0 ? "+" : ""}{t.actualPnlR.toFixed(2)}R
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-rose-300">
                        {t.maeR.toFixed(2)}R
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-300">
                        +{t.mfeR.toFixed(2)}R
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                            isWin
                              ? "border-emerald-800 text-emerald-400 bg-emerald-950/30"
                              : isLoss
                              ? "border-rose-800 text-rose-400 bg-rose-950/30"
                              : "border-slate-700 text-slate-400 bg-slate-900"
                          }`}
                        >
                          {isWin ? "WIN" : isLoss ? "LOSS" : "SCRATCH"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 hidden lg:table-cell text-[11px] max-w-xs truncate" title={t.notes}>
                        {t.notes || "—"}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          onClick={() => handleDeleteTrade(t.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
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
