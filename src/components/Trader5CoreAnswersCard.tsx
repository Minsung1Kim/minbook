"use client";

import React from "react";
import {
  Compass,
  Crosshair,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Target,
  Scale
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
    <div className="rounded-lg bg-[#0f1624] border border-slate-800 overflow-hidden">
      {/* Header Bar */}
      <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-semibold tracking-tight text-white">
              Session Brief & Signals
            </h2>
            <span className="text-[11px] text-slate-400">
              — NY Open 9:30–10:00 AM ET
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-400">Current NQ:</span>
          <span className="font-mono tabular-nums font-semibold text-cyan-400">
            {currentPrice.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Main Signal Matrix */}
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* SIGNAL 1: Direction & Bias */}
        <div className="space-y-2 border-b md:border-b-0 md:border-r border-slate-800/80 pb-5 md:pb-0 md:pr-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center space-x-1.5">
              <Compass className="w-3.5 h-3.5 text-slate-400" />
              <span>Direction & Bias</span>
            </span>
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {answers.biasConfidence}
            </span>
          </div>

          <div className="flex items-center space-x-2 pt-0.5">
            {isBull ? (
              <span className="inline-flex items-center text-sm font-semibold text-emerald-400 space-x-1">
                <TrendingUp className="w-4 h-4" />
                <span>{answers.biasDirection}</span>
              </span>
            ) : isBear ? (
              <span className="inline-flex items-center text-sm font-semibold text-rose-400 space-x-1">
                <TrendingDown className="w-4 h-4" />
                <span>{answers.biasDirection}</span>
              </span>
            ) : (
              <span className="text-sm font-semibold text-slate-200">
                {answers.biasDirection}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            {answers.biasReason}
          </p>
        </div>

        {/* SIGNAL 2: Stop Hunt Likelihood */}
        <div className="space-y-2 pb-5 md:pb-0">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center space-x-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
              <span>Stop Hunt Likelihood</span>
            </span>
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {answers.stopHuntProbability}
            </span>
          </div>

          <div className="text-xs font-medium text-amber-300/90 pt-0.5">
            Liquidity target: {answers.stopHuntDetails.sideBeingHunted}
          </div>

          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            {answers.stopHuntDetails.actionableAdvice}
          </p>
        </div>

        {/* SIGNAL 3: Prime Retrace Levels */}
        <div className="space-y-2 border-t border-slate-800/80 pt-5 md:border-r md:pr-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center space-x-1.5">
              <Crosshair className="w-3.5 h-3.5 text-slate-400" />
              <span>Retrace Entry Levels</span>
            </span>
            <span className="text-[11px] text-slate-500">Wait for fill</span>
          </div>

          <div className="divide-y divide-slate-800/60 border border-slate-800/80 rounded bg-slate-900/40">
            {answers.retraceLevels.map((lvl, idx) => (
              <div
                key={idx}
                className="px-3 py-2 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-slate-200">{lvl.name}</span>
                    <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400 font-mono">
                      {lvl.priority}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{lvl.note}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="font-mono tabular-nums font-semibold text-slate-100">
                    {lvl.price.toFixed(1)}
                  </div>
                  <div className="font-mono tabular-nums text-[10px] text-slate-500">
                    {lvl.distancePts.toFixed(1)} pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SIGNAL 4: Draws on Liquidity (Magnets) */}
        <div className="space-y-2 border-t border-slate-800/80 pt-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center space-x-1.5">
              <Target className="w-3.5 h-3.5 text-slate-400" />
              <span>Draws on Liquidity</span>
            </span>
            <span className="text-[11px] text-slate-500">Session targets</span>
          </div>

          <div className="divide-y divide-slate-800/60 border border-slate-800/80 rounded bg-slate-900/40">
            {answers.drawsOnLiquidity.map((liq, idx) => (
              <div
                key={idx}
                className="px-3 py-2 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-medium text-slate-200">{liq.name}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {liq.strength} • {liq.type}
                  </span>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="font-mono tabular-nums font-semibold text-slate-100">
                    {liq.price.toFixed(1)}
                  </div>
                  <div className="font-mono tabular-nums text-[10px] text-slate-500">
                    {liq.pointsDistance >= 0 ? `+${liq.pointsDistance}` : liq.pointsDistance} pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SIGNAL 5: Session R:R Recommendation */}
      <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Scale className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-300">
              Session R:R Plan:
            </span>
            <span className="text-xs font-semibold text-white">
              {answers.rrGuidance.recommendedStrategy}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-sans leading-relaxed">
            {answers.rrGuidance.rationale}
          </p>
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <div className="text-[11px] text-slate-500">Target Multiple</div>
          <div className="text-sm font-mono tabular-nums font-bold text-slate-100">
            ~{answers.rrGuidance.targetMultipleR}R
          </div>
        </div>
      </div>
    </div>
  );
}
