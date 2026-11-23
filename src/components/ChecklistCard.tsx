"use client";

import React, { useState, useEffect } from "react";
import {
  CheckSquare,
  Square,
  RotateCcw,
  CheckCircle2
} from "lucide-react";
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
    journalPledge: false
  });
  const [isSaved, setIsSaved] = useState(false);

  // Load from local storage or API
  useEffect(() => {
    const storageKey = `openpulse_checklist_${tradeDate}_${userId}`;
    const cached = localStorage.getItem(storageKey);
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
      [key]: !state[key]
    };
    setState(updated);

    const storageKey = `openpulse_checklist_${tradeDate}_${userId}`;
    localStorage.setItem(storageKey, JSON.stringify(updated));

    fetch("/api/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: tradeDate, userId, state: updated })
    })
      .then(() => {
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      })
      .catch(() => {});
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
      journalPledge: false
    };
    setState(resetState);
    const storageKey = `openpulse_checklist_${tradeDate}_${userId}`;
    localStorage.setItem(storageKey, JSON.stringify(resetState));

    fetch("/api/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: tradeDate, userId, state: resetState })
    }).catch(() => {});
  };

  const items: {
    key: keyof ChecklistState;
    label: string;
    rule: string;
    description: string;
    critical: boolean;
  }[] = [
    {
      key: "htfTrendConfirmed",
      label: "1. HTF Trend & Market Structure Aligned",
      rule: "Confirm higher timeframe (4H/1D) directional orderflow",
      description: "Only look for longs if HTF is bullish / shorts if HTF is bearish. Do not counter-trend the NY open.",
      critical: true
    },
    {
      key: "openingDriveAllowed",
      label: "2. Initial 9:30 AM Drive Observed (No Chasing)",
      rule: "Wait minimum 3–5 minutes after 9:30 AM ET open bell",
      description: "Allow the initial 9:30 AM opening candle spike to resolve. Never market order into the first 60 seconds.",
      critical: true
    },
    {
      key: "retraceKeyLevelHit",
      label: "3. Retrace Touched Defined Key Level",
      rule: "Price must retrace into VWAP, 50% Equilibrium, or London High/Low",
      description: "Entries are strictly limit orders on pullback into session levels, never market chasing breakouts.",
      critical: true
    },
    {
      key: "noImpendingRedNews",
      label: "4. No Impending Red Economic Catalysts",
      rule: "Check 10:00 AM ET high-impact release schedule",
      description: "Ensure no sudden CPI, FOMC, or ISM release scheduled right after entry.",
      critical: true
    },
    {
      key: "stopFitsDollarBudget",
      label: "5. Invalidation Stop Fits Risk Budget ($200–$300)",
      rule: "NQ stop distance <= 15 pts ($300) or MNQ stop <= 50 pts ($100)",
      description: "If volatility requires a stop wider than max risk budget, step down from NQ to MNQ or stand aside.",
      critical: true
    },
    {
      key: "singleTradeCommitment",
      label: "6. Single Trade Commitment Honored",
      rule: "Commit to exactly 1 trade today regardless of win or loss",
      description: "Win or lose, you walk away. No revenge trading, no second attempts.",
      critical: true
    },
    {
      key: "journalPledge",
      label: "7. Post-Trade Log Commitment",
      rule: "Commit to logging MAE, MFE, and actual outcome in journal",
      description: "Record actual adverse heat and peak profit in the MAE/MFE journal after exit.",
      critical: false
    }
  ];

  const completedCount = items.filter((i) => state[i.key]).length;
  const isFullyReady = completedCount === items.length;

  return (
    <div className="rounded-lg bg-[#0f1624] border border-slate-800 overflow-hidden flex flex-col justify-between">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <CheckSquare className="w-4 h-4 text-slate-400" />
          <h2 className="text-sm font-semibold tracking-tight text-white">
            Pre-Flight Execution Checklist
          </h2>
        </div>

        <div className="flex items-center space-x-2.5 text-xs">
          <span
            className={`px-2 py-0.5 rounded font-mono text-[11px] font-medium border ${
              isFullyReady
                ? "bg-slate-800 text-emerald-400 border-emerald-800/80"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            {completedCount}/{items.length} Ready
          </span>

          <button
            onClick={handleReset}
            className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
            title="Reset checklist"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-900 h-1 overflow-hidden">
        <div
          className="h-full bg-cyan-500 transition-all duration-200"
          style={{ width: `${(completedCount / items.length) * 100}%` }}
        />
      </div>

      {/* Checklist Items */}
      <div className="p-4 space-y-2 font-sans">
        {items.map((item) => {
          const checked = Boolean(state[item.key]);

          return (
            <button
              key={item.key}
              onClick={() => toggleItem(item.key)}
              className={`w-full text-left p-3 rounded border transition-colors flex items-start space-x-3 ${
                checked
                  ? "bg-slate-900/70 border-slate-700 text-slate-200"
                  : "bg-slate-900/30 border-slate-800/80 hover:bg-slate-900/50 text-slate-400"
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {checked ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className={`text-xs font-semibold ${checked ? "text-slate-100" : "text-slate-300"}`}>
                    {item.label}
                  </span>
                  {item.critical && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      (Gate)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer Status Bar */}
      <div className="px-5 py-3 border-t border-slate-800 bg-slate-900/30 flex items-center justify-between text-xs">
        <span className="text-slate-400">
          {isFullyReady ? (
            <span className="text-emerald-400 font-medium">All 7 gates cleared for entry.</span>
          ) : (
            <span>Clear all gates before placing limit order.</span>
          )}
        </span>
        {isSaved && <span className="text-emerald-400 text-xs">Saved</span>}
      </div>
    </div>
  );
}
