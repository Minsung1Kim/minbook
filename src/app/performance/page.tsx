"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import {
  CalibrationAuditSummary,
  ProposedWeightUpdate,
} from "@/types/calibration";
import {
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Sliders,
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
            ? `Graded ${json.gradedCount} pending session(s).`
            : "All settled sessions are already graded."
        );
        await fetchSummary();
      } else {
        showToast(json.error || "Grading failed");
      }
    } catch (err: any) {
      showToast(err?.message || "Grading request failed");
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
        showToast(json.error || "Failed to apply weights");
      }
    } catch (err: any) {
      showToast(err?.message || "Request failed");
    } finally {
      setApplying(false);
    }
  };

  const showToast = (msg: string) => {
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

  const dirCount = summary?.directionalCallsCount ?? 0;
  const dirCorrect = summary?.directionalCorrectCount ?? 0;
  const cautionCount = summary?.cautionCallsCount ?? 0;
  const cautionCorrect = summary?.cautionCorrectCount ?? 0;

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
              Verified System Audit (Real Frozen Calls Only)
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
              <span>Check &amp; Grade Pending</span>
            </button>
          </div>
        </div>

        {/* 1. 4-STAT AUDIT SUMMARY (100% Real Data) */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
            <div className="p-3.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <span className="text-zinc-500 text-[11px] uppercase tracking-wider block">
                Directional Hit Rate
              </span>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  dirCount === 0
                    ? "text-zinc-400"
                    : summary.overallBiasAccuracy >= 60
                    ? "text-emerald-400"
                    : "text-zinc-100"
                }`}
              >
                {dirCount > 0 ? `${summary.overallBiasAccuracy.toFixed(1)}%` : "—"}
              </div>
              <span className="text-[11px] text-zinc-500 font-sans">
                {dirCount > 0
                  ? `${dirCorrect} of ${dirCount} directional calls right`
                  : "No directional calls graded yet"}
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <span className="text-zinc-500 text-[11px] uppercase tracking-wider block">
                Chop / Stand-Aside Accuracy
              </span>
              <div className="text-2xl font-bold tabular-nums text-zinc-100">
                {cautionCount > 0
                  ? `${((cautionCorrect / cautionCount) * 100).toFixed(1)}%`
                  : "—"}
              </div>
              <span className="text-[11px] text-zinc-500 font-sans">
                {cautionCount > 0
                  ? `${cautionCorrect} of ${cautionCount} caution days avoided chop`
                  : "No caution/stand-aside days yet"}
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <span className="text-zinc-500 text-[11px] uppercase tracking-wider block">
                Bounce Area Tap Rate
              </span>
              <div className="text-2xl font-bold tabular-nums text-zinc-100">
                {summary.gradedSessions > 0 ? `${summary.retraceTapRate.toFixed(1)}%` : "—"}
              </div>
              <span className="text-[11px] text-zinc-500 font-sans">
                Tapped VWAP / ON Mid / PDC / HTF
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-1">
              <span className="text-zinc-500 text-[11px] uppercase tracking-wider block">
                Target Area Hit Rate
              </span>
              <div className="text-2xl font-bold tabular-nums text-zinc-100">
                {summary.gradedSessions > 0 ? `${summary.liquidityDrawRate.toFixed(1)}%` : "—"}
              </div>
              <span className="text-[11px] text-zinc-500 font-sans">
                Reached ONH/ONL or PDH/PDL target
              </span>
            </div>
          </div>
        )}

        {/* Honest Sample Gate Indicator */}
        {summary && (
          <div className="px-4 py-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center space-x-2">
              {summary.sampleSizeGate.isCalibrated ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="text-zinc-300 font-sans">
                {summary.sampleSizeGate.isCalibrated
                  ? `Calibrated (${summary.sampleSizeGate.current} real graded sessions). Signal weights adjust automatically using Bayesian shrinkage.`
                  : `Collecting real live data (${summary.sampleSizeGate.current} of ${summary.sampleSizeGate.required} real sessions graded). Model weights stay locked at 1.0x until 30 real sessions are recorded.`}
              </span>
            </div>
            <span className="text-zinc-500 tabular-nums">
              {summary.sampleSizeGate.current}/{summary.sampleSizeGate.required}
            </span>
          </div>
        )}

        {/* Proposed Calibration Update (only appears once N >= 30 real sessions exist) */}
        {summary?.proposedUpdate && (
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="font-mono font-bold text-emerald-400 flex items-center space-x-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>
                  Calibrated Weights Ready ({summary.proposedUpdate.fromVersion} → {summary.proposedUpdate.toVersion})
                </span>
              </div>
              <p className="text-zinc-300">{summary.proposedUpdate.summary}</p>
            </div>
            <button
              onClick={() => handleApplyProposedWeights(summary.proposedUpdate!)}
              disabled={applying}
              className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors disabled:opacity-50"
            >
              {applying ? "Applying..." : "Apply Weights"}
            </button>
          </div>
        )}

        {/* 2. QUANT SIGNAL ATTRIBUTION TABLE */}
        {summary && summary.factorAttributions && summary.factorAttributions.length > 0 && (
          <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden font-mono">
            <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[11px]">
                Quant Signal Track Record
              </span>
              <span className="text-zinc-500 text-[11px] font-sans">
                Which quant factors are actually predicting moves
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950/80 text-zinc-500 text-[10px] uppercase tracking-wider border-b border-zinc-800/80">
                  <tr>
                    <th className="py-2.5 px-4">Quant Signal</th>
                    <th className="py-2.5 px-3 text-right">Win Rate</th>
                    <th className="py-2.5 px-3 text-right">Sessions Active</th>
                    <th className="py-2.5 px-3 text-right">Model Weight</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 tabular-nums">
                  {summary.factorAttributions.map((f, idx) => (
                    <tr key={idx} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2.5 px-4 text-zinc-200 font-medium font-sans">
                        {f.factorName}
                      </td>
                      <td className="py-2.5 px-3 text-right text-zinc-100 font-semibold">
                        {f.totalOccurrences > 0 ? `${f.winRate.toFixed(1)}%` : "—"}
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. FROZEN PRE-MARKET PREDICTIONS VS ACTUAL OUTCOMES */}
        <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden font-mono">
          <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[11px]">
              Frozen Pre-Market Calls vs Actual 09:30–10:00 ET Market
            </span>

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
                  {filter.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-zinc-500 text-[10px] uppercase tracking-wider border-b border-zinc-800/80">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-3">Frozen Bias Call</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3 text-right">09:30–10:00 Range</th>
                  <th className="py-2.5 px-3">Bounce Areas Tapped</th>
                  <th className="py-2.5 px-4 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 tabular-nums">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500">
                      Loading verified audit records...
                    </td>
                  </tr>
                ) : filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500 font-sans">
                      No real sessions recorded yet. Pre-market predictions freeze automatically between 09:15 and 10:00 ET and grade after 10:20 ET.
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
                            <span className="text-zinc-200 font-semibold">
                              {item.prediction.biasVerdict}
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
                                {grade.biasCorrect ? "VERIFIED RIGHT" : "MISSED"}
                                {grade.tripleBarrierOutcome && grade.tripleBarrierOutcome !== "NO_FILL"
                                  ? ` · ${grade.tripleBarrierOutcome}`
                                  : ""}
                              </span>
                            ) : (
                              <span className="text-amber-400 text-[10px]">PENDING 10:20 ET</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right text-zinc-300">
                            {grade ? (
                              <span>
                                {grade.windowLow.toFixed(1)} – {grade.windowHigh.toFixed(1)}
                              </span>
                            ) : (
                              "--"
                            )}
                          </td>
                          <td className="py-3 px-3 text-zinc-400 font-sans text-xs">
                            {grade && grade.retraceTapped.length > 0
                              ? grade.retraceTapped.join(", ")
                              : "None tapped"}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-zinc-100">
                            {grade ? `${grade.compositeScore}/100` : "--"}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-zinc-950/80">
                            <td colSpan={6} className="p-4 border-b border-zinc-800 text-xs">
                              <div className="space-y-2">
                                <span className="text-zinc-400 uppercase text-[10px] font-semibold block">
                                  Frozen Snapshot vs Actual 09:30–10:00 ET Window:
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-zinc-300">
                                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                                    <span className="text-[10px] text-zinc-500 block">Frozen Spot / Time</span>
                                    <span>
                                      {item.prediction.spotAtFreeze.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                                    <span className="text-[10px] text-zinc-500 block">Frozen Bounce Levels</span>
                                    <span>
                                      VWAP {item.prediction.primaryRetraceLevels.vwap.toFixed(1)} / PDC{" "}
                                      {item.prediction.primaryRetraceLevels.pdc.toFixed(1)}
                                    </span>
                                  </div>
                                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                                    <span className="text-[10px] text-zinc-500 block">Actual 09:30 → 10:00</span>
                                    <span>
                                      {grade
                                        ? `${grade.openPrice930.toFixed(1)} → ${grade.windowClose1000.toFixed(1)}`
                                        : "Pending"}
                                    </span>
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
