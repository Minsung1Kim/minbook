"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import {
  BookOpen,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  Trash2,
  Activity,
  Award,
  ShieldAlert,
  Sparkles,
  BarChart2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Calendar,
  Clock
} from "lucide-react";
import { TradeLogEntry, JournalAnalytics } from "@/types/app";

export default function JournalPage() {
  const [trades, setTrades] = useState<TradeLogEntry[]>([]);
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogForm, setShowLogForm] = useState(false);

  // Form State
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split("T")[0]);
  const [symbol, setSymbol] = useState<"NQ" | "MNQ">("NQ");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [entryPrice, setEntryPrice] = useState<string>("21100.00");
  const [stopPrice, setStopPrice] = useState<string>("21087.50"); // 12.5 pts = $250
  const [targetPrice, setTargetPrice] = useState<string>("21130.00"); // 30 pts = $600
  const [exitPrice, setExitPrice] = useState<string>("21130.00");
  const [contracts, setContracts] = useState<number>(1);
  const [maeR, setMaeR] = useState<string>("0.25");
  const [mfeR, setMfeR] = useState<string>("2.40");
  const [stoppedOut, setStoppedOut] = useState<boolean>(false);
  const [entryTimeET, setEntryTimeET] = useState<string>("09:35:00");
  const [exitTimeET, setExitTimeET] = useState<string>("09:48:30");
  const [retraceLevelUsed, setRetraceLevelUsed] = useState<string>("VWAP + ON Mid");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadJournal();
  }, []);

  const loadJournal = () => {
    setLoading(true);
    fetch("/api/journal")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setTrades(res.trades);
          setAnalytics(res.analytics);
        }
      })
      .finally(() => setLoading(false));
  };

  const handleCreateTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const ePrice = parseFloat(entryPrice);
      const sPrice = parseFloat(stopPrice);
      const tPrice = parseFloat(targetPrice);
      const exPrice = parseFloat(exitPrice);
      const mR = parseFloat(maeR);
      const mfR = parseFloat(mfeR);

      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "minsung",
          tradeDate,
          symbol,
          direction,
          entryPrice: ePrice,
          stopPrice: sPrice,
          targetPrice: tPrice,
          exitPrice: exPrice,
          contracts,
          maeR: isNaN(mR) ? 0.3 : mR,
          mfeR: isNaN(mfR) ? 2.0 : mfR,
          stoppedOut,
          entryTimeET,
          exitTimeET,
          retraceLevelUsed,
          notes
        })
      });

      const json = await res.json();
      if (json.success) {
        setShowLogForm(false);
        loadJournal();
      }
    } catch (err) {
      console.error("Failed to create trade:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTrade = async (id: string) => {
    if (!confirm("Delete this trade log entry?")) return;
    try {
      await fetch(`/api/journal?id=${id}`, { method: "DELETE" });
      loadJournal();
    } catch (err) {
      console.error("Failed to delete trade:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <Header selectedInstrument={symbol} onSelectInstrument={(inst) => setSymbol(inst)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900/90 border border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <h1 className="text-xl font-bold tracking-tight text-white">
                1 Trade/Day MAE & MFE Journal
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Track Maximum Adverse Excursion (drawdown heat) and Maximum Favorable Excursion on your morning continuation retraces.
            </p>
          </div>

          <button
            onClick={() => setShowLogForm(!showLogForm)}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs flex items-center space-x-2 shadow-lg shadow-cyan-500/20 transition-all self-start sm:self-auto"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{showLogForm ? "Close Form" : "Log Today's 1 Trade (30s)"}</span>
          </button>
        </div>

        {/* 30-Second Post-Trade Form */}
        {showLogForm && (
          <form
            onSubmit={handleCreateTrade}
            className="p-5 rounded-xl bg-slate-900 border border-cyan-800/80 shadow-2xl space-y-4 font-mono text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-cyan-400 font-bold text-sm flex items-center space-x-2">
                <Sparkles className="w-4 h-4" />
                <span>Quick 30-Second Trade Logger</span>
              </span>
              <span className="text-slate-400 text-[11px]">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white"
                  required
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Instrument</label>
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value as "NQ" | "MNQ")}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white"
                >
                  <option value="NQ">NQ ($20/pt)</option>
                  <option value="MNQ">MNQ ($2/pt)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Direction</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "LONG" | "SHORT")}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-bold"
                >
                  <option value="LONG">LONG (Bullish Continuation)</option>
                  <option value="SHORT">SHORT (Bearish Continuation)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Contracts</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={contracts}
                  onChange={(e) => setContracts(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Entry Price</label>
                <input
                  type="number"
                  step="0.25"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-bold"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-rose-300"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-emerald-300"
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
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-bold"
                  required
                />
              </div>
            </div>

            {/* MAE and MFE Inputs */}
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-rose-400 font-bold block mb-1 flex items-center space-x-1">
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
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-rose-300 font-bold"
                  placeholder="e.g. 0.25"
                  required
                />
                <span className="text-[10px] text-slate-400">0.0 = zero heat, 1.0 = stopped out</span>
              </div>

              <div>
                <label className="text-emerald-400 font-bold block mb-1 flex items-center space-x-1">
                  <span>MFE in R (Peak Profit)</span>
                  <span title="Peak unrealized open profit reached before trade exit. E.g. 2.4R means price was up 2.4x your risk at peak.">
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
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-emerald-300 font-bold"
                  placeholder="e.g. 2.40"
                  required
                />
                <span className="text-[10px] text-slate-400">Peak open run in R</span>
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
                  <span className="text-slate-300 font-semibold">
                    {stoppedOut ? "Yes (Full Stop Hit)" : "No (Target / Manual Exit)"}
                  </span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Retrace Level Used</label>
                <input
                  type="text"
                  value={retraceLevelUsed}
                  onChange={(e) => setRetraceLevelUsed(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                  placeholder="e.g. Session VWAP + ON Mid bounce"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Execution Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
                  placeholder="e.g. Waited for 9:34 AM drive to fail into VWAP. Honored 1 trade rule."
                />
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
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition-colors disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save Trade Entry"}
              </button>
            </div>
          </form>
        )}

        {/* Analytics KPI Strip */}
        {analytics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Win Rate</span>
              <div className="text-2xl font-bold text-white mt-1">
                {analytics.winRatePercent}%
              </div>
              <span className="text-[10px] text-slate-400">
                {analytics.wins}W • {analytics.losses}L • {analytics.scratches}S
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total P&L</span>
              <div
                className={`text-2xl font-bold mt-1 ${
                  analytics.totalPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                ${analytics.totalPnlDollars >= 0 ? "+" : ""}
                {analytics.totalPnlDollars.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400">
                Avg R: {analytics.avgPnlR >= 0 ? "+" : ""}{analytics.avgPnlR}R
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Profit Factor</span>
              <div className="text-2xl font-bold text-cyan-400 mt-1">
                {analytics.profitFactor.toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-400">Gross wins / losses</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Avg MAE (Winners)</span>
              <div className="text-2xl font-bold text-amber-400 mt-1">
                {analytics.avgMaeWinningTradesR.toFixed(2)}R
              </div>
              <span className="text-[10px] text-slate-400">Heat on winning trades</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Avg MFE</span>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                +{analytics.avgMfeTradesR.toFixed(2)}R
              </div>
              <span className="text-[10px] text-slate-400">Peak open run</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Expectancy</span>
              <div className="text-2xl font-bold text-white mt-1">
                +{analytics.expectancyR.toFixed(2)}R
              </div>
              <span className="text-[10px] text-slate-400">Per trade edge</span>
            </div>
          </div>
        )}

        {/* Empirical MAE / MFE Edge Card */}
        {analytics && (
          <div className="p-5 rounded-xl bg-slate-900/90 border border-cyan-800/60 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <BarChart2 className="w-5 h-5 text-cyan-400" />
                <h2 className="text-base font-bold text-white tracking-tight">
                  Empirical MAE Drawdown Insight (Why Stops Get Clipped)
                </h2>
              </div>
              <span className="text-xs font-mono text-cyan-300">
                1 Trade/Day Statistical Proof
              </span>
            </div>

            {/* Empirical Takeaway */}
            <div className="p-4 rounded-lg bg-cyan-950/30 border border-cyan-800/80 font-mono text-xs text-cyan-200 leading-relaxed flex items-start space-x-3">
              <Sparkles className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white">EMPIRICAL STATISTICAL TAKEAWAY:</strong>{" "}
                {analytics.recommendation}
              </div>
            </div>

            {/* Distribution Bars */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                <span className="text-slate-400 text-[11px] block">Shallow Heat (0 to 0.25R)</span>
                <div className="text-xl font-bold text-emerald-400 mt-1">
                  {analytics.deepHeatDistribution.under25PctR} trades
                </div>
                <span className="text-[10px] text-slate-400">Instant continuation</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                <span className="text-slate-400 text-[11px] block">Normal Retrace (0.25 to 0.50R)</span>
                <div className="text-xl font-bold text-cyan-400 mt-1">
                  {analytics.deepHeatDistribution.under50PctR} trades
                </div>
                <span className="text-[10px] text-slate-400">Standard noise buffer</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                <span className="text-slate-400 text-[11px] block">Deep Test (0.50 to 0.75R)</span>
                <div className="text-xl font-bold text-amber-400 mt-1">
                  {analytics.deepHeatDistribution.under75PctR} trades
                </div>
                <span className="text-[10px] text-slate-400">High danger zone</span>
              </div>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-center">
                <span className="text-slate-400 text-[11px] block">Near Stop (&gt;0.75R)</span>
                <div className="text-xl font-bold text-rose-400 mt-1">
                  {analytics.deepHeatDistribution.severeDrawdown} trades
                </div>
                <span className="text-[10px] text-slate-400">Rare recovery</span>
              </div>
            </div>
          </div>
        )}

        {/* Trade Log History Table */}
        <div className="rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              Logged Trade History ({trades.length} entries)
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Strict 1 Trade Per Day Rule
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-2">Symbol</th>
                  <th className="py-2.5 px-2">Dir</th>
                  <th className="py-2.5 px-3 text-right">Entry</th>
                  <th className="py-2.5 px-3 text-right">Stop</th>
                  <th className="py-2.5 px-3 text-right">Exit</th>
                  <th className="py-2.5 px-3 text-right">P&L ($)</th>
                  <th className="py-2.5 px-2 text-right">R:R</th>
                  <th className="py-2.5 px-2 text-right">MAE</th>
                  <th className="py-2.5 px-2 text-right">MFE</th>
                  <th className="py-2.5 px-3 hidden md:table-cell">Retrace Setup / Notes</th>
                  <th className="py-2.5 px-2 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {trades.map((t) => {
                  const isWin = t.actualPnlDollars > 0;
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-white">
                        {t.tradeDate}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {t.symbol}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 font-bold">
                        <span className={t.direction === "LONG" ? "text-emerald-400" : "text-rose-400"}>
                          {t.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">{t.entryPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right text-rose-400/80">{t.stopPrice.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right text-white font-bold">{t.exitPrice.toFixed(2)}</td>
                      <td className={`py-2.5 px-3 text-right font-bold ${isWin ? "text-emerald-400" : "text-rose-400"}`}>
                        {isWin ? "+" : ""}${t.actualPnlDollars.toFixed(0)}
                      </td>
                      <td className={`py-2.5 px-2 text-right font-bold ${isWin ? "text-emerald-400" : "text-rose-400"}`}>
                        {isWin ? "+" : ""}{t.actualPnlR.toFixed(2)}R
                      </td>
                      <td className="py-2.5 px-2 text-right text-amber-400 font-semibold">
                        -{t.maeR.toFixed(2)}R
                      </td>
                      <td className="py-2.5 px-2 text-right text-emerald-400 font-semibold">
                        +{t.mfeR.toFixed(2)}R
                      </td>
                      <td className="py-2.5 px-3 hidden md:table-cell text-[11px] text-slate-400 truncate max-w-xs">
                        <span className="text-slate-200">{t.retraceLevelUsed}</span>
                        {t.notes && <span className="text-slate-500 ml-1">({t.notes})</span>}
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
