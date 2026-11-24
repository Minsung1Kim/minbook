"use client";

import React, { useState } from "react";
import {
  Compass,
  Crosshair,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Target,
  Scale,
  ListFilter,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Trader5Answers,
  FactorScoreItem,
  SMTDivergence,
  VolatilitySurface,
  GEXExposureData,
  FootprintSummary,
} from "@/types/market";

interface Trader5CoreAnswersCardProps {
  answers: Trader5Answers;
  currentPrice: number;
  factorScorecard?: FactorScoreItem[];
  smtDivergence?: SMTDivergence;
  volatilitySurface?: VolatilitySurface;
  gex?: GEXExposureData;
  footprint?: FootprintSummary;
}

export function Trader5CoreAnswersCard({
  answers,
  currentPrice,
  factorScorecard,
  smtDivergence,
  volatilitySurface,
  gex,
  footprint,
}: Trader5CoreAnswersCardProps) {
  const [showScorecard, setShowScorecard] = useState(false);
  const isBull = answers.biasDirection.includes("BULLISH");
  const isBear = answers.biasDirection.includes("BEARISH");

  return (
    <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden space-y-0">
      {/* Header Bar */}
      <div className="px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <span className="font-mono text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
            AI Trade Blueprint · 5 Core Answers
          </span>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          {factorScorecard && factorScorecard.length > 0 && (
            <button
              onClick={() => setShowScorecard(!showScorecard)}
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center space-x-1 transition-colors text-[11px]"
            >
              <ListFilter className="w-3 h-3 text-zinc-400" />
              <span>Quant Models ({factorScorecard.length})</span>
              {showScorecard ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}

          <span className="font-mono tabular-nums text-zinc-400 text-[11px]">
            NQ: <strong className="text-zinc-100">{currentPrice.toFixed(2)}</strong>
          </span>
        </div>
      </div>

      {/* Inspectable Factor Scorecard Drawer */}
      {showScorecard && factorScorecard && factorScorecard.length > 0 && (
        <div className="px-4 py-3 border-b border-zinc-800/80 bg-zinc-950/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-300">
              Quantitative Factor Breakdown
            </span>
            <span className="text-[11px] text-zinc-400 font-mono">
              Net Score:{" "}
              <strong className="text-zinc-100 tabular-nums">
                {factorScorecard.reduce((sum, item) => sum + item.score, 0) > 0 ? "+" : ""}
                {factorScorecard.reduce((sum, item) => sum + item.score, 0)}
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {factorScorecard.map((item, idx) => (
              <div
                key={idx}
                className="p-2 rounded bg-zinc-900 border border-zinc-800 flex items-start justify-between text-xs"
              >
                <div className="space-y-0.5 pr-2">
                  <span className="font-medium text-zinc-200 block">{item.factor}</span>
                  <p className="text-[11px] text-zinc-400 leading-tight">{item.detail}</p>
                </div>
                <span
                  className={`shrink-0 font-mono font-bold px-1.5 py-0.5 rounded text-[11px] tabular-nums ${
                    item.score > 0
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : item.score < 0
                      ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                  }`}
                >
                  {item.score > 0 ? "+1" : item.score < 0 ? "-1" : "0"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Signals Grid */}
      <div className="p-4 space-y-4 text-xs font-sans">
        {/* SIGNAL 1: Direction & Bias */}
        <div className="space-y-1.5 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-mono text-[11px] uppercase tracking-wider flex items-center space-x-1.5">
              <Compass className="w-3.5 h-3.5 text-zinc-400" />
              <span>1. Today&apos;s Directional Prediction</span>
            </span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              {answers.biasConfidence}
            </span>
          </div>

          <div className="flex items-center space-x-2 pt-0.5">
            {isBull ? (
              <span className="inline-flex items-center text-sm font-semibold text-emerald-400 space-x-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{answers.biasDirection}</span>
              </span>
            ) : isBear ? (
              <span className="inline-flex items-center text-sm font-semibold text-rose-400 space-x-1">
                <TrendingDown className="w-3.5 h-3.5" />
                <span>{answers.biasDirection}</span>
              </span>
            ) : (
              <span className="text-sm font-semibold text-zinc-200">
                {answers.biasDirection}
              </span>
            )}
          </div>

          <p className="text-zinc-300 leading-relaxed text-xs">
            {answers.biasReason}
          </p>
        </div>

        {/* SIGNAL 2: Stop Hunt & Opening Fakeout */}
        <div className="space-y-2 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-mono text-[11px] uppercase tracking-wider flex items-center space-x-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>2. Stop Hunt & Opening Trap</span>
            </span>
            <span
              className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                answers.stopHuntProbability.includes("HIGH")
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  : answers.stopHuntProbability.includes("MODERATE")
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-zinc-800 text-zinc-300 border-zinc-700"
              }`}
            >
              {answers.stopHuntProbability}
            </span>
          </div>

          <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800 text-xs space-y-1 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-500">TARGET LIQUIDITY:</span>
              <span className="text-amber-400 font-bold text-[11px]">
                {answers.stopHuntDetails.sweepLevelName}
              </span>
            </div>
            <div className="text-[11px] text-zinc-300 font-sans">
              {answers.stopHuntDetails.sideBeingHunted}
            </div>
          </div>

          <div className="space-y-1.5 text-xs font-sans">
            {answers.stopHuntDetails.theTrap && (
              <div className="p-2 rounded bg-zinc-950/50 border border-zinc-800 text-[11px] space-y-0.5">
                <span className="text-rose-400 font-mono text-[11px] uppercase tracking-wider block">
                  1. The Fakeout (Retail Trap):
                </span>
                <p className="text-zinc-300 leading-tight">
                  {answers.stopHuntDetails.theTrap}
                </p>
              </div>
            )}

            {answers.stopHuntDetails.theShiftMSS && (
              <div className="p-2 rounded bg-zinc-950/50 border border-zinc-800 text-[11px] space-y-0.5">
                <span className="text-zinc-300 font-mono text-[11px] uppercase tracking-wider block">
                  2. Reversal Confirmation (MSS):
                </span>
                <p className="text-zinc-300 leading-tight">
                  {answers.stopHuntDetails.theShiftMSS}
                </p>
              </div>
            )}

            {answers.stopHuntDetails.traderDirective && (
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] space-y-0.5">
                <span className="text-amber-400 font-mono text-[11px] uppercase tracking-wider block">
                  3. Exactly What You Do:
                </span>
                <p className="text-amber-200 leading-tight">
                  {answers.stopHuntDetails.traderDirective}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* SIGNAL 3: Where to Enter */}
        <div className="space-y-2 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-mono text-[11px] uppercase tracking-wider flex items-center space-x-1.5">
              <Crosshair className="w-3.5 h-3.5 text-zinc-400" />
              <span>3. Where to Enter (Discount Retrace)</span>
            </span>
            <span className="text-[11px] font-mono text-zinc-500">Wait for tap</span>
          </div>

          <div className="divide-y divide-zinc-800/60 border border-zinc-800 rounded bg-zinc-950/40">
            {answers.retraceLevels.map((lvl, idx) => (
              <div
                key={idx}
                className="px-2.5 py-1.5 flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <span className="font-medium text-zinc-200">{lvl.name}</span>
                  <span className="text-[11px] text-zinc-500 ml-1.5 font-sans">
                    {lvl.priority}
                  </span>
                </div>
                <div className="text-right tabular-nums">
                  <span className="font-semibold text-zinc-100">
                    {lvl.price.toFixed(1)}
                  </span>
                  <span className="text-[11px] text-zinc-500 ml-1.5">
                    {lvl.distancePts.toFixed(1)} pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SIGNAL 4: Profit Targets (Liquidity Magnets) */}
        <div className="space-y-2 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-mono text-[11px] uppercase tracking-wider flex items-center space-x-1.5">
              <Target className="w-3.5 h-3.5 text-zinc-400" />
              <span>4. Profit Targets (Liquidity Magnets)</span>
            </span>
            <span className="text-[11px] font-mono text-zinc-500">Targets</span>
          </div>

          <div className="divide-y divide-zinc-800/60 border border-zinc-800 rounded bg-zinc-950/40">
            {answers.drawsOnLiquidity.map((liq, idx) => (
              <div
                key={idx}
                className="px-2.5 py-1.5 flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <span className="font-medium text-zinc-200">{liq.name}</span>
                  <span className="text-[11px] text-zinc-500 ml-1.5 font-sans">
                    {liq.strength}
                  </span>
                </div>
                <div className="text-right tabular-nums">
                  <span className="font-semibold text-zinc-100">
                    {liq.price.toFixed(1)}
                  </span>
                  <span className="text-[11px] text-zinc-500 ml-1.5">
                    {liq.pointsDistance >= 0 ? `+${liq.pointsDistance}` : liq.pointsDistance} pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SIGNAL 5: Risk:Reward Plan */}
        <div className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800 flex items-center justify-between gap-2 text-xs">
          <div className="space-y-0.5">
            <span className="text-zinc-400 font-mono text-[11px] uppercase tracking-wider block">
              5. Risk:Reward &amp; Exit Plan
            </span>
            <span className="font-medium text-zinc-200 block">
              {answers.rrGuidance.recommendedStrategy}
            </span>
            <p className="text-[11px] text-zinc-400 font-sans leading-tight">
              {answers.rrGuidance.rationale}
            </p>
          </div>
          <div className="text-right font-mono tabular-nums shrink-0">
            <span className="text-sm font-bold text-zinc-100">
              ~{answers.rrGuidance.targetMultipleR}R
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Trader5CoreAnswersCard;
