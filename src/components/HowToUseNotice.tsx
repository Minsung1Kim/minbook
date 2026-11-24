"use client";

import React, { useState, useEffect } from "react";
import { HelpCircle, ChevronDown, ChevronUp, ShieldCheck, Target, Zap, Clock, X } from "lucide-react";

export function HowToUseNotice() {
  const [isOpen, setIsOpen] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("minbook_how_to_use_dismissed");
    if (saved === "true") {
      setIsOpen(false);
    }
  }, []);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (!nextState) {
      localStorage.setItem("minbook_how_to_use_dismissed", "true");
    } else {
      localStorage.removeItem("minbook_how_to_use_dismissed");
    }
  };

  if (isDismissed) {
    return (
      <div className="flex justify-end mb-2">
        <button
          onClick={() => {
            setIsDismissed(false);
            setIsOpen(true);
            localStorage.removeItem("minbook_how_to_use_dismissed");
          }}
          className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-cyan-400 flex items-center space-x-1.5 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>How to Use MinBook</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-zinc-900/90 border border-cyan-500/30 overflow-hidden font-sans mb-3 shadow-lg">
      {/* Header Banner */}
      <div className="px-4 py-2.5 bg-zinc-950/90 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="font-mono text-xs font-bold text-zinc-100 uppercase tracking-wider">
            Quick Start Guide: How to Trade MinBook
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-semibold">
            1 Trade / Day Scalper
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleToggle}
            className="text-xs font-mono text-zinc-400 hover:text-zinc-200 flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors"
          >
            <span>{isOpen ? "Hide Guide" : "Show Guide"}</span>
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => {
              setIsDismissed(true);
              localStorage.setItem("minbook_how_to_use_dismissed", "true");
            }}
            className="text-zinc-500 hover:text-zinc-300 p-0.5"
            title="Dismiss guide"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expandable Content */}
      {isOpen && (
        <div className="p-4 space-y-3 bg-zinc-950/40">
          <p className="text-xs text-zinc-300 leading-relaxed font-sans">
            MinBook is a 1-minute execution engine for CME NQ/MNQ futures designed for intraday scalpers. We follow a strict <strong>1-trade-per-day mandate</strong> with tight 10–18 point stops.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
            {/* Step 1 */}
            <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1.5">
              <div className="flex items-center space-x-2 text-amber-400 font-bold">
                <Clock className="w-4 h-4 shrink-0" />
                <span>STEP 1: 09:30–09:33 ET</span>
              </div>
              <span className="text-zinc-200 font-semibold block text-[11px] font-sans">
                Hands Off The Mouse (Wait)
              </span>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                Do NOT enter on the 09:30 open bell. Let the opening 3-minute noise settle and establish the 3-minute range high (ORH) and low (ORL).
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1.5">
              <div className="flex items-center space-x-2 text-cyan-400 font-bold">
                <Target className="w-4 h-4 shrink-0" />
                <span>STEP 2: 09:34–09:50 ET</span>
              </div>
              <span className="text-zinc-200 font-semibold block text-[11px] font-sans">
                Check the 1-Min Scalp Card
              </span>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                Look at the <strong>1-Min Scalp Card</strong> on the right. Place a <strong>Limit Order</strong> inside the Limit Entry Zone with the exact Stop Loss (10–18 pts). Never market chase!
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-3 rounded bg-zinc-900/80 border border-zinc-800 space-y-1.5">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold">
                <Zap className="w-4 h-4 shrink-0" />
                <span>STEP 3: EXIT &amp; SCALE</span>
              </div>
              <span className="text-zinc-200 font-semibold block text-[11px] font-sans">
                Lock TP1, Runner to TP2
              </span>
              <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                When price hits <strong>TP1 (+10–18 pts)</strong>, scale out 50% (take profit on 1 MNQ) and move Stop to Breakeven. Hold runner for <strong>TP2 (+20–35 pts)</strong>.
              </p>
            </div>
          </div>

          {/* Quick Rules Footer */}
          <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400 font-mono">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                <strong>Golden Scalper Rule:</strong> If price runs &gt; 15 pts away before filling your limit, cancel the order. Never chase!
              </span>
            </div>
            <span className="text-zinc-500 font-sans">
              1 Trade Finished = Done for the session.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default HowToUseNotice;
