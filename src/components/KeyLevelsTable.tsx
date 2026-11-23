"use client";

import React, { useState } from "react";
import {
  Layers,
  Copy,
  Check,
  Share2
} from "lucide-react";
import { KeyLevel, LevelRole } from "@/types/market";

interface KeyLevelsTableProps {
  levels: KeyLevel[];
  currentPrice: number;
}

export function KeyLevelsTable({ levels, currentPrice }: KeyLevelsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleCopyLevel = (lvl: KeyLevel) => {
    navigator.clipboard.writeText(`${lvl.price.toFixed(2)}`);
    setCopiedId(lvl.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportAll = (format: "tradingview" | "ninjatrader" | "text") => {
    let text = "";
    if (format === "tradingview") {
      text = levels.map((l) => `${l.shortName}: ${l.price.toFixed(2)}`).join("\n");
    } else if (format === "ninjatrader") {
      text = levels.map((l) => `${l.price.toFixed(2)},${l.shortName}`).join("\n");
    } else {
      text = `OpenPulse NQ Key Levels (Current Price: ${currentPrice.toFixed(2)}):\n` +
        levels.map((l) => `• ${l.shortName.padEnd(12)} ${l.price.toFixed(2).padStart(9)} (${l.distancePoints >= 0 ? "+" : ""}${l.distancePoints.toFixed(1)} pts) - [${l.role}]`).join("\n");
    }

    navigator.clipboard.writeText(text);
    setExportNotice(`Copied all levels (${format})!`);
    setTimeout(() => setExportNotice(null), 2500);
  };

  const getRoleBadge = (role: LevelRole) => {
    switch (role) {
      case "LIQUIDITY POOL":
        return "border-slate-700 text-rose-300 bg-slate-900";
      case "RETRACE ZONE":
        return "border-slate-700 text-cyan-300 bg-slate-900";
      case "EQUILIBRIUM":
        return "border-slate-700 text-amber-300 bg-slate-900";
      case "MAGNET":
        return "border-slate-700 text-slate-300 bg-slate-900";
      case "INVALIDATION":
        return "border-rose-800 text-rose-400 bg-rose-950/20";
      default:
        return "border-slate-700 text-slate-300 bg-slate-900";
    }
  };

  return (
    <div className="rounded-lg bg-[#0f1624] border border-slate-800 overflow-hidden">
      {/* Header Bar */}
      <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <Layers className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold tracking-tight text-white">
            Reference Levels
          </h2>
          <span className="text-xs text-slate-500">
            ({levels.length} levels keyed to session)
          </span>
        </div>

        {/* Copy / Export Buttons */}
        <div className="flex items-center space-x-2 text-xs">
          {exportNotice && (
            <span className="text-emerald-400 text-xs font-medium">
              {exportNotice}
            </span>
          )}

          <button
            onClick={() => handleExportAll("tradingview")}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center space-x-1"
            title="Copy as TradingView levels list"
          >
            <Copy className="w-3 h-3 text-cyan-400" />
            <span>TradingView</span>
          </button>

          <button
            onClick={() => handleExportAll("ninjatrader")}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center space-x-1"
            title="Copy as NinjaTrader price levels"
          >
            <Copy className="w-3 h-3 text-emerald-400" />
            <span>NT8</span>
          </button>

          <button
            onClick={() => handleExportAll("text")}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center space-x-1"
            title="Copy formatted text memo"
          >
            <Share2 className="w-3 h-3 text-slate-400" />
            <span>Text</span>
          </button>
        </div>
      </div>

      {/* Levels Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-medium">
            <tr>
              <th className="py-2.5 px-4">Level</th>
              <th className="py-2.5 px-3">Role</th>
              <th className="py-2.5 px-4 text-right">Price</th>
              <th className="py-2.5 px-4 text-right">Distance (pts)</th>
              <th className="py-2.5 px-4 text-right">Distance (%)</th>
              <th className="py-2.5 px-4 hidden md:table-cell">Context</th>
              <th className="py-2.5 px-3 text-center w-12">Copy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-sans">
            {levels.map((lvl) => {
              const isAbove = lvl.distancePoints >= 0;
              const isVeryClose = Math.abs(lvl.distancePoints) <= 12;
              const isCopied = copiedId === lvl.id;

              return (
                <tr
                  key={lvl.id}
                  className={`hover:bg-slate-800/30 transition-colors ${
                    isVeryClose ? "bg-cyan-950/20 font-medium" : ""
                  }`}
                >
                  {/* Name */}
                  <td className="py-2.5 px-4">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-100 font-mono">
                        {lvl.shortName}
                      </span>
                      <span className="text-[11px] text-slate-400 hidden sm:inline">
                        {lvl.name}
                      </span>
                    </div>
                  </td>

                  {/* Role Badge */}
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${getRoleBadge(
                        lvl.role
                      )}`}
                    >
                      {lvl.role}
                    </span>
                  </td>

                  {/* Price */}
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-100">
                    {lvl.price.toFixed(2)}
                  </td>

                  {/* Distance in Points */}
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    <span
                      className={`font-semibold ${
                        isAbove ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {isAbove ? "+" : ""}
                      {lvl.distancePoints.toFixed(1)}
                    </span>
                    {isVeryClose && (
                      <span className="ml-1 text-[9px] px-1 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/80 font-sans">
                        NEAR
                      </span>
                    )}
                  </td>

                  {/* Distance % */}
                  <td className="py-2.5 px-4 text-right text-slate-400 font-mono tabular-nums">
                    {isAbove ? "+" : ""}
                    {lvl.distancePercent.toFixed(2)}%
                  </td>

                  {/* Note */}
                  <td className="py-2.5 px-4 text-slate-400 hidden md:table-cell text-xs max-w-xs truncate" title={lvl.note}>
                    {lvl.note}
                  </td>

                  {/* Copy Button */}
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => handleCopyLevel(lvl)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                      title="Copy price"
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

      {/* Footer Legend */}
      <div className="px-5 py-2.5 bg-slate-900/40 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Above current price</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>Below current price</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>Near: Within 12 pts</span>
          </span>
        </div>
        <span className="text-slate-500">Sorted high to low</span>
      </div>
    </div>
  );
}
