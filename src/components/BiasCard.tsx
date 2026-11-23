"use client";

import React from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertOctagon,
  ShieldAlert,
  CheckCircle2,
  Crosshair,
  Compass,
  ArrowRight,
  Info
} from "lucide-react";
import { BiasRegime, SessionMetrics } from "@/types/market";

interface BiasCardProps {
  bias: BiasRegime;
  metrics: SessionMetrics;
}

export function BiasCard({ bias, metrics }: BiasCardProps) {
  const getVerdictStyle = () => {
    switch (bias.verdict) {
      case "CONTINUATION FAVORED (BULLISH)":
        return {
          border: "border-emerald-500/40 shadow-emerald-950/20",
          headerBg: "bg-emerald-950/50 text-emerald-200 border-emerald-800",
          icon: <TrendingUp className="w-5 h-5 text-emerald-400" />,
          badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
        };
      case "CONTINUATION FAVORED (BEARISH)":
        return {
          border: "border-rose-500/40 shadow-rose-950/20",
          headerBg: "bg-rose-950/50 text-rose-200 border-rose-800",
          icon: <TrendingDown className="w-5 h-5 text-rose-400" />,
          badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/40"
        };
      case "STAND ASIDE / HIGH VOL":
        return {
          border: "border-red-500/50 shadow-red-950/30",
          headerBg: "bg-red-950/60 text-red-200 border-red-800",
          icon: <AlertOctagon className="w-5 h-5 text-red-400" />,
          badgeColor: "bg-red-500/20 text-red-300 border-red-500/40"
        };
      default: // CAUTION / CHOP RISK
        return {
          border: "border-amber-500/40 shadow-amber-950/20",
          headerBg: "bg-amber-950/50 text-amber-200 border-amber-800",
          icon: <ShieldAlert className="w-5 h-5 text-amber-400" />,
          badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40"
        };
    }
  };

  const style = getVerdictStyle();

  return (
    <div
      className={`rounded-xl bg-slate-900/90 border ${style.border} shadow-xl overflow-hidden flex flex-col justify-between`}
    >
      {/* Header Banner */}
      <div className={`p-4 border-b flex items-center justify-between ${style.headerBg}`}>
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-black/40 border border-white/10">
            {style.icon}
          </div>
          <div>
            <span className="text-[10px] font-mono tracking-wider text-slate-300 uppercase block">
              9:30 AM NY Open Bias Briefing
            </span>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              {bias.verdict}
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className={`px-2 py-0.5 rounded text-[11px] font-mono border ${style.badgeColor}`}>
            {bias.confidence} CONFIDENCE
          </span>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
            CHOP: {bias.chopRisk}
          </span>
        </div>
      </div>

      {/* Body: Plain-English Executive Summary */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* Executive Summary Quote */}
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80">
          <div className="flex items-start space-x-2">
            <Compass className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-mono">
              {bias.summary}
            </p>
          </div>
        </div>

        {/* Retrace Action Box */}
        <div className="p-3.5 rounded-lg bg-cyan-950/20 border border-cyan-800/60">
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <span className="text-cyan-400 font-bold flex items-center space-x-1.5">
              <Crosshair className="w-3.5 h-3.5" />
              <span>IDEAL 9:34–9:50 AM RETRACE ZONE</span>
            </span>
            <span className="text-slate-400">1 Trade/Day Sweet Spot</span>
          </div>
          <div className="flex items-baseline space-x-3 font-mono">
            <span className="text-xl sm:text-2xl font-bold text-white tracking-wide">
              {bias.idealRetraceZone.startPrice.toFixed(2)} — {bias.idealRetraceZone.endPrice.toFixed(2)}
            </span>
          </div>
          <p className="text-[11px] text-cyan-300/80 font-mono mt-1">
            {bias.idealRetraceZone.description}
          </p>
        </div>

        {/* Structural Drivers & Confluence List */}
        <div className="space-y-2">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
            Structural Confluence Drivers:
          </span>
          <div className="space-y-1.5">
            {bias.drivers.map((driver, idx) => (
              <div
                key={idx}
                className="text-xs font-mono text-slate-300 flex items-start space-x-2 bg-slate-950/50 p-2 rounded border border-slate-800/60"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{driver}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chop & Whipsaw Risks */}
        {bias.risks.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider block">
              Chop & Stop Risks:
            </span>
            <div className="space-y-1.5">
              {bias.risks.map((risk, idx) => (
                <div
                  key={idx}
                  className="text-xs font-mono text-amber-300/90 flex items-start space-x-2 bg-amber-950/20 p-2 rounded border border-amber-900/40"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{risk}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Pill: Key Reference Metrics */}
      <div className="px-5 py-2.5 bg-slate-950/70 border-t border-slate-800/80 text-[11px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <span>
          PDC: <strong className="text-slate-200">{metrics.pdc}</strong>
        </span>
        <span>
          ON Mid: <strong className="text-slate-200">{metrics.onMid}</strong>
        </span>
        <span>
          VWAP: <strong className="text-slate-200">{metrics.sessionVwap}</strong>
        </span>
        <span>
          15m ATR: <strong className="text-cyan-400">{metrics.atr15mIntraday} pts</strong>
        </span>
      </div>
    </div>
  );
}
