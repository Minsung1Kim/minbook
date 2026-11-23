"use client";

import React, { useState, useEffect } from "react";
import { computePositionSizing, SizingResult } from "@/lib/risk/sizing";
import { Calculator, AlertTriangle, ShieldCheck, HelpCircle } from "lucide-react";

interface RiskSizingCardProps {
  atr15m: number;
  regimeRiskMultiplier: 1.0 | 0.5 | 0.0;
  defaultInstrument?: "NQ" | "MNQ";
  defaultBaseRisk?: number;
  defaultTargetRR?: number;
  suggestedStopPts?: number;
}

export function RiskSizingCard({
  atr15m = 25.0,
  regimeRiskMultiplier = 1.0,
  defaultInstrument = "MNQ",
  defaultBaseRisk = 250,
  defaultTargetRR = 2.2,
  suggestedStopPts
}: RiskSizingCardProps) {
  const [realPropDrawdown, setRealPropDrawdown] = useState<number>(2000);
  const [baseRiskDollars, setBaseRiskDollars] = useState<number>(defaultBaseRisk);
  const [targetRR, setTargetRR] = useState<number>(defaultTargetRR);
  const [instrument, setInstrument] = useState<"NQ" | "MNQ">(defaultInstrument);
  const [stopDistancePts, setStopDistancePts] = useState<number>(
    suggestedStopPts && suggestedStopPts > 0 ? suggestedStopPts : Math.round(atr15m * 0.85)
  );

  useEffect(() => {
    if (suggestedStopPts && suggestedStopPts > 0) {
      setStopDistancePts(suggestedStopPts);
    }
  }, [suggestedStopPts]);

  const sizing: SizingResult = computePositionSizing({
    realPropDrawdown,
    baseRiskDollars,
    targetRR,
    instrument,
    stopDistancePts,
    regimeRiskMultiplier,
    atr15m
  });

  return (
    <div className="p-5 rounded-lg bg-[#0f1624] border border-slate-800 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <Calculator className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white tracking-tight">
            Dynamic Contract & Stop Risk Sizer
          </h2>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-400">Regime Multiplier:</span>
          <span
            className={`px-2 py-0.5 rounded font-mono font-semibold text-[11px] ${
              regimeRiskMultiplier === 1.0
                ? "bg-emerald-950/60 border border-emerald-800 text-emerald-400"
                : regimeRiskMultiplier === 0.5
                ? "bg-amber-950/60 border border-amber-800 text-amber-400"
                : "bg-rose-950/60 border border-rose-800 text-rose-400"
            }`}
          >
            {regimeRiskMultiplier.toFixed(1)}x
          </span>
        </div>
      </div>

      {/* Input Controls */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <div>
          <label className="text-slate-400 block mb-1">Instrument</label>
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setInstrument("MNQ")}
              className={`py-1 rounded font-semibold text-center transition-colors ${
                instrument === "MNQ" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              MNQ
            </button>
            <button
              type="button"
              onClick={() => setInstrument("NQ")}
              className={`py-1 rounded font-semibold text-center transition-colors ${
                instrument === "NQ" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              NQ
            </button>
          </div>
        </div>

        <div>
          <label className="text-slate-400 block mb-1 flex items-center space-x-1">
            <span>Base Risk ($)</span>
          </label>
          <input
            type="number"
            step="25"
            min="100"
            max="1000"
            value={baseRiskDollars}
            onChange={(e) => setBaseRiskDollars(parseFloat(e.target.value) || 250)}
            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono tabular-nums font-medium"
          />
        </div>

        <div>
          <label className="text-slate-400 block mb-1 flex items-center space-x-1">
            <span>Stop Pts</span>
            <span title={`Auto-suggested from 0.75-1.25x 15m ATR (${atr15m} pts)`}>
              <HelpCircle className="w-3 h-3 text-slate-500" />
            </span>
          </label>
          <input
            type="number"
            step="1"
            min="5"
            max="150"
            value={stopDistancePts}
            onChange={(e) => setStopDistancePts(parseFloat(e.target.value) || 20)}
            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-rose-300 font-mono tabular-nums font-semibold"
          />
        </div>

        <div>
          <label className="text-slate-400 block mb-1">Target R:R</label>
          <input
            type="number"
            step="0.1"
            min="1.0"
            max="5.0"
            value={targetRR}
            onChange={(e) => setTargetRR(parseFloat(e.target.value) || 2.2)}
            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-emerald-300 font-mono tabular-nums font-semibold"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="text-slate-400 block mb-1">Prop Drawdown ($)</label>
          <input
            type="number"
            step="250"
            min="500"
            max="10000"
            value={realPropDrawdown}
            onChange={(e) => setRealPropDrawdown(parseFloat(e.target.value) || 2000)}
            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono tabular-nums"
          />
        </div>
      </div>

      {/* Sizing Outputs Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 block">Recommended Contracts</span>
          <div className="text-xl font-bold font-mono tabular-nums text-cyan-400 mt-0.5">
            {sizing.suggestedContracts} {sizing.instrument}
          </div>
          <span className="text-[11px] text-slate-500">
            ${sizing.pointValue}/pt per contract
          </span>
        </div>

        <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 block">Actual Dollar Risk</span>
          <div className="text-xl font-bold font-mono tabular-nums text-rose-400 mt-0.5">
            ${sizing.actualDollarRisk.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500">
            {sizing.stopDistancePts || stopDistancePts} pts stop distance
          </span>
        </div>

        <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 block">Target Profit</span>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-400 mt-0.5">
            ${sizing.actualTargetDollars.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500">
            {sizing.targetPoints} pts ({targetRR}R)
          </span>
        </div>

        <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
          <span className="text-xs text-slate-400 block">% of Prop Drawdown</span>
          <div
            className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${
              sizing.isDrawdownRiskElevated ? "text-amber-400" : "text-slate-200"
            }`}
          >
            {sizing.drawdownRiskPercent}%
          </div>
          <span className="text-[11px] text-slate-500">Max recommended: 12.5%</span>
        </div>
      </div>

      {/* Warnings & Directives */}
      {sizing.warnings.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {sizing.warnings.map((w, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded bg-amber-950/20 border border-amber-900/40 text-[11px] text-amber-300 flex items-start space-x-2"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Sizing Directive */}
      <div className="p-3 rounded bg-slate-900/40 border border-slate-800/80 text-xs text-slate-300 flex items-center space-x-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>{sizing.recommendationSummary}</span>
      </div>
    </div>
  );
}

export default RiskSizingCard;
