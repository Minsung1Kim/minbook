"use client";

import React, { useState, useEffect } from "react";
import { computePositionSizing, SizingResult } from "@/lib/risk/sizing";
import { Calculator, AlertTriangle, ShieldCheck } from "lucide-react";

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
  suggestedStopPts,
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
    atr15m,
  });

  return (
    <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden space-y-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80 text-xs font-mono">
        <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[11px]">
          Contract & Risk Sizer
        </span>
        <div className="flex items-center space-x-1.5">
          <span className="text-zinc-500">Regime:</span>
          <span
            className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${
              regimeRiskMultiplier === 1.0
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : regimeRiskMultiplier === 0.5
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            }`}
          >
            {regimeRiskMultiplier.toFixed(1)}x
          </span>
        </div>
      </div>

      {/* Input Controls */}
      <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
        <div>
          <label className="text-zinc-400 text-[11px] block mb-1">Contract</label>
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded bg-zinc-950 border border-zinc-800">
            <button
              type="button"
              onClick={() => setInstrument("MNQ")}
              className={`py-1 rounded font-semibold text-center transition-colors text-[11px] ${
                instrument === "MNQ"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              MNQ
            </button>
            <button
              type="button"
              onClick={() => setInstrument("NQ")}
              className={`py-1 rounded font-semibold text-center transition-colors text-[11px] ${
                instrument === "NQ"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              NQ
            </button>
          </div>
        </div>

        <div>
          <label className="text-zinc-400 text-[11px] block mb-1">Base Risk ($)</label>
          <input
            type="number"
            step="25"
            min="100"
            max="1000"
            value={baseRiskDollars}
            onChange={(e) => setBaseRiskDollars(parseFloat(e.target.value) || 250)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-zinc-100 font-mono tabular-nums text-xs"
          />
        </div>

        <div>
          <label className="text-zinc-400 text-[11px] block mb-1">Stop Pts</label>
          <input
            type="number"
            step="1"
            min="5"
            max="150"
            value={stopDistancePts}
            onChange={(e) => setStopDistancePts(parseFloat(e.target.value) || 20)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-rose-400 font-mono tabular-nums text-xs font-semibold"
          />
        </div>

        <div>
          <label className="text-zinc-400 text-[11px] block mb-1">Target R:R</label>
          <input
            type="number"
            step="0.1"
            min="1.0"
            max="5.0"
            value={targetRR}
            onChange={(e) => setTargetRR(parseFloat(e.target.value) || 2.2)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-emerald-400 font-mono tabular-nums text-xs font-semibold"
          />
        </div>
      </div>

      {/* Outputs */}
      <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
        <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800">
          <span className="text-[10px] uppercase text-zinc-500 block">Suggested Size</span>
          <div className="text-lg font-bold tabular-nums text-zinc-100 mt-0.5">
            {sizing.suggestedContracts} {sizing.instrument}
          </div>
          <span className="text-[10px] text-zinc-500">${sizing.pointValue}/pt</span>
        </div>

        <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800">
          <span className="text-[10px] uppercase text-zinc-500 block">Actual Dollar Risk</span>
          <div className="text-lg font-bold tabular-nums text-rose-400 mt-0.5">
            ${sizing.actualDollarRisk.toLocaleString()}
          </div>
          <span className="text-[10px] text-zinc-500">{stopDistancePts} pts stop</span>
        </div>

        <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800">
          <span className="text-[10px] uppercase text-zinc-500 block">Target Gain</span>
          <div className="text-lg font-bold tabular-nums text-emerald-400 mt-0.5">
            +${sizing.actualTargetDollars.toLocaleString()}
          </div>
          <span className="text-[10px] text-zinc-500">{(stopDistancePts * targetRR).toFixed(1)} pts</span>
        </div>

        <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800">
          <span className="text-[10px] uppercase text-zinc-500 block">Drawdown Risk</span>
          <div className="text-lg font-bold tabular-nums text-zinc-200 mt-0.5">
            {sizing.drawdownRiskPercent.toFixed(1)}%
          </div>
          <span className="text-[10px] text-zinc-500">of ${realPropDrawdown} cap</span>
        </div>
      </div>

      {/* Warnings */}
      {sizing.isStopTooTight && (
        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center space-x-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Stop {stopDistancePts} pts &lt; 0.5x 15m ATR ({atr15m} pts). High whipsaw risk.</span>
        </div>
      )}
    </div>
  );
}

export default RiskSizingCard;
