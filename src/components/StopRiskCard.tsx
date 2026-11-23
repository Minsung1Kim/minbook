"use client";

import React from "react";
import {
  Shield,
  Target,
  AlertTriangle,
  Scale,
  Sparkles,
  ChevronRight,
  Sliders,
  DollarSign
} from "lucide-react";
import { SizingGuidance } from "@/types/market";

interface StopRiskCardProps {
  guidance: SizingGuidance;
  riskDollars: number;
  targetDollars: number;
  onChangeRisk: (val: number) => void;
  onChangeTarget: (val: number) => void;
  selectedInstrument: "NQ" | "MNQ";
  onSelectInstrument: (inst: "NQ" | "MNQ") => void;
}

export function StopRiskCard({
  guidance,
  riskDollars,
  targetDollars,
  onChangeRisk,
  onChangeTarget,
  selectedInstrument,
  onSelectInstrument
}: StopRiskCardProps) {
  const isClipping = guidance.stopClippingRisk;

  return (
    <div className="rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden flex flex-col justify-between">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <Scale className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
              Discipline & Sizing Engine
            </span>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Stop-Out & Volatility Risk
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 font-mono text-xs">
          <span className="text-slate-400">Budget:</span>
          <span className="text-emerald-400 font-bold">${riskDollars}</span>
          <span className="text-slate-600">/</span>
          <span className="text-cyan-400 font-bold">${targetDollars}</span>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Risk & Target Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-lg bg-slate-950 border border-slate-800/80">
          {/* Risk Budget Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 flex items-center space-x-1">
                <Shield className="w-3.5 h-3.5 text-rose-400" />
                <span>Risk Budget ($200–$300):</span>
              </span>
              <span className="text-rose-400 font-bold text-sm">
                ${riskDollars}
              </span>
            </div>
            <input
              type="range"
              min="150"
              max="350"
              step="25"
              value={riskDollars}
              onChange={(e) => onChangeRisk(Number(e.target.value))}
              className="w-full accent-rose-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>$200 tight</span>
              <span className="text-amber-400 font-semibold">$250 standard</span>
              <span>$300 max</span>
            </div>
          </div>

          {/* Profit Target Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 flex items-center space-x-1">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                <span>Profit Target ($500–$600):</span>
              </span>
              <span className="text-emerald-400 font-bold text-sm">
                ${targetDollars}
              </span>
            </div>
            <input
              type="range"
              min="400"
              max="750"
              step="50"
              value={targetDollars}
              onChange={(e) => onChangeTarget(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>$500 (~2R)</span>
              <span className="text-emerald-400 font-semibold">$550 (~2.2R)</span>
              <span>$600+ (~2.5R)</span>
            </div>
          </div>
        </div>

        {/* Max Stop Points Breakdown */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-slate-400">
              Max Stop on 1 NQ ($20/pt)
            </span>
            <div className="mt-1 flex items-baseline space-x-2">
              <span className="text-2xl font-mono font-bold text-white">
                {guidance.maxStopPointsNQ}
              </span>
              <span className="text-xs font-mono text-slate-400">points</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 mt-1">
              ${riskDollars} ÷ $20.00/pt
            </span>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-slate-400">
              Target Distance (1 NQ)
            </span>
            <div className="mt-1 flex items-baseline space-x-2">
              <span className="text-2xl font-mono font-bold text-emerald-400">
                {(targetDollars / 20).toFixed(1)}
              </span>
              <span className="text-xs font-mono text-slate-400">points</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400/80 mt-1">
              R:R Ratio = {(targetDollars / riskDollars).toFixed(2)}R
            </span>
          </div>
        </div>

        {/* Volatility Warning / Stop Clipping Alert */}
        {isClipping ? (
          <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-800/80 text-amber-200 space-y-2">
            <div className="flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-mono font-bold text-amber-300 block">
                  HIGH STOP-CLIPPING VULNERABILITY DETECTED
                </span>
                <p className="text-xs font-mono text-amber-200/90 leading-relaxed mt-1">
                  {guidance.stopClippingReason}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/60 text-emerald-200 text-xs font-mono flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{guidance.stopClippingReason}</span>
          </div>
        )}

        {/* Recommended Sizing Advice Box */}
        <div className="p-3.5 rounded-lg bg-cyan-950/20 border border-cyan-800/60">
          <div className="flex items-center justify-between text-xs font-mono text-cyan-400 mb-1">
            <span className="font-bold flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>OPTIMAL POSITION SIZING ADVICE</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px]">
              {guidance.recommendedSizing.instrument}
            </span>
          </div>
          <p className="text-xs font-mono text-cyan-200 leading-relaxed">
            {guidance.recommendedSizing.summary}
          </p>
        </div>

        {/* MNQ Precision Sizing Matrix */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
            MNQ Micro Precision Stop Buffer Matrix:
          </span>
          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
            {guidance.mnqAlternatives.map((alt, i) => (
              <div
                key={i}
                className="p-2.5 rounded bg-slate-950 border border-slate-800/80 text-center space-y-1"
              >
                <div className="font-bold text-white">
                  {alt.contracts} MNQ (${alt.contracts * 2}/pt)
                </div>
                <div className="text-cyan-400 font-semibold text-sm">
                  {alt.stopPoints} pt stop
                </div>
                <div className="text-[10px] text-slate-400">
                  Buffer:{" "}
                  <span
                    className={
                      alt.comfortLevel === "RECOMMENDED"
                        ? "text-emerald-400 font-semibold"
                        : alt.comfortLevel === "CONSERVATIVE"
                        ? "text-cyan-400"
                        : "text-amber-400"
                    }
                  >
                    {alt.comfortLevel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 bg-slate-950/70 border-t border-slate-800/80 text-[11px] font-mono text-slate-400 flex items-center justify-between">
        <span>Golden Rule: 1 Trade/Day</span>
        <span className="text-rose-400 font-semibold">Max Daily Loss: ${riskDollars + 50}</span>
      </div>
    </div>
  );
}
