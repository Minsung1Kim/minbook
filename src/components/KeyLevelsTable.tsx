"use client";

import React, { useState, useMemo } from "react";
import { Copy, Check, ArrowUpDown, Target, Zap, Crosshair } from "lucide-react";
import { KeyLevel, LevelRole } from "@/types/market";

interface KeyLevelsTableProps {
  levels: KeyLevel[];
  currentPrice: number;
  focusedLevelId?: string | null;
  onSelectLevel?: (level: KeyLevel) => void;
}

interface RankedLevel extends KeyLevel {
  distance: number;
  proximityScore: number;
  structuralWeight: number;
  hitProbability: number;
  hitStatus: "TAP IMMINENT" | "HIGH HIT PROB" | "MODERATE HIT PROB" | "EXPANSION MAGNET" | "OUTER BOUNDARY";
  statusColor: string;
  traderDirective: string;
}

export function computeLevelVitality(level: KeyLevel, currentPrice: number): RankedLevel {
  const distance = Math.abs(level.price - currentPrice);

  // 1. Institutional Structural Weight (Hierarchy of Importance)
  let structuralWeight = 40;
  const id = level.id.toLowerCase();
  const short = level.shortName.toLowerCase();

  if (short.includes("vwap") || id.includes("vwap")) {
    structuralWeight = 100; // #1 Institutional execution benchmark
  } else if (short === "onh" || short === "onl" || id.includes("onh") || id.includes("onl")) {
    structuralWeight = 95; // Primary overnight liquidity pools
  } else if (short === "pdc" || id.includes("pdc")) {
    structuralWeight = 90; // Prior day inventory line-in-the-sand
  } else if (short === "on mid" || id.includes("on-mid")) {
    structuralWeight = 85; // 50% overnight equilibrium retrace
  } else if (short.includes("prior vah") || short.includes("prior val") || short.includes("prior poc") || id.includes("prior-vah") || id.includes("prior-poc") || id.includes("prior-val")) {
    structuralWeight = 82; // Prior Day Volume Profile (VAH / POC / VAL)
  } else if (short === "pdh" || short === "pdl") {
    structuralWeight = 80; // Daily extreme expansion targets
  } else if (short.includes("lon high") || short.includes("lon low") || short.includes("asia high") || short.includes("asia low")) {
    structuralWeight = 70; // Regional session liquidity pivots
  } else if (short.includes("htf 50") || short.includes("htf 61.8") || short.includes("htf 70.5") || id.includes("htf-")) {
    structuralWeight = 60; // Demoted 5-day HTF Fib (below PDH/PDL and Volume Profile)
  } else if (level.role === "EXPECTED MOVE") {
    structuralWeight = 30; // Outer daily implied volatility bands
  }

  // 2. Mathematical Proximity Score (0 to 100)
  // Closer levels have exponentially higher likelihood of being touched in 09:30-10:00
  const proximityScore = Math.max(5, Math.min(100, Math.round(100 - (distance / 160) * 100)));

  // 3. Composite Hit Probability % (calibrated 10% to 96%)
  // Heavy weighting on proximity (65%) + structural gravity (35%)
  const compositeScore = Math.round(proximityScore * 0.65 + structuralWeight * 0.35);
  const hitProbability = Math.max(10, Math.min(96, compositeScore));

  // 4. Hit Status Tag
  let hitStatus: "TAP IMMINENT" | "HIGH HIT PROB" | "MODERATE HIT PROB" | "EXPANSION MAGNET" | "OUTER BOUNDARY";
  let statusColor = "text-zinc-400 bg-zinc-800/80 border-zinc-700/80";

  if (distance <= 8) {
    hitStatus = "TAP IMMINENT";
    statusColor = "text-amber-400 bg-amber-500/10 border-amber-500/20";
  } else if (hitProbability >= 72) {
    hitStatus = "HIGH HIT PROB";
    statusColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  } else if (hitProbability >= 48) {
    hitStatus = "MODERATE HIT PROB";
    statusColor = "text-sky-400 bg-sky-500/10 border-sky-500/20";
  } else if (hitProbability >= 30) {
    hitStatus = "EXPANSION MAGNET";
    statusColor = "text-zinc-300 bg-zinc-800/80 border-zinc-700/80";
  } else {
    hitStatus = "OUTER BOUNDARY";
    statusColor = "text-zinc-500 bg-zinc-900 border-zinc-800";
  }

  // 5. Plain English Day Trader Directive
  let traderDirective = "";
  if (short.includes("vwap")) {
    traderDirective = "Institutional average price today — most common spot for pullbacks to bounce or rallies to stall.";
  } else if (short === "onh") {
    traderDirective = "Overnight High — resting buy stops sit above here; acts as an upside magnet or sweep-and-reject zone.";
  } else if (short === "onl") {
    traderDirective = "Overnight Low — resting sell stops sit below here; acts as a downside magnet or sweep-and-bounce zone.";
  } else if (short === "pdc") {
    traderDirective = "Yesterday's 4:00 PM Close — major line in the sand between buyers and sellers.";
  } else if (short === "on mid") {
    traderDirective = "Halfway mark of the overnight range — common pullback bounce zone.";
  } else if (short.includes("htf 50")) {
    traderDirective = "5-day 50% midpoint — major multi-day pullback zone.";
  } else if (short.includes("htf 61.8")) {
    traderDirective = "5-day 61.8% retracement — deepest common pullback zone before trend weakens.";
  } else if (short === "pdh") {
    traderDirective = "Yesterday's High — major upside target.";
  } else if (short === "pdl") {
    traderDirective = "Yesterday's Low — major downside target.";
  } else if (short.includes("lon high")) {
    traderDirective = "London session high — European resistance or breakout target.";
  } else if (short.includes("lon low")) {
    traderDirective = "London session low — European support or breakdown target.";
  } else if (short.includes("asia high")) {
    traderDirective = "Asia session high — Globex ceiling often swept during London or NY sessions.";
  } else if (short.includes("asia low")) {
    traderDirective = "Asia session low — Globex floor often swept during London or NY sessions.";
  } else if (level.role === "EXPECTED MOVE") {
    traderDirective = "Options-implied daily move boundary — moves often pause or revert near here.";
  } else {
    traderDirective = level.note;
  }

  return {
    ...level,
    distance,
    proximityScore,
    structuralWeight,
    hitProbability,
    hitStatus,
    statusColor,
    traderDirective
  };
}

export function KeyLevelsTable({
  levels,
  currentPrice,
  focusedLevelId,
  onSelectLevel,
}: KeyLevelsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"VITALITY" | "LADDER">("LADDER");

  // Rank and sort levels
  const rankedLevels = useMemo(() => {
    const list = levels.map((lvl) => computeLevelVitality(lvl, currentPrice));

    if (sortMode === "VITALITY") {
      // Sort primarily by hit probability descending, secondary by proximity
      return list.sort((a, b) => {
        if (b.hitProbability !== a.hitProbability) {
          return b.hitProbability - a.hitProbability;
        }
        return a.distance - b.distance;
      });
    }

    // Default ladder view: Price descending (High to Low)
    return list.sort((a, b) => b.price - a.price);
  }, [levels, currentPrice, sortMode]);

  const handleCopyLevel = (e: React.MouseEvent, lvl: KeyLevel) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${lvl.price.toFixed(2)}`);
    setCopiedId(lvl.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden font-sans">
      {/* Table Header & View Switcher */}
      <div className="px-3.5 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
            <Target className="w-3.5 h-3.5 text-zinc-400" />
            <span>Key Reference Levels</span>
          </span>
          <span className="text-[11px] text-zinc-500 tabular-nums">
            NQ: {currentPrice.toFixed(2)}
          </span>
        </div>

        {/* Sort Mode Segmented Switcher */}
        <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-[11px]">
          <button
            onClick={() => setSortMode("VITALITY")}
            className={`px-2 py-0.5 rounded transition-colors flex items-center space-x-1 ${
              sortMode === "VITALITY"
                ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Sort by most vital and most likely to get hit today"
          >
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Most Vital (Hit Likelihood)</span>
          </button>
          <button
            onClick={() => setSortMode("LADDER")}
            className={`px-2 py-0.5 rounded transition-colors flex items-center space-x-1 ${
              sortMode === "LADDER"
                ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
            title="Sort by price descending (High to Low ladder)"
          >
            <ArrowUpDown className="w-3 h-3" />
            <span>Price Ladder</span>
          </button>
        </div>
      </div>

      {/* Monospace Tight Table */}
      <div className="overflow-x-auto max-h-[420px] lg:max-h-[580px] xl:max-h-[640px] overflow-y-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-zinc-950/80 text-zinc-400 text-[11px] uppercase tracking-wider border-b border-zinc-800/80 sticky top-0 z-10">
            <tr>
              <th className="hidden sm:table-cell py-2 px-3 w-10 text-center">#</th>
              <th className="py-2 px-2.5 sm:px-3">Level &amp; Meaning</th>
              <th className="py-2 px-2 sm:px-2.5 text-right w-24 sm:w-28">Price</th>
              <th className="py-2 px-2 sm:px-2.5 text-right w-20 sm:w-24">Dist</th>
              <th className="hidden md:table-cell py-2 px-2.5 w-36 text-center">Hit Likelihood</th>
              <th className="py-2 px-1.5 sm:px-2 text-center w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 tabular-nums">
            {rankedLevels.map((lvl, idx) => {
              const dist = lvl.price - currentPrice;
              const isAbove = dist >= 0;
              const isFocused = focusedLevelId === lvl.id;
              const isCopied = copiedId === lvl.id;
              const isImminent = Math.abs(dist) <= 8;

              return (
                <tr
                  key={lvl.id}
                  onClick={() => onSelectLevel?.(lvl)}
                  className={`hover:bg-zinc-800/50 transition-colors cursor-pointer group ${
                    isFocused
                      ? "bg-zinc-800 text-zinc-100 font-semibold"
                      : isImminent
                      ? "bg-amber-500/5"
                      : ""
                  }`}
                  title="Click to highlight level on chart canvas"
                >
                  {/* Rank */}
                  <td className="hidden sm:table-cell py-2.5 px-3 text-center text-zinc-500 text-[11px] font-mono">
                    {sortMode === "VITALITY" ? `${idx + 1}` : "—"}
                  </td>

                  {/* Level Name & Plain English Directive */}
                  <td className="py-2 px-2.5 sm:py-2.5 sm:px-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-zinc-100 text-xs">
                          {lvl.shortName}
                        </span>
                        <span className="hidden sm:inline text-[11px] text-zinc-500 font-sans">
                          • {lvl.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 font-sans leading-tight line-clamp-1 group-hover:line-clamp-none transition-all">
                        {lvl.traderDirective}
                      </p>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="py-2 px-2 sm:py-2.5 sm:px-2.5 text-right text-zinc-100 font-semibold text-xs whitespace-nowrap">
                    {lvl.price.toFixed(2)}
                  </td>

                  {/* Distance */}
                  <td
                    className={`py-2 px-2 sm:py-2.5 sm:px-2.5 text-right font-medium text-xs whitespace-nowrap ${
                      isAbove ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isAbove ? "+" : ""}
                    {dist.toFixed(1)} pts
                  </td>

                  {/* Hit Likelihood Badge */}
                  <td className="hidden md:table-cell py-2.5 px-2.5 text-center whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${lvl.statusColor}`}
                    >
                      {lvl.hitStatus === "TAP IMMINENT"
                        ? "TAP IMMINENT"
                        : `${lvl.hitProbability}% · ${lvl.hitStatus.split(" ")[0]}`}
                    </span>
                  </td>

                  {/* Copy Button */}
                  <td className="py-2 px-1.5 sm:py-2.5 sm:px-2 text-center">
                    <button
                      onClick={(e) => handleCopyLevel(e, lvl)}
                      className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors opacity-75 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      title="Copy exact price"
                    >
                      {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default KeyLevelsTable;
