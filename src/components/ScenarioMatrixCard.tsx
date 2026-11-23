"use client";

import React, { useState } from "react";
import {
  HelpCircle,
  AlertOctagon,
  TrendingUp,
  TrendingDown,
  Layers,
  Crosshair,
  ArrowRight,
  ShieldAlert,
  Target,
  Sparkles,
  CheckCircle2,
  XCircle,
  Compass
} from "lucide-react";
import { TacticalExecutionPlan, ActionScenario, SessionMetrics } from "@/types/market";

interface ScenarioMatrixCardProps {
  plan: TacticalExecutionPlan;
  metrics: SessionMetrics;
}

export function ScenarioMatrixCard({ plan, metrics }: ScenarioMatrixCardProps) {
  const { scenarios, vwapPlaybook } = plan;
  const [activeScenarioId, setActiveScenarioId] = useState<string>(scenarios[0]?.id || "sc-vwap-test");

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];

  return (
    <div className="rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden flex flex-col justify-between font-mono">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <Compass className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <span className="text-[10px] tracking-wider text-slate-400 uppercase block">
              Conditional If-Then Simulator
            </span>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-white font-sans">
              "What It Means If..." Action Matrix
            </h2>
          </div>
        </div>

        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
          Institutional Playbook
        </span>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Scenario Selector Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {scenarios.map((sc) => {
            const isSelected = sc.id === activeScenarioId;
            return (
              <button
                key={sc.id}
                onClick={() => setActiveScenarioId(sc.id)}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  isSelected
                    ? "bg-cyan-950/80 border-cyan-500 text-cyan-200 shadow-md shadow-cyan-950/40 font-bold"
                    : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <div className="text-[10px] text-slate-400 uppercase truncate">
                  {sc.conditionShort}
                </div>
                <div className="text-xs font-semibold mt-0.5 truncate text-white">
                  {sc.id === "sc-vwap-test" ? `VWAP (${metrics.sessionVwap.toFixed(0)})` : sc.id === "sc-vwap-break" ? "< VWAP Break" : sc.id === "sc-onh-sweep" ? "ONH Sweep" : "PDC Flush"}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Scenario Detail View */}
        {activeScenario && (
          <div className="p-4 rounded-xl bg-slate-950 border border-cyan-900/60 space-y-4 shadow-lg">
            {/* Condition Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <span className="text-sm font-bold text-cyan-300 tracking-tight font-sans">
                {activeScenario.condition}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 uppercase font-bold self-start sm:self-auto">
                {activeScenario.actionableDecision}
              </span>
            </div>

            {/* What It Means Deep Dive */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block flex items-center space-x-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                <span>What It Means (Institutional Mechanics):</span>
              </span>
              <p className="text-xs text-slate-200 leading-relaxed font-sans bg-slate-900/70 p-3 rounded-lg border border-slate-800">
                {activeScenario.whatItMeans}
              </p>
            </div>

            {/* Actionable Trigger & Invalidation Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Trigger */}
              <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/60 space-y-1">
                <span className="text-emerald-400 font-bold uppercase text-[10px] flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Exact Entry Confirmation Trigger:</span>
                </span>
                <p className="text-emerald-200/90 leading-snug font-sans">
                  {activeScenario.entryTrigger}
                </p>
              </div>

              {/* Invalidation */}
              <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-800/60 space-y-1">
                <span className="text-rose-400 font-bold uppercase text-[10px] flex items-center space-x-1">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Hard Structural Invalidation (Stop):</span>
                </span>
                <p className="text-rose-200/90 leading-snug font-sans">
                  {activeScenario.invalidation}
                </p>
              </div>
            </div>

            {/* Target & Trap Warning */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
                <span className="text-cyan-400 font-bold uppercase text-[10px] flex items-center space-x-1">
                  <Target className="w-3.5 h-3.5" />
                  <span>Target Objective:</span>
                </span>
                <p className="text-slate-300 leading-snug font-sans">
                  {activeScenario.targetObjective}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-900/60 space-y-1">
                <span className="text-amber-400 font-bold uppercase text-[10px] flex items-center space-x-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Retail Trader Trap Warning:</span>
                </span>
                <p className="text-amber-200/90 leading-snug font-sans">
                  {activeScenario.trapWarning}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* VWAP Direct Rulebook Callout */}
        <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-300">
            <span className="font-bold flex items-center space-x-1.5 text-cyan-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Session VWAP Direct Rulebook ({metrics.sessionVwap.toFixed(2)}):</span>
            </span>
            <span className="text-[10px] text-slate-400">Institutional Fair Value Anchor</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-sans">
            <div className="p-2 rounded bg-emerald-950/30 border border-emerald-900/50 text-emerald-200">
              <strong className="text-white">If VWAP Bounces:</strong> {vwapPlaybook.bounceMeaning}
            </div>
            <div className="p-2 rounded bg-rose-950/30 border border-rose-900/50 text-rose-200">
              <strong className="text-white">If VWAP Breaks:</strong> {vwapPlaybook.breakdownMeaning}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Rule */}
      <div className="px-5 py-2.5 bg-slate-950/70 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Rule: Never guess. Wait for the candle to close.</span>
        <span className="text-emerald-400 font-semibold">One Good Trade</span>
      </div>
    </div>
  );
}
