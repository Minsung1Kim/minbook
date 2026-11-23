"use client";

import React from "react";
import {
  Compass,
  Crosshair,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Flame,
  CheckCircle2,
  Shield,
  Zap,
  HelpCircle,
  Sparkles
} from "lucide-react";
import { TacticalExecutionPlan, SessionMetrics } from "@/types/market";

interface ActionPlaybookCardProps {
  plan: TacticalExecutionPlan;
  metrics: SessionMetrics;
  currentPrice: number;
}

export function ActionPlaybookCard({ plan, metrics, currentPrice }: ActionPlaybookCardProps) {
  const { retraceAnalysis, timelineGuide, singleTradeDirective } = plan;
  const distToVwap = Math.round((currentPrice - metrics.sessionVwap) * 10) / 10;

  const getArchetypeColor = () => {
    if (retraceAnalysis.probabilityPercent >= 70) {
      return "text-emerald-400 border-emerald-500/40 bg-emerald-950/40";
    } else if (retraceAnalysis.probabilityPercent >= 45) {
      return "text-amber-400 border-amber-500/40 bg-amber-950/40";
    } else {
      return "text-rose-400 border-rose-500/40 bg-rose-950/40";
    }
  };

  return (
    <div className="rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden flex flex-col justify-between">
      {/* Header Banner */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
            <Zap className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
              1-Trade Decision Engine
            </span>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Retrace Probability & Game Plan
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className={`px-2.5 py-1 rounded text-xs font-mono font-bold border ${getArchetypeColor()}`}>
            {retraceAnalysis.probabilityPercent}% RETRACE PROBABILITY
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4 font-mono">
        {/* Retrace Verdict Box */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400 flex items-center space-x-1.5 uppercase">
              <Crosshair className="w-4 h-4" />
              <span>Session Archetype Analysis:</span>
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {retraceAnalysis.retraceType}
            </span>
          </div>

          <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
            {retraceAnalysis.verdictHeadline}
          </h3>

          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            {retraceAnalysis.explanation}
          </p>

          <div className="p-2.5 rounded bg-cyan-950/30 border border-cyan-800/60 text-xs text-cyan-200 leading-relaxed">
            <strong className="text-white">Actionable Rule:</strong> {retraceAnalysis.retraceActionAdvice}
          </div>
        </div>

        {/* Expected Pullback Depth & Distance */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              Expected Retrace Depth
            </span>
            <div className="mt-1 flex items-baseline space-x-1">
              <span className="text-xl font-bold text-white">
                ~{retraceAnalysis.expectedPullbackDepthPts}
              </span>
              <span className="text-xs text-slate-400">points</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Based on 15m ATR ({metrics.atr15mIntraday} pts)
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              Distance to VWAP
            </span>
            <div className="mt-1 flex items-baseline space-x-1">
              <span
                className={`text-xl font-bold ${
                  distToVwap >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {distToVwap >= 0 ? "+" : ""}{distToVwap}
              </span>
              <span className="text-xs text-slate-400">pts</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              VWAP: {metrics.sessionVwap.toFixed(1)}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 p-3 rounded-lg bg-slate-950/80 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
              Distance to PDC
            </span>
            <div className="mt-1 flex items-baseline space-x-1">
              <span
                className={`text-xl font-bold ${
                  currentPrice >= metrics.pdc ? "text-cyan-400" : "text-amber-400"
                }`}
              >
                {currentPrice >= metrics.pdc ? "+" : ""}{(currentPrice - metrics.pdc).toFixed(1)}
              </span>
              <span className="text-xs text-slate-400">pts</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              PDC: {metrics.pdc.toFixed(1)}
            </span>
          </div>
        </div>

        {/* The 1-Trade Execution Directive Banner */}
        <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-800/80 text-emerald-200">
          <div className="flex items-start space-x-2.5">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-bold text-white block uppercase tracking-wider">
                TODAY'S #1 DISCIPLINE DIRECTIVE
              </span>
              <p className="text-xs text-emerald-200/90 leading-relaxed mt-1 font-sans">
                {singleTradeDirective}
              </p>
            </div>
          </div>
        </div>

        {/* 9:30–10:00 AM Tactical Timeline */}
        <div className="space-y-2">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider block">
            NY Open 30-Minute Tactical Timeline:
          </span>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800 flex items-start space-x-3">
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold shrink-0">
                {timelineGuide.observePhase.timeWindow}
              </span>
              <span className="text-slate-300 font-sans">
                <strong className="text-amber-400">Observe:</strong> {timelineGuide.observePhase.rule}
              </span>
            </div>

            <div className="p-2.5 rounded bg-cyan-950/20 border border-cyan-800/60 flex items-start space-x-3">
              <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-bold shrink-0">
                {timelineGuide.entryWindow.timeWindow}
              </span>
              <span className="text-slate-200 font-sans">
                <strong className="text-cyan-400">The Retrace Window:</strong> {timelineGuide.entryWindow.rule} (Target Zone: <strong className="text-white">{timelineGuide.entryWindow.zone}</strong>)
              </span>
            </div>

            <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800 flex items-start space-x-3">
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold shrink-0">
                {timelineGuide.managementPhase.timeWindow}
              </span>
              <span className="text-slate-300 font-sans">
                <strong className="text-emerald-400">Manage / Protect:</strong> {timelineGuide.managementPhase.rule}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Rule */}
      <div className="px-5 py-2.5 bg-slate-950/70 border-t border-slate-800/80 text-[11px] font-mono text-slate-400 flex items-center justify-between">
        <span>Strategy: 1 Trade/Day NQ Retrace</span>
        <span className="text-cyan-400 font-semibold">Goal: 2R–3R Continuation</span>
      </div>
    </div>
  );
}
