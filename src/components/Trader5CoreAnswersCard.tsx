"use client";

import React from "react";
import {
  Compass,
  Crosshair,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Target,
  Magnet,
  Scale,
  Sparkles,
  ArrowRight,
  HelpCircle,
  AlertTriangle
} from "lucide-react";
import { Trader5Answers } from "@/types/market";

interface Trader5CoreAnswersCardProps {
  answers: Trader5Answers;
  currentPrice: number;
}

export function Trader5CoreAnswersCard({ answers, currentPrice }: Trader5CoreAnswersCardProps) {
  const isBull = answers.biasDirection.includes("BULLISH");
  const isBear = answers.biasDirection.includes("BEARISH");

  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-cyan-800/80 shadow-2xl p-5 sm:p-6 space-y-5 font-mono">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
              Pre-Market & NY Open Briefing (9:30–10:00 AM ET)
            </span>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white font-sans">
              The 5 Core Trader Questions (Answered)
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
            Current NQ: {currentPrice.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Grid of the 5 Answers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ANSWER 1: Direction & Bias */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>1. Direction & Bias:</span>
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded font-bold ${
                isBull
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : isBear
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              }`}
            >
              {answers.biasConfidence} CONFIDENCE
            </span>
          </div>

          <div className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center space-x-2">
            {isBull ? (
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            ) : isBear ? (
              <TrendingDown className="w-5 h-5 text-rose-400" />
            ) : null}
            <span>{answers.biasDirection}</span>
          </div>

          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            {answers.biasReason}
          </p>
        </div>

        {/* ANSWER 2: Will Stops Be Hunted Before Shooting Up? */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>2. Will Stops Be Hunted First?</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
              {answers.stopHuntProbability}
            </span>
          </div>

          <div className="text-sm font-bold text-amber-300 font-sans">
            Hunting: {answers.stopHuntDetails.sideBeingHunted}
          </div>

          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            {answers.stopHuntDetails.actionableAdvice}
          </p>
        </div>

        {/* ANSWER 3: Exact Levels to Retrace Into */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
            <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
            <span>3. What Levels Could It Retrace Into?</span>
          </span>

          <div className="space-y-2">
            {answers.retraceLevels.map((lvl, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white">{lvl.name}</span>
                    <span className="text-[10px] px-1.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      {lvl.priority}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans mt-0.5">{lvl.note}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-sm font-bold text-emerald-400 font-mono">
                    {lvl.price.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {lvl.distancePts.toFixed(1)} pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ANSWER 4: Strongest Draws on Liquidity (Magnets) */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
            <Magnet className="w-3.5 h-3.5 text-cyan-400" />
            <span>4. Strongest Draws on Liquidity (Magnets):</span>
          </span>

          <div className="space-y-2">
            {answers.drawsOnLiquidity.map((liq, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white">{liq.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-sans block mt-0.5">
                    {liq.strength} • {liq.type}
                  </span>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-sm font-bold text-cyan-300 font-mono">
                    {liq.price.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {liq.pointsDistance >= 0 ? `+${liq.pointsDistance}` : liq.pointsDistance} pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ANSWER 5: Higher R:R vs Lower R:R for the Session */}
        <div className="col-span-1 md:col-span-2 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <span>5. Higher R:R vs Lower R:R for Today's Session:</span>
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded font-bold bg-amber-950 text-amber-300 border border-amber-800">
              TARGET MULTIPLE: ~{answers.rrGuidance.targetMultipleR}R
            </span>
          </div>

          <div className="text-sm sm:text-base font-bold text-white font-sans flex items-center space-x-2">
            <span className="text-cyan-400">RECOMMENDATION:</span>
            <span>{answers.rrGuidance.recommendedStrategy}</span>
          </div>

          <p className="text-xs text-slate-300 font-sans leading-relaxed">
            {answers.rrGuidance.rationale}
          </p>
        </div>
      </div>
    </div>
  );
}
