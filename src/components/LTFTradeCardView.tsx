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
  Info
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
  propProfile = PROP_PRESETS.Topstep_EOD,
  onSelectPropProfile
}: LTFTradeCardViewProps) {
  const [showHTFContext, setShowHTFContext] = useState(false);
  const [showProfileSelector, setShowProfileSelector] = useState(false);

  if (!card) {
    return (
      <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 p-4 text-xs font-mono text-zinc-400">
        Waiting for 09:30 AM ET market open bars to initialize LTF Execution Engine...
      </div>
    );
  }

  const isObservationLock = card.status === "OBSERVATION_LOCK";
  const isShort = card.direction === "SHORT";

  return (
    <div className="rounded-lg bg-zinc-900/90 border border-zinc-800/90 overflow-hidden font-sans space-y-0 shadow-lg">
      {/* Top Header Bar */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Crosshair className="w-4 h-4 text-cyan-400" />
          <span className="font-mono text-xs font-bold text-zinc-100 uppercase tracking-wider">
            1-Min Intraday Execution Card
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
          {/* Prop Profile Badge / Dropdown Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowProfileSelector(!showProfileSelector)}
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-mono text-[11px] flex items-center space-x-1 transition-colors"
            >
              <span>{propProfile.accountName}</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {showProfileSelector && (
              <div className="absolute right-0 mt-1 w-64 bg-zinc-950 border border-zinc-800 rounded shadow-xl z-50 p-1 divide-y divide-zinc-900">
                <div className="px-2 py-1 text-[10px] font-mono text-zinc-500 uppercase">
                  Select Prop Profile
                </div>
                {Object.values(PROP_PRESETS).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectPropProfile?.(p);
                      setShowProfileSelector(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-colors flex items-center justify-between ${
                      p.id === propProfile.id
                        ? "bg-cyan-950/60 text-cyan-300"
                        : "hover:bg-zinc-900 text-zinc-300"
                    }`}
                  >
                    <span>{p.accountName}</span>
                    <span className="text-[10px] text-zinc-500">{p.drawdownMode.split("_")[0]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="font-mono text-[11px] text-zinc-400">
            NQ: <strong className="text-zinc-100 tabular-nums">{currentPrice.toFixed(2)}</strong>
          </span>
        </div>
      </div>

      {/* Observation Lock Banner (09:30–09:33 ET) */}
      {isObservationLock && (
        <div className="px-4 py-3 bg-amber-950/30 border-b border-amber-900/50 flex items-start space-x-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5 font-mono">
            <span className="font-bold text-amber-300 uppercase tracking-wider block">
              09:30–09:33 ET Observation Freeze Active
            </span>
            <p className="text-zinc-300 text-[11px] leading-tight font-sans">
              Hands off mouse. Establishing 3-minute Opening Range: ORH ({card.orh3m?.toFixed(1)}) / ORL ({card.orl3m?.toFixed(1)}). The execution window opens at 09:34 ET.
            </p>
          </div>
        </div>
      )}

      {/* Anti-Chase Gate Alert Banner */}
      {card.antiChaseWarning && (
        <div className="px-4 py-3 bg-rose-950/40 border-b border-rose-900/50 flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1 font-mono">
            <span className="font-bold text-rose-300 uppercase tracking-wider block">
              Anti-Chase Gate Triggered — Do Not Market Chase
            </span>
            <p className="text-zinc-300 text-[11px] leading-tight font-sans">
              {card.antiChaseMessage}
            </p>
          </div>
        </div>
      )}

      {/* News Blackout Alert Banner */}
      {card.newsBlackoutWarning && (
        <div className="px-4 py-2.5 bg-rose-900/30 border-b border-rose-800/60 flex items-center space-x-2 text-xs font-mono text-rose-300">
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
      <div className="p-4 space-y-4">
        {/* Row 1: Direction, Limit Entry Zone, Stop-Loss */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
          {/* Direction */}
          <div className="p-3 rounded bg-zinc-950/60 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider block">
              Trade Direction
            </span>
            <span
              className={`text-sm font-bold block ${
                isShort ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {card.direction} ({card.archetype === "SWEEP_MSS_REVERSAL" ? "MSS REVERSAL" : "40-50% RETRACE"})
            </span>
            <span className="text-[10px] text-zinc-400 block font-sans">
              1 trade per day mandate
            </span>
          </div>

          {/* Limit Entry Zone */}
          <div className="p-3 rounded bg-zinc-950/60 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider block">
              Limit Entry Zone
            </span>
            <span className="text-sm font-bold text-zinc-100 tabular-nums block">
              {card.entryZone.low.toFixed(1)} – {card.entryZone.high.toFixed(1)}
            </span>
            <span className="text-[10px] text-cyan-400 block tabular-nums">
              Mid Benchmark: {card.entryZone.mid.toFixed(1)}
            </span>
          </div>

          {/* Structural Stop-Loss */}
          <div className="p-3 rounded bg-zinc-950/60 border border-zinc-800 space-y-1">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider block">
              1m Structural Stop
            </span>
            <span className="text-sm font-bold text-rose-400 tabular-nums block">
              {card.stopLoss.toFixed(1)}
            </span>
            <span className="text-[10px] text-zinc-400 block tabular-nums">
              Risk: {card.stopPts.toFixed(1)} pts (Swing + buffer)
            </span>
          </div>
        </div>

        {/* Row 2: Reachability Targets (TP1 & TP2 with Brownian Touch Probabilities) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono">
          {/* TP1 Card */}
          <div className="p-3 rounded bg-zinc-950/60 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider flex items-center space-x-1.5 font-semibold">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                <span>TP1 · Primary Scalp [0.25–0.45x ATR]</span>
              </span>
              <span className="text-sm font-bold text-emerald-400 tabular-nums">
                {card.tp1.price.toFixed(1)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="text-[11px] text-zinc-400 font-sans">{card.tp1.rationale}</span>
              <span className="tabular-nums font-semibold">+{card.tp1.distancePts.toFixed(1)} pts</span>
            </div>

            {/* Brownian Touch Probabilities */}
            <div className="pt-1 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400">
              <span>First-Passage Prob:</span>
              <span className="space-x-2 tabular-nums">
                <span>5m: <strong className="text-zinc-200">{(card.tp1.hitProb5m * 100).toFixed(0)}%</strong></span>
                <span>10m: <strong className="text-emerald-400">{(card.tp1.hitProb10m * 100).toFixed(0)}%</strong></span>
                <span>15m: <strong className="text-zinc-200">{(card.tp1.hitProb15m * 100).toFixed(0)}%</strong></span>
              </span>
            </div>
          </div>

          {/* TP2 Card */}
          <div className="p-3 rounded bg-zinc-950/60 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider flex items-center space-x-1.5 font-semibold">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                <span>TP2 · Runner Extension [0.50–0.75x ATR]</span>
              </span>
              <span className="text-sm font-bold text-cyan-400 tabular-nums">
                {card.tp2.price.toFixed(1)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="text-[11px] text-zinc-400 font-sans">{card.tp2.rationale}</span>
              <span className="tabular-nums font-semibold">+{card.tp2.distancePts.toFixed(1)} pts</span>
            </div>

            {/* Brownian Touch Probabilities */}
            <div className="pt-1 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400">
              <span>First-Passage Prob:</span>
              <span className="space-x-2 tabular-nums">
                <span>5m: <strong className="text-zinc-200">{(card.tp2.hitProb5m * 100).toFixed(0)}%</strong></span>
                <span>10m: <strong className="text-cyan-400">{(card.tp2.hitProb10m * 100).toFixed(0)}%</strong></span>
                <span>15m: <strong className="text-zinc-200">{(card.tp2.hitProb15m * 100).toFixed(0)}%</strong></span>
              </span>
            </div>
          </div>
        </div>

        {/* Row 3: Sizing, Scale-Out Split & Net R:R after Friction */}
        <div className="p-3 rounded bg-zinc-950/80 border border-zinc-800 space-y-2 text-xs font-mono">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-zinc-200 uppercase tracking-wider">
                Position Sizing: {card.contracts} MNQ Contracts
              </span>
            </div>
            <div className="flex items-center space-x-3 tabular-nums">
              <span className="text-zinc-400">Net Risk: <strong className="text-rose-400">${card.netRiskDollars}</strong></span>
              <span className="text-zinc-400">Net Target: <strong className="text-emerald-400">${card.netTargetDollars}</strong></span>
              <span className="text-zinc-400">Net R:R: <strong className="text-zinc-100">{card.netRR}R</strong></span>
            </div>
          </div>

          <p className="text-zinc-300 text-[11px] leading-tight font-sans">
            {card.contractSplitDirective}
          </p>

          {card.consistencyCapWarning && (
            <p className="text-amber-400 text-[11px] font-sans">
              {card.consistencyCapWarning}
            </p>
          )}
        </div>

        {/* Row 4: 1m MSS Exit / Kill-Switch Price */}
        <div className="p-3 rounded bg-zinc-950/60 border border-zinc-800 flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5 font-mono">
            <span className="font-bold text-amber-300 uppercase tracking-wider block">
              1-Minute MSS Exit / Kill-Switch Price: {card.killSwitchPrice.toFixed(2)}
            </span>
            <p className="text-zinc-400 text-[11px] leading-tight font-sans">
              {card.killSwitchMessage}
            </p>
          </div>
        </div>

        {/* Collapsed HTF Context Only Panel */}
        {card.htfDemotedLevels && card.htfDemotedLevels.length > 0 && (
          <div className="border border-zinc-800 rounded bg-zinc-950/40 overflow-hidden text-xs">
            <button
              onClick={() => setShowHTFContext(!showHTFContext)}
              className="w-full px-3 py-2 flex items-center justify-between text-zinc-400 hover:text-zinc-200 transition-colors font-mono text-[11px]"
            >
              <span>
                HTF Context Only ({card.htfDemotedLevels.length} Distant Levels Demoted &gt; 0.75x ATR)
              </span>
              <div className="flex items-center space-x-1">
                <span className="text-[10px] text-zinc-500">Not Scalp Targets</span>
                {showHTFContext ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </button>

            {showHTFContext && (
              <div className="divide-y divide-zinc-800/60 border-t border-zinc-800 px-3 py-1 font-mono text-[11px]">
                {card.htfDemotedLevels.map((lvl, idx) => (
                  <div key={idx} className="py-1.5 flex items-center justify-between">
                    <div>
                      <span className="text-zinc-300 font-semibold">{lvl.name}</span>
                      <span className="text-zinc-500 ml-2">({lvl.price.toFixed(1)})</span>
                    </div>
                    <div className="flex items-center space-x-3 tabular-nums">
                      <span className="text-zinc-400">{lvl.distancePts.toFixed(1)} pts</span>
                      <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400">
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
