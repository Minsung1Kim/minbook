"use client";

import React, { useState, useEffect } from "react";
import { CheckSquare, Square, RotateCcw, CheckCircle2 } from "lucide-react";
import { ChecklistState } from "@/types/app";

interface ChecklistCardProps {
  tradeDate: string;
  userId?: string;
}

export function ChecklistCard({ tradeDate, userId = "minsung" }: ChecklistCardProps) {
  const [state, setState] = useState<ChecklistState>({
    date: tradeDate,
    htfTrendConfirmed: false,
    openingDriveAllowed: false,
    retraceKeyLevelHit: false,
    noImpendingRedNews: false,
    stopFitsDollarBudget: false,
    singleTradeCommitment: false,
    journalPledge: false,
  });

  useEffect(() => {
    const storageKey = `minbook_checklist_${tradeDate}_${userId}`;
    const legacyKey = `openpulse_checklist_${tradeDate}_${userId}`;
    const cached = localStorage.getItem(storageKey) || localStorage.getItem(legacyKey);
    if (cached) {
      try {
        setState(JSON.parse(cached));
      } catch {}
    } else {
      fetch(`/api/checklist?date=${tradeDate}&userId=${userId}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.success && res.state) {
            setState(res.state);
          }
        })
        .catch(() => {});
    }
  }, [tradeDate, userId]);

  const toggleItem = (key: keyof ChecklistState) => {
    if (key === "date") return;
    const updated = {
      ...state,
      [key]: !state[key],
    };
    setState(updated);

    const storageKey = `minbook_checklist_${tradeDate}_${userId}`;
    localStorage.setItem(storageKey, JSON.stringify(updated));

    fetch("/api/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: tradeDate, userId, state: updated }),
    }).catch(() => {});
  };

  const handleReset = () => {
    const resetState: ChecklistState = {
      date: tradeDate,
      htfTrendConfirmed: false,
      openingDriveAllowed: false,
      retraceKeyLevelHit: false,
      noImpendingRedNews: false,
      stopFitsDollarBudget: false,
      singleTradeCommitment: false,
      journalPledge: false,
    };
    setState(resetState);
    const storageKey = `minbook_checklist_${tradeDate}_${userId}`;
    localStorage.setItem(storageKey, JSON.stringify(resetState));

    fetch("/api/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: tradeDate, userId, state: resetState }),
    }).catch(() => {});
  };

  const items: {
    key: keyof ChecklistState;
    label: string;
    description: string;
  }[] = [
    {
      key: "htfTrendConfirmed",
      label: "1. HTF Trend & Market Structure Aligned",
      description: "Confirm higher timeframe (4H/1D) directional orderflow. Do not counter-trend.",
    },
    {
      key: "openingDriveAllowed",
      label: "2. Initial Drive Observed (No Chasing)",
      description: "Wait 3–5 minutes after 9:30 AM ET open. Never market-order into first 60 seconds.",
    },
    {
      key: "retraceKeyLevelHit",
      label: "3. Retrace Touched Defined Key Level",
      description: "Limit orders on pullback into VWAP, Overnight 50% Midpoint, or London High/Low.",
    },
    {
      key: "noImpendingRedNews",
      label: "4. No Impending Red Economic Catalysts",
      description: "Ensure no high-impact release (CPI, FOMC, ISM) scheduled within entry window.",
    },
    {
      key: "stopFitsDollarBudget",
      label: "5. Invalidation Fits Dollar Budget",
      description: "NQ stop <= 15 pts ($300) or MNQ stop <= 50 pts ($100). Step down size if needed.",
    },
    {
      key: "singleTradeCommitment",
      label: "6. Single Trade Commitment Honored",
      description: "Strictly 1 trade today regardless of win or loss. No revenge trading.",
    },
    {
      key: "journalPledge",
      label: "7. Post-Trade Log Commitment",
      description: "Record actual MAE, MFE, and outcome in empirical journal after exit.",
    },
  ];

  const completedCount = items.filter((i) => state[i.key]).length;
  const isFullyReady = completedCount === items.length;

  return (
    <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden space-y-0">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between text-xs font-mono">
        <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[11px]">
          Pre-Flight Checklist
        </span>

        <div className="flex items-center space-x-2">
          <span
            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
              isFullyReady
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-zinc-800 text-zinc-400 border-zinc-700"
            }`}
          >
            {completedCount}/{items.length} Ready
          </span>

          <button
            onClick={handleReset}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Reset checklist"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-950 h-0.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-200 ${
            isFullyReady ? "bg-emerald-500" : "bg-zinc-500"
          }`}
          style={{ width: `${(completedCount / items.length) * 100}%` }}
        />
      </div>

      {/* Checklist Items */}
      <div className="p-3 space-y-1.5 text-xs font-sans">
        {items.map((item) => {
          const checked = Boolean(state[item.key]);

          return (
            <button
              key={item.key}
              onClick={() => toggleItem(item.key)}
              className={`w-full text-left p-2.5 rounded border transition-colors flex items-start space-x-2.5 ${
                checked
                  ? "bg-zinc-900/90 border-zinc-700/80 text-zinc-200"
                  : "bg-zinc-950/40 border-zinc-800/60 hover:bg-zinc-900/50 text-zinc-400"
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {checked ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-zinc-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className={`text-xs font-medium block leading-tight ${
                    checked ? "text-zinc-100" : "text-zinc-300"
                  }`}
                >
                  {item.label}
                </span>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ChecklistCard;
