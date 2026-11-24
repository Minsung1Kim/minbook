"use client";

import React, { useState } from "react";
import {
  Crosshair,
  ShieldAlert,
  Target,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Flame,
  Zap,
  Info,
  HelpCircle
} from "lucide-react";
import { LTFTradeCard, PropProfile } from "@/types/market";
import { PROP_PRESETS } from "@/lib/risk/propProfile";

interface LTFTradeCardViewProps {
  card?: LTFTradeCard;
  currentPrice: number;
  propProfile?: PropProfile;
  onSelectPropProfile?: (profile: PropProfile) => void;
}

export function LTFTradeCardView({
  card,
  currentPrice,
  propProfile = PROP_PRESETS.Topstep_EOD
}: LTFTradeCardViewProps) {
  const [showHTFContext, setShowHTFContext] = useState(false);
  const [showCardGuide, setShowCardGuide] = useState(false);

  if (!card) {
    return (
      <div className="rounded-lg bg-zinc-900/80 border border-zinc-800 p-4 text-xs font-mono text-zinc-400">
        Waiting for 09:30 AM ET market open bars to initialize LTF Execution Engine...
      </div>
    );
  }

  const isObservationLock = card.status === "OBSERVATION_LOCK";
  const isShort = card.direction === "SHORT";

  return (
    <div className="rounded-lg bg-zinc-900/90 border border-zinc-800 overflow-hidden font-sans space-y-0 shadow-xl">
      {/* Top Header Bar */}
      <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-950 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Crosshair className="w-4 h-4 text-cyan-400" />
          <span className="font-mono text-xs font-bold text-zinc-100 uppercase tracking-wider">
            1-Min NQ Scalp Card
          </span>
          <span
            className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
              card.archetype === "OBSERVATION_FREEZE"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : card.archetype === "SWEEP_MSS_REVERSAL"
                ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
            }`}
          >
            {card.archetype.replace(/_/g, " ")}
          </span>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          {/* Quick Rules Toggle */}
          <button
            onClick={() => setShowCardGuide(!showCardGuide)}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-mono text-[10px] flex items-center space-x-1 transition-colors"
            title="Click for simple scalper instructions"
          >
            <HelpCircle className="w-3 h-3 text-cyan-400" />
            <span>{showCardGuide ? "Hide Rules" : "Rules"}</span>
          </button>

          {/* Static Clean Scalper Badge - No Dropdown Clutter */}
          <span className="px-2.5 py-0.5 rounded bg-zinc-800/90 text-cyan-300 border border-zinc-700/80 font-mono text-[11px] font-semibold tracking-wider">
            MNQ SCALP MODE
          </span>

          <span className="font-mono text-[11px] text-zinc-400">
            NQ: <strong className="text-zinc-100 tabular-nums">{currentPrice.toFixed(2)}</strong>
          </span>
        </div>
      </div>

      {/* Quick Scalper Instructions Drawer */}
      {showCardGuide && (
        <div className="px-4 py-2.5 bg-cyan-950/40 border-b border-cyan-900/50 text-xs font-sans space-y-1.5 text-zinc-300">
          <div className="font-mono text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center space-x-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span>How to Trade This Card (Very Simple 3 Steps):</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
            <div className="p-1.5 rounded bg-zinc-900/80 border border-zinc-800/80">
              1. <strong className="text-zinc-100">Limit Entry:</strong> Set limit inside [{card.entryZone.low.toFixed(1)} – {card.entryZone.high.toFixed(1)}]. Do NOT market chase!
            </div>
            <div className="p-1.5 rounded bg-zinc-900/80 border border-zinc-800/80">
              2. <strong className="text-rose-400">Fixed Stop:</strong> Hard stop at {card.stopLoss.toFixed(1)} ({card.stopPts.toFixed(1)} pts / ${(card.stopPts * 2).toFixed(0)}).
            </div>
            <div className="p-1.5 rounded bg-zinc-900/80 border border-zinc-800/80">
              3. <strong className="text-emerald-400">Scale at TP1:</strong> Take 50% profit at {card.tp1.price.toFixed(1)}, move stop to BE, runner to {card.tp2.price.toFixed(1)}.
            </div>
          </div>
        </div>
      )}

      {/* Observation Lock Banner (09:30–09:33 ET) */}
      {isObservationLock && (
        <div className="px-4 py-2.5 bg-amber-950/40 border-b border-amber-900/50 flex items-start space-x-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5 font-mono">
            <span className="font-bold text-amber-300 uppercase tracking-wider block">
              09:30–09:33 ET Observation Freeze
            </span>
            <p className="text-zinc-300 text-[11px] leading-tight font-sans">
              Hands off mouse. Establishing 3-minute Opening Range: ORH ({card.orh3m?.toFixed(1)}) / ORL ({card.orl3m?.toFixed(1)}). Execution window opens at 09:34 ET.
            </p>
          </div>
        </div>
      )}

      {/* Anti-Chase Gate Alert Banner */}
      {card.antiChaseWarning && (
        <div className="px-4 py-2.5 bg-rose-950/50 border-b border-rose-900/60 flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5 font-mono">
            <span className="font-bold text-rose-300 uppercase tracking-wider block">
              Anti-Chase Gate: Do Not Market Chase
            </span>
            <p className="text-zinc-300 text-[11px] leading-tight font-sans">
              {card.antiChaseMessage}
            </p>
          </div>
        </div>
      )}

      {/* News Blackout Alert Banner */}
      {card.newsBlackoutWarning && (
        <div className="px-4 py-2 bg-rose-900/30 border-b border-rose-800/60 flex items-center space-x-2 text-xs font-mono text-rose-300">
          <Flame className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{card.newsBlackoutWarning}</span>
        </div>
      )}

      {/* Phantom Drawdown Warning Banner */}
      {card.phantomDrawdownWarning && (
        <div className="px-4 py-2 bg-amber-950/20 border-b border-amber-900/40 flex items-center space-x-2 text-[11px] font-mono text-amber-300">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{card.phantomDrawdownWarning}</span>
        </div>
      )}

      {/* Main Trade Parameters Grid */}
      <div className="p-4 space-y-3">
        {/* Row 1: Direction, Limit Entry Zone, Tight Scalp Stop, Position Size */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
          {/* Action / Direction */}
          <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
              Trade Action
            </span>
            <span
              className={`text-base font-bold block ${
                isShort ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {isShort ? "SELL / SHORT" : "BUY / LONG"}
            </span>
            <span className="text-[10px] text-zinc-400 block font-sans truncate">
              {card.archetype === "SWEEP_MSS_REVERSAL" ? "MSS Reversal" : "40-50% Retrace"}
            </span>
          </div>

          {/* Limit Entry Zone */}
          <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
              Limit Entry Zone
            </span>
            <span className="text-sm font-bold text-zinc-100 tabular-nums block">
              {card.entryZone.low.toFixed(1)} – {card.entryZone.high.toFixed(1)}
            </span>
            <span className="text-[10px] text-cyan-400 block tabular-nums">
              Mid: {card.entryZone.mid.toFixed(1)}
            </span>
          </div>

          {/* Tight Scalp Stop-Loss */}
          <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
              Scalp Stop-Loss
            </span>
            <span className="text-base font-bold text-rose-400 tabular-nums block">
              {card.stopLoss.toFixed(1)}
            </span>
            <span className="text-[10px] text-zinc-400 block tabular-nums">
              Risk: {card.stopPts.toFixed(1)} pts (${(card.stopPts * 2).toFixed(0)}/MNQ)
            </span>
          </div>

          {/* Position Sizing */}
          <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">
              Position Sizing
            </span>
            <span className="text-base font-bold text-amber-300 tabular-nums block">
              {card.contracts} MNQ
            </span>
            <span className="text-[10px] text-zinc-400 block tabular-nums truncate">
              Net Risk: ${card.netRiskDollars}
            </span>
          </div>
        </div>

        {/* Row 2: Scalp Targets (TP1 & TP2 with Brownian Touch Probabilities) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono">
          {/* TP1 Scalp Card */}
          <div className="p-3 rounded bg-zinc-950/70 border border-zinc-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-300 uppercase tracking-wider flex items-center space-x-1.5 font-semibold">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                <span>TP1 · Quick Scalp Target</span>
              </span>
              <span className="text-base font-bold text-emerald-400 tabular-nums">
                {card.tp1.price.toFixed(1)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="text-[11px] text-zinc-400 font-sans">{card.tp1.rationale}</span>
              <span className="tabular-nums font-semibold text-emerald-400">
                +{card.tp1.distancePts.toFixed(1)} pts (${(card.tp1.distancePts * 2).toFixed(0)}/MNQ)
              </span>
            </div>

            {/* Brownian Touch Probabilities */}
            <div className="pt-1 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400">
              <span>First-Passage Probability:</span>
              <span className="space-x-2 tabular-nums">
                <span>5m: <strong className="text-zinc-200">{(card.tp1.hitProb5m * 100).toFixed(0)}%</strong></span>
                <span>10m: <strong className="text-emerald-400">{(card.tp1.hitProb10m * 100).toFixed(0)}%</strong></span>
                <span>15m: <strong className="text-zinc-200">{(card.tp1.hitProb15m * 100).toFixed(0)}%</strong></span>
              </span>
            </div>
          </div>

          {/* TP2 Scalp Runner Card */}
          <div className="p-3 rounded bg-zinc-950/70 border border-zinc-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-300 uppercase tracking-wider flex items-center space-x-1.5 font-semibold">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                <span>TP2 · Scalp Runner Extension</span>
              </span>
              <span className="text-base font-bold text-cyan-400 tabular-nums">
                {card.tp2.price.toFixed(1)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="text-[11px] text-zinc-400 font-sans">{card.tp2.rationale}</span>
              <span className="tabular-nums font-semibold text-cyan-400">
                +{card.tp2.distancePts.toFixed(1)} pts (${(card.tp2.distancePts * 2).toFixed(0)}/MNQ)
              </span>
            </div>

            {/* Brownian Touch Probabilities */}
            <div className="pt-1 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400">
              <span>First-Passage Probability:</span>
              <span className="space-x-2 tabular-nums">
                <span>5m: <strong className="text-zinc-200">{(card.tp2.hitProb5m * 100).toFixed(0)}%</strong></span>
                <span>10m: <strong className="text-cyan-400">{(card.tp2.hitProb10m * 100).toFixed(0)}%</strong></span>
                <span>15m: <strong className="text-zinc-200">{(card.tp2.hitProb15m * 100).toFixed(0)}%</strong></span>
              </span>
            </div>
          </div>
        </div>

        {/* Row 3: Sizing & Scale-Out Execution Directive */}
        <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800 space-y-1 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Execution Directive</span>
            </span>
            <span className="text-zinc-400 tabular-nums text-[11px]">
              Target: <strong className="text-emerald-400">${card.netTargetDollars}</strong> · Net R:R: <strong className="text-zinc-100">{card.netRR}R</strong>
            </span>
          </div>
          <p className="text-zinc-300 text-[11px] leading-relaxed font-sans">
            {card.contractSplitDirective}
          </p>
        </div>

        {/* Row 4: 1m MSS Invalidation Rule */}
        <div className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800 flex items-start space-x-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5 font-mono">
            <span className="font-bold text-amber-300 uppercase tracking-wider block text-[11px]">
              1-Minute MSS Invalidation: {card.killSwitchPrice.toFixed(2)}
            </span>
            <p className="text-zinc-400 text-[11px] leading-tight font-sans">
              {card.killSwitchMessage}
            </p>
          </div>
        </div>

        {/* Collapsed HTF Context Only Panel */}
        {card.htfDemotedLevels && card.htfDemotedLevels.length > 0 && (
          <div className="border border-zinc-800/80 rounded bg-zinc-950/30 overflow-hidden text-xs">
            <button
              onClick={() => setShowHTFContext(!showHTFContext)}
              className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-500 hover:text-zinc-300 transition-colors font-mono text-[10px]"
            >
              <span>
                Distant HTF Levels ({card.htfDemotedLevels.length} Pivots &gt; 35 pts away — Not Scalp Targets)
              </span>
              <div className="flex items-center space-x-1">
                <span>{showHTFContext ? "Hide" : "Show"}</span>
                {showHTFContext ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </div>
            </button>

            {showHTFContext && (
              <div className="divide-y divide-zinc-800/50 border-t border-zinc-800/60 px-3 py-1 font-mono text-[11px]">
                {card.htfDemotedLevels.map((lvl, idx) => (
                  <div key={idx} className="py-1 flex items-center justify-between">
                    <div>
                      <span className="text-zinc-400">{lvl.name}</span>
                      <span className="text-zinc-600 ml-2">({lvl.price.toFixed(1)})</span>
                    </div>
                    <div className="flex items-center space-x-2 tabular-nums">
                      <span className="text-zinc-500">{lvl.distancePts.toFixed(1)} pts away</span>
                      <span className="px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-500">
                        {lvl.badge}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LTFTradeCardView;
