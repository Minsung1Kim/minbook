"use client";

import React, { useState, useEffect } from "react";
import {
  CheckSquare,
  Square,
  ShieldAlert,
  Flame,
  Award,
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
      // Fetch from API
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

    // Persist to local storage
    const storageKey = `openpulse_checklist_${tradeDate}_${userId}`;
    localStorage.setItem(storageKey, JSON.stringify(updated));

    // Async save to API
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
  };

  const items: Array<{
    key: keyof ChecklistState;
    title: string;
    description: string;
    critical: boolean;
  }> = [
    {
      key: "htfTrendConfirmed",
      title: "1. HTF Trend & Confluence Confirmed",
      description: "Bias aligned with 1H / 4H market structure and overnight inventory direction.",
      critical: false
    },
    {
      key: "openingDriveAllowed",
      title: "2. Initial 1–3 Min Opening Drive Allowed",
      description: "DO NOT chase tick 1 at 9:30:00 AM! Let initial liquidity sweep and spread settle.",
      critical: true
    },
    {
      key: "retraceKeyLevelHit",
      title: "3. Retrace into Defined Key Zone / VWAP",
      description: "Price pulled back into VWAP, ON Mid, or 50% discount zone before entry trigger.",
      critical: false
    },
    {
      key: "noImpendingRedNews",
      title: "4. No Red-Folder News at 9:45 / 10:00 AM",
      description: "Checked calendar for S&P Global PMI (9:45 AM) or ISM Services (10:00 AM).",
      critical: true
    },
    {
      key: "stopFitsDollarBudget",
      title: "5. Stop Fits $200–$300 Dollar Budget",
      description: "Invalidation placed outside structure. If >15 pts needed, downscaled to MNQ.",
      critical: true
    },
    {
      key: "singleTradeCommitment",
      title: "6. Strictly 1 Trade / Day Commitment",
      description: "Win, scratch, or stop-out: I will close my broker and trade zero additional setups today.",
      critical: true
    },
    {
      key: "journalPledge",
      title: "7. Post-Trade MAE/MFE Logging Pledge",
      description: "Will record actual adverse heat (MAE) and peak profit (MFE) within 5 minutes of exit.",
      critical: false
    }
  ];

  const completedCount = items.filter((i) => state[i.key]).length;
  const isFullyReady = completedCount === items.length;

  return (
    <div className="rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden flex flex-col justify-between">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div
            className={`p-2 rounded-lg border ${
              isFullyReady
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
            }`}
          >
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
              Execution Discipline Gate
            </span>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
              9:30–10:00 AM Retrace Checklist
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono">
          <span
            className={`px-2 py-0.5 rounded font-bold ${
              isFullyReady
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "bg-slate-800 text-slate-300 border border-slate-700"
            }`}
          >
            {completedCount}/{items.length} Ready
          </span>

          <button
            onClick={handleReset}
            className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
            title="Reset checklist"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-950 h-1.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isFullyReady
              ? "bg-gradient-to-r from-emerald-500 to-cyan-400"
              : "bg-cyan-500"
          }`}
          style={{ width: `${(completedCount / items.length) * 100}%` }}
        />
      </div>

      {/* Checklist Items */}
      <div className="p-4 sm:p-5 space-y-2.5">
        {items.map((item) => {
          const checked = Boolean(state[item.key]);

          return (
            <button
              key={item.key}
              onClick={() => toggleItem(item.key)}
              className={`w-full text-left p-3 rounded-lg border transition-all flex items-start space-x-3 ${
                checked
                  ? "bg-slate-950/80 border-emerald-500/30 text-slate-200"
                  : "bg-slate-950/40 border-slate-800/80 hover:border-slate-700 text-slate-400"
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {checked ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                )}
              </div>

              <div className="flex-1 font-mono">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold ${
                      checked ? "text-white line-through opacity-80" : "text-slate-200"
                    }`}
                  >
                    {item.title}
                  </span>
                  {item.critical && !checked && (
                    <span className="text-[10px] px-1 rounded bg-rose-950 text-rose-300 border border-rose-800">
                      STRICT
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Readiness Banner Footer */}
      <div
        className={`px-5 py-3 border-t text-xs font-mono flex items-center justify-between ${
          isFullyReady
            ? "bg-emerald-950/40 border-emerald-800 text-emerald-200"
            : "bg-slate-950/80 border-slate-800 text-slate-400"
        }`}
      >
        <span className="flex items-center space-x-2">
          {isFullyReady ? (
            <>
              <Award className="w-4 h-4 text-emerald-400" />
              <strong className="text-white">CLEAR FOR 1 TRADE EXECUTION:</strong> Be patient on the retrace!
            </>
          ) : (
            <>
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Complete all 7 criteria before placing order.</span>
            </>
          )}
        </span>

        {isSaved && <span className="text-[10px] text-emerald-400">Synced</span>}
      </div>
    </div>
  );
}
