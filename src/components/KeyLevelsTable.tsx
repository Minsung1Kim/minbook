"use client";

import React, { useState } from "react";
import {
  Layers,
  Copy,
  Check,
  Download,
  Share2,
  ExternalLink,
  ChevronDown
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
        return "bg-rose-500/10 text-rose-300 border-rose-500/30";
      case "RETRACE ZONE":
        return "bg-cyan-500/10 text-cyan-300 border-cyan-500/30";
      case "EQUILIBRIUM":
        return "bg-amber-500/10 text-amber-300 border-amber-500/30";
      case "MAGNET":
        return "bg-purple-500/10 text-purple-300 border-purple-500/30";
      case "INVALIDATION":
        return "bg-red-500/20 text-red-300 border-red-500/40";
      default:
        return "bg-slate-500/10 text-slate-300 border-slate-500/30";
    }
  };

  return (
    <div className="rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden">
      {/* Header Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
            <Layers className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
              Reference Structure
            </span>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              Session Key Reference Levels
            </h2>
          </div>
        </div>

        {/* Copy / Export Buttons */}
        <div className="flex items-center space-x-2 text-xs font-mono">
          {exportNotice && (
            <span className="text-emerald-400 text-[11px] font-semibold animate-pulse">
              {exportNotice}
            </span>
          )}

          <button
            onClick={() => handleExportAll("tradingview")}
            className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center space-x-1"
            title="Copy as TradingView levels list"
          >
            <Copy className="w-3.5 h-3.5 text-cyan-400" />
            <span>TradingView</span>
          </button>

          <button
            onClick={() => handleExportAll("ninjatrader")}
            className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center space-x-1"
            title="Copy as NinjaTrader price levels"
          >
            <Copy className="w-3.5 h-3.5 text-emerald-400" />
            <span>NT8 / Tradovate</span>
          </button>

          <button
            onClick={() => handleExportAll("text")}
            className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center space-x-1"
            title="Copy formatted text memo"
          >
            <Share2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Copy Text</span>
          </button>
        </div>
      </div>

      {/* Levels Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-4 font-semibold">Level</th>
              <th className="py-2.5 px-3 font-semibold">Role</th>
              <th className="py-2.5 px-4 font-semibold text-right">Price</th>
              <th className="py-2.5 px-4 font-semibold text-right">Distance (pts)</th>
              <th className="py-2.5 px-4 font-semibold text-right">Distance (%)</th>
              <th className="py-2.5 px-4 font-semibold hidden md:table-cell">Context / Strategy Note</th>
              <th className="py-2.5 px-3 font-semibold text-center w-12">Copy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {levels.map((lvl) => {
              const isAbove = lvl.distancePoints >= 0;
              const isVeryClose = Math.abs(lvl.distancePoints) <= 12;
              const isCopied = copiedId === lvl.id;

              return (
                <tr
                  key={lvl.id}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    isVeryClose ? "bg-cyan-950/20 font-semibold" : ""
                  }`}
                >
                  {/* Name */}
                  <td className="py-2.5 px-4">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white tracking-wide">
                        {lvl.shortName}
                      </span>
                      <span className="text-[11px] text-slate-400 hidden sm:inline">
                        ({lvl.name})
                      </span>
                    </div>
                  </td>

                  {/* Role Badge */}
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getRoleBadge(
                        lvl.role
                      )}`}
                    >
                      {lvl.role}
                    </span>
                  </td>

                  {/* Price */}
                  <td className="py-2.5 px-4 text-right">
                    <span className="text-sm font-bold text-white tracking-wider">
                      {lvl.price.toFixed(2)}
                    </span>
                  </td>

                  {/* Distance in Points */}
                  <td className="py-2.5 px-4 text-right">
                    <span
                      className={`font-semibold ${
                        isAbove ? "text-emerald-400" : "text-rose-400"
                      } ${isVeryClose ? "text-cyan-300 font-bold" : ""}`}
                    >
                      {isAbove ? "+" : ""}
                      {lvl.distancePoints.toFixed(1)}
                    </span>
                    {isVeryClose && (
                      <span className="ml-1 text-[9px] px-1 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                        NEAR
                      </span>
                    )}
                  </td>

                  {/* Distance % */}
                  <td className="py-2.5 px-4 text-right text-slate-400">
                    {isAbove ? "+" : ""}
                    {lvl.distancePercent.toFixed(2)}%
                  </td>

                  {/* Note */}
                  <td className="py-2.5 px-4 text-slate-400 hidden md:table-cell text-[11px] max-w-xs truncate" title={lvl.note}>
                    {lvl.note}
                  </td>

                  {/* Copy Button */}
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => handleCopyLevel(lvl)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition-colors"
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
      <div className="p-3 bg-slate-950/70 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Green: Level Above Current Price</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>Red: Level Below Current Price</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>NEAR: Within 12 Points</span>
          </span>
        </div>
        <span className="text-slate-500">Sorted from Highest to Lowest</span>
      </div>
    </div>
  );
}
