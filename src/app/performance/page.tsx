"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import {
  CalibrationAuditSummary,
  ProposedWeightUpdate,
} from "@/types/calibration";
import {
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

export default function PerformancePage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [grading, setGrading] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [summary, setSummary] = useState<CalibrationAuditSummary | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<
    "ALL" | "CORRECT" | "FAILED" | "RETRACE_HIT" | "STOP_HUNT"
  >("ALL");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/calibration/audit");
      const json = await res.json();
      if (json.success) {
        setSummary(json.data);
      }
    } catch (err) {
      console.error("Failed to load audit summary:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleGradePending = async () => {
    try {
      setGrading(true);
      const res = await fetch("/api/calibration/grade", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        showToast(
          json.gradedCount > 0
            ? `Graded ${json.gradedCount} pending sessions.`
            : "All eligible sessions already graded."
        );
        await fetchSummary();
      } else {
        showToast(json.error || "Grading failed", true);
      }
    } catch (err: any) {
      showToast(err?.message || "Grading request failed", true);
    } finally {
      setGrading(false);
    }
  };

  const handleApplyProposedWeights = async (update: ProposedWeightUpdate) => {
    try {
      setApplying(true);
      const res = await fetch("/api/calibration/weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          version: update.toVersion,
          weights: update.proposedWeights,
          sampleSizeUsed: update.sampleSize,
          outOfSampleAccuracy: update.proposedOutOfSampleAccuracy,
          changeSummary: update.summary,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Activated weights ${update.toVersion}`);
        await fetchSummary();
      } else {
        showToast(json.error || "Failed to apply weights", true);
      }
    } catch (err: any) {
      showToast(err?.message || "Request failed", true);
    } finally {
      setApplying(false);
    }
  };

  const handleRollback = async (version: string) => {
    try {
      setApplying(true);
      const res = await fetch("/api/calibration/weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rollback",
          version,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`Rolled back to ${version}`);
        await fetchSummary();
      } else {
        showToast(json.error || "Rollback failed", true);
      }
    } catch (err: any) {
      showToast(err?.message || "Rollback request failed", true);
    } finally {
      setApplying(false);
    }
  };

  const showToast = (msg: string, isError = false) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const filteredHistory = (summary?.history || []).filter((item) => {
    if (selectedFilter === "ALL") return true;
    if (selectedFilter === "CORRECT") return item.grade?.biasCorrect === true;
    if (selectedFilter === "FAILED") return item.grade && item.grade.biasCorrect === false;
    if (selectedFilter === "RETRACE_HIT") return item.grade && item.grade.retraceTapped.length > 0;
    if (selectedFilter === "STOP_HUNT") return item.grade?.stopHuntOccurred === true;
    return true;
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Header selectedInstrument="NQ" onSelectInstrument={() => {}} />

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-3.5 py-2 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs font-mono shadow-xl">
          {toastMessage}
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 space-y-3.5">
        {/* Top Control Bar */}
        <div className="px-4 py-3 rounded-lg bg-zinc-900/70 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center space-x-3">
            <span className="font-semibold text-zinc-200 uppercase tracking-wider text-[11px]">
              System Calibration Audit
            </span>
            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px]">
              {summary?.activeModelVersion || "v1.0"} ACTIVE
            </span>
          </div>

          <div className="flex items-center space-x-2 font-sans">
            <button
              onClick={handleGradePending}
              disabled={grading || loading}
              className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${grading ? "animate-spin" : ""}`} />
              <span>Grade Pending</span>
            </button>
          </div>
        </div>

        {/* 1. MINIMAL 4-STAT HEADER */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
            <div className="p-3.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <span className="text-zinc-500 text-[11px] uppercase tracking-wider block">
                Directional Bias Hit Rate
              </span>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  summary.overallBiasAccuracy >= 60 ? "text-emerald-400" : "text-zinc-100"
                }`}
              >
                {summary.overallBiasAccuracy.toFixed(1)}%
              </div>
              <span className="text-[10px] text-zinc-500 font-sans">
                Target: &gt;60% continuation win rate
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <span className="text-zinc-500 text-[11px] uppercase tracking-wider block">
                Retrace Tap Rate
              </span>
              <div className="text-2xl font-bold tabular-nums text-zinc-100">
                {summary.retraceTapRate.toFixed(1)}%
              </div>
              <span className="text-[10px] text-zinc-500 font-sans">
                Tapped VWAP / ON Mid / PDC
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <span className="text-zinc-500 text-[11px] uppercase tracking-wider block">
                Stop-Hunt Precision
              </span>
              <div className="text-2xl font-bold tabular-nums text-zinc-100">
                {summary.stopHuntAccuracy.toFixed(1)}%
              </div>
              <span className="text-[10px] text-zinc-500 font-sans">
                Sweep & reverse confirmed
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <span className="text-zinc-500 text-[11px] uppercase tracking-wider block">
                Liquidity Magnet Rate
              </span>
              <div className="text-2xl font-bold tabular-nums text-zinc-100">
                {summary.liquidityDrawRate.toFixed(1)}%
              </div>
              <span className="text-[10px] text-zinc-500 font-sans">
                Reached Magnet #1 or #2
              </span>
            </div>
          </div>
        )}

        {/* Calibration Sample Gate Indicator */}
        {summary && (
          <div className="px-4 py-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center space-x-2">
              {summary.sampleSizeGate.isCalibrated ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="text-zinc-300">
                {summary.sampleSizeGate.isCalibrated
                  ? "Sample Size Calibrated (N >= 30 Sessions) • Beta-Binomial Bayesian Shrinkage active"
                  : `Collecting Baseline Sample (${summary.sampleSizeGate.current}/${summary.sampleSizeGate.required} Sessions graded)`}
              </span>
            </div>
            <span className="text-zinc-500 tabular-nums">
              {summary.sampleSizeGate.current}/{summary.sampleSizeGate.required}
            </span>
          </div>
        )}

        {/* 2. CLEAN SORTABLE FACTOR ATTRIBUTION TABLE */}
        {summary && summary.factorAttributions && summary.factorAttributions.length > 0 && (
          <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden font-mono">
            <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[11px]">
                Factor Attribution Leaderboard
              </span>
              <span className="text-zinc-500 text-[11px] font-sans">
                Lift vs baseline direction accuracy
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950/80 text-zinc-500 text-[10px] uppercase tracking-wider border-b border-zinc-800/80">
                  <tr>
                    <th className="py-2.5 px-4">Factor</th>
                    <th className="py-2.5 px-3 text-right">Win Rate</th>
                    <th className="py-2.5 px-3 text-right">Lift</th>
                    <th className="py-2.5 px-3 text-right">Sample</th>
                    <th className="py-2.5 px-3 text-right">Active Weight</th>
                    <th className="py-2.5 px-4">Regime Performance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 tabular-nums">
                  {summary.factorAttributions.map((f, idx) => {
                    const isPositiveLift = f.liftPercent >= 0;
                    return (
                      <tr key={idx} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-2.5 px-4 text-zinc-200 font-medium">
                          {f.factorName}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-100 font-semibold">
                          {f.winRate.toFixed(1)}%
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-semibold ${
                            isPositiveLift ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {isPositiveLift ? "+" : ""}
                          {f.liftPercent.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-400">
                          {f.totalOccurrences}
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-200 font-bold">
                          {f.currentWeight.toFixed(2)}x
                        </td>
                        <td className="py-2.5 px-4 text-xs font-mono">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                              f.status === "EDGE_ENHANCER"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : f.status === "NOISE_DETRACTOR"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                : "bg-zinc-800 text-zinc-400 border-zinc-700"
                            }`}
                          >
                            {f.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. COLLAPSIBLE PRE-MARKET HISTORY ROWS */}
        <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden font-mono">
          <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[11px]">
              Pre-Market Freeze Archive vs Actual 09:30–10:00 Outcomes
            </span>

            {/* Filter Pills */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-[11px]">
              {(["ALL", "CORRECT", "FAILED", "RETRACE_HIT", "STOP_HUNT"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSelectedFilter(filter)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    selectedFilter === filter
                      ? "bg-zinc-700 text-zinc-100 font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-zinc-500 text-[10px] uppercase tracking-wider border-b border-zinc-800/80">
                <tr>
                  <th className="py-2.5 px-4">Trade Date</th>
                  <th className="py-2.5 px-3">Verdict</th>
                  <th className="py-2.5 px-3">Result</th>
                  <th className="py-2.5 px-3 text-right">MFE / MAE</th>
                  <th className="py-2.5 px-3">Retrace Hit</th>
                  <th className="py-2.5 px-3">Stop Hunt</th>
                  <th className="py-2.5 px-4 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 tabular-nums">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500">
                      No matching graded sessions.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((item) => {
                    const date = item.prediction.targetTradeDate;
                    const grade = item.grade;
                    const isExpanded = expandedDate === date;

                    return (
                      <React.Fragment key={date}>
                        <tr
                          onClick={() => setExpandedDate(isExpanded ? null : date)}
                          className={`hover:bg-zinc-800/50 transition-colors cursor-pointer ${
                            isExpanded ? "bg-zinc-800/40" : ""
                          }`}
                        >
                          <td className="py-3 px-4 text-zinc-200 font-medium">{date}</td>
                          <td className="py-3 px-3">
                            <span className="text-zinc-300 font-semibold">
                              {item.prediction.biasVerdict.replace("_CONTINUATION", "")}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {grade ? (
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                                  grade.biasCorrect
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                }`}
                              >
                                {grade.tripleBarrierOutcome
                                  ? `${grade.tripleBarrierOutcome}${
                                      grade.realizedNetR !== undefined
                                        ? ` (${grade.realizedNetR >= 0 ? "+" : ""}${grade.realizedNetR.toFixed(2)}R)`
                                        : ""
                                    }`
                                  : grade.biasCorrect
                                  ? "CORRECT"
                                  : "FAILED"}
                              </span>
                            ) : (
                              <span className="text-zinc-600 text-[10px]">PENDING</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right text-zinc-300">
                            {grade ? (
                              <span>
                                <span className="text-emerald-400 font-medium">
                                  +{grade.favorableExcursionPts.toFixed(1)}
                                </span>{" "}
                                /{" "}
                                <span className="text-rose-400 font-medium">
                                  -{grade.adverseExcursionPts.toFixed(1)}
                                </span>{" "}
                                pts
                              </span>
                            ) : (
                              "--"
                            )}
                          </td>
                          <td className="py-3 px-3 text-zinc-400 font-sans text-xs">
                            {grade && grade.retraceTapped.length > 0
                              ? grade.retraceTapped.join(", ")
                              : "No tap"}
                          </td>
                          <td className="py-3 px-3">
                            {grade?.stopHuntOccurred ? (
                              <span className="text-amber-400 font-semibold">SWEPT</span>
                            ) : (
                              <span className="text-zinc-600">None</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-zinc-100">
                            {grade ? `${grade.compositeScore}/100` : "--"}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-zinc-950/80">
                            <td colSpan={7} className="p-4 border-b border-zinc-800 text-xs">
                              <div className="space-y-2">
                                <span className="text-zinc-400 uppercase text-[10px] font-semibold block">
                                  Session Breakdown & Regime Snapshot:
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-zinc-300">
                                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                                    <span className="text-[10px] text-zinc-500 block">Spot at Freeze</span>
                                    <span>{item.prediction.spotAtFreeze.toFixed(2)}</span>
                                  </div>
                                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                                    <span className="text-[10px] text-zinc-500 block">Confidence</span>
                                    <span>{item.prediction.confidenceTier}</span>
                                  </div>
                                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                                    <span className="text-[10px] text-zinc-500 block">Archetype</span>
                                    <span>{item.prediction.archetype}</span>
                                  </div>
                                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                                    <span className="text-[10px] text-zinc-500 block">Brier Score</span>
                                    <span>{grade?.brierScore?.toFixed(3) ?? "--"}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
