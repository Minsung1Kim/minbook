"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { Trader5CoreAnswersCard } from "@/components/Trader5CoreAnswersCard";
import { KeyLevelsTable } from "@/components/KeyLevelsTable";
import { ChecklistCard } from "@/components/ChecklistCard";
import { OpenBriefData, ActionScenario } from "@/types/market";
import { UserProfile } from "@/types/app";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Compass,
  Crosshair,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Flame,
  Clock,
  Sparkles,
  HelpCircle,
  XCircle,
  Target,
  ShieldAlert,
  ArrowRight,
  Terminal,
  Activity
} from "lucide-react";

export function Dashboard() {
  const [brief, setBrief] = useState<OpenBriefData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedInstrument, setSelectedInstrument] = useState<"NQ" | "MNQ">("NQ");
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);

  // Collapsible section states (defaults to streamlined collapsed state for clean first glance)
  const [expandedSection, setExpandedSection] = useState<"vwap" | "retrace" | "levels" | "checklist" | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string>("sc-vwap-test");

  // Load user profiles
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.profiles?.length > 0) {
          setProfiles(res.profiles);
          const initial = res.current || res.profiles[0];
          setCurrentProfile(initial);
          if (initial.defaultInstrument) setSelectedInstrument(initial.defaultInstrument);
        }
      })
      .catch((err) => console.warn("Failed to load settings:", err));
  }, []);

  // Fetch market brief & actionable playbook
  const fetchBrief = useCallback(async (isForceRefresh: boolean = false) => {
    if (isForceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const url = `/api/market-data?symbol=${selectedInstrument}${isForceRefresh ? "&refresh=true" : ""}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch market brief");
      }

      setBrief(json.data);
    } catch (err: any) {
      console.error("fetchBrief error:", err);
      setError(err?.message || "Failed to load real market data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedInstrument]);

  useEffect(() => {
    fetchBrief(false);
  }, [fetchBrief]);

  const toggleSection = (section: "vwap" | "retrace" | "levels" | "checklist") => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const quote = brief?.quote;
  const metrics = brief?.sessionMetrics;
  const plan = brief?.tacticalPlan;
  const bias = brief?.bias;
  const distToVwap = metrics && quote ? Math.round((quote.price - metrics.sessionVwap) * 10) / 10 : 0;

  const activeScenario = plan?.scenarios.find((s) => s.id === activeScenarioId) || plan?.scenarios[0];

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Header */}
      <Header
        lastUpdated={brief?.dataSource.lastUpdated}
        dataStatus={brief?.dataSource.quoteStatus}
        providerName={brief?.dataSource.providerName}
        isRefreshing={refreshing}
        onRefresh={() => fetchBrief(true)}
        selectedInstrument={selectedInstrument}
        onSelectInstrument={(inst) => setSelectedInstrument(inst)}
        currentProfile={currentProfile}
        profiles={profiles}
        onSelectProfile={(id) => {
          const found = profiles.find((p) => p.id === id);
          if (found) {
            setCurrentProfile(found);
            setSelectedInstrument(found.defaultInstrument);
          }
        }}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Loading skeleton */}
        {loading && !brief && (
          <div className="space-y-4 animate-pulse">
            <div className="h-32 bg-slate-900 rounded-xl border border-slate-800" />
            <div className="h-24 bg-slate-900 rounded-xl border border-slate-800" />
            <div className="h-24 bg-slate-900 rounded-xl border border-slate-800" />
            <div className="h-24 bg-slate-900 rounded-xl border border-slate-800" />
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-200 flex items-center justify-between">
            <div className="text-xs font-mono">
              <strong>Error loading live data:</strong> {error}
            </div>
            <button
              onClick={() => fetchBrief(true)}
              className="px-3 py-1 rounded bg-rose-900 text-rose-200 text-xs font-mono"
            >
              Retry
            </button>
          </div>
        )}

        {brief && quote && metrics && plan && bias && (
          <>
            {/* 1. HERO DIRECTIVE CARD (At a glance: Clean, Uncluttered, Actionable) */}
            <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-2xl space-y-4">
              {/* Ticker & Status Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="flex items-baseline space-x-2">
                    <span className="text-2xl sm:text-3xl font-mono font-bold text-white tracking-tight">
                      {quote.displaySymbol} {quote.price.toFixed(2)}
                    </span>
                    <span
                      className={`text-xs font-mono font-bold ${
                        quote.change >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%)
                    </span>
                  </div>

                  <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                    VIX: {brief.macro.vix.value.toFixed(1)} ({brief.macro.vix.regime})
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    <span>{plan.retraceAnalysis.probabilityPercent}% RETRACE CHANCE</span>
                  </span>
                </div>
              </div>

              {/* The #1 Single Action Directive */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold block flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Today's 1-Trade Game Plan (9:30–10:00 AM ET):</span>
                </span>
                <p className="text-sm sm:text-base text-white font-medium leading-relaxed bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                  {plan.singleTradeDirective}
                </p>
              </div>

              {/* Retrace Zone & Quick Facts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Session VWAP</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{metrics.sessionVwap.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-400">{distToVwap >= 0 ? `${distToVwap} pts below` : `${Math.abs(distToVwap)} pts above`}</span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Overnight High (ONH)</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{metrics.onh.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-400">{(metrics.onh - quote.price).toFixed(1)} pts away</span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Prior Day Close (PDC)</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{metrics.pdc.toFixed(1)}</span>
                  <span className="text-[10px] text-slate-400">Inventory line</span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Expected Pullback</span>
                  <span className="text-sm font-bold text-cyan-300 mt-0.5 block">~{plan.retraceAnalysis.expectedPullbackDepthPts} pts</span>
                  <span className="text-[10px] text-slate-400">15m ATR: {metrics.atr15mIntraday} pts</span>
                </div>
              </div>
            </div>

            {/* 2. THE 5 CORE TRADER QUESTIONS (Instant clarity: Bias, Stop Hunts, Retrace Levels, Liquidity Draws, R:R Strategy) */}
            <Trader5CoreAnswersCard
              answers={plan.trader5Answers}
              currentPrice={quote.price}
            />

            {/* 3. EXPANDABLE CLICK TILES (Simple at first glance, click to open details) */}
            <div className="space-y-3 font-mono">
              {/* TILE 1: "WHAT IF VWAP HITS?" (Collapsible) */}
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 shadow-md overflow-hidden transition-all">
                <button
                  onClick={() => toggleSection("vwap")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                      <Compass className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-white font-sans">
                          What It Means If VWAP Hits ({metrics.sessionVwap.toFixed(1)})
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                          {distToVwap >= 0 ? `${distToVwap} pts below` : `${Math.abs(distToVwap)} pts above`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-sans mt-0.5 truncate max-w-xl">
                        Absorption = institutional continuation entry | Clean close below = retrace failed (stand aside)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-cyan-400">
                    <span className="hidden sm:inline text-[11px] font-sans">
                      {expandedSection === "vwap" ? "Hide details" : "Click to view triggers"}
                    </span>
                    {expandedSection === "vwap" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {/* Expanded Details for VWAP */}
                {expandedSection === "vwap" && (
                  <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/70 space-y-4">
                    {/* Scenario Switcher */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {plan.scenarios.map((sc) => (
                        <button
                          key={sc.id}
                          onClick={() => setActiveScenarioId(sc.id)}
                          className={`p-2.5 rounded-lg border text-left transition-colors ${
                            activeScenarioId === sc.id
                              ? "bg-cyan-950/80 border-cyan-500 text-cyan-200 font-bold"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <div className="text-[10px] uppercase truncate">{sc.conditionShort}</div>
                        </button>
                      ))}
                    </div>

                    {activeScenario && (
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 font-sans text-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                          <span className="font-bold text-white text-sm">
                            {activeScenario.condition}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono self-start sm:self-auto">
                            {activeScenario.actionableDecision}
                          </span>
                        </div>

                        <div>
                          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                            Institutional Meaning:
                          </span>
                          <p className="text-slate-200 mt-1 leading-relaxed">
                            {activeScenario.whatItMeans}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/60 text-emerald-200 space-y-1">
                            <strong className="text-white block text-[11px] font-mono">EXACT ENTRY TRIGGER:</strong>
                            <p>{activeScenario.entryTrigger}</p>
                          </div>

                          <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/60 text-rose-200 space-y-1">
                            <strong className="text-white block text-[11px] font-mono">HARD INVALIDATION (STOP):</strong>
                            <p>{activeScenario.invalidation}</p>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-900/50 text-amber-200 text-[11px]">
                          <strong className="text-amber-300">Retail Trap Warning:</strong> {activeScenario.trapWarning}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* TILE 2: "IS RETRACE PROBABLE TODAY?" (Collapsible) */}
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 shadow-md overflow-hidden transition-all">
                <button
                  onClick={() => toggleSection("retrace")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      <Crosshair className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-white font-sans">
                          Is a Retrace Probable Today?
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          {plan.retraceAnalysis.probabilityPercent}% PROBABILITY
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-sans mt-0.5 truncate max-w-xl">
                        {plan.retraceAnalysis.verdictHeadline}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-emerald-400">
                    <span className="hidden sm:inline text-[11px] font-sans">
                      {expandedSection === "retrace" ? "Hide details" : "Click to view analysis"}
                    </span>
                    {expandedSection === "retrace" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {/* Expanded Details for Retrace */}
                {expandedSection === "retrace" && (
                  <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/70 space-y-3 font-sans text-xs">
                    <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                      <span className="font-bold text-white text-sm block">
                        {plan.retraceAnalysis.verdictHeadline}
                      </span>
                      <p className="text-slate-300 leading-relaxed">
                        {plan.retraceAnalysis.explanation}
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-800/60 text-cyan-200">
                      <strong className="text-white">Actionable Retrace Protocol:</strong> {plan.retraceAnalysis.retraceActionAdvice}
                    </div>

                    {/* Timeline Guide */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                        <span className="text-amber-400 font-bold block">09:30–09:33 AM</span>
                        <span className="text-slate-300 font-sans mt-0.5 block">{plan.timelineGuide.observePhase.rule}</span>
                      </div>
                      <div className="p-2.5 rounded bg-cyan-950/40 border border-cyan-800">
                        <span className="text-cyan-400 font-bold block">09:34–09:48 AM</span>
                        <span className="text-slate-200 font-sans mt-0.5 block">{plan.timelineGuide.entryWindow.rule}</span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                        <span className="text-emerald-400 font-bold block">09:48–10:00 AM</span>
                        <span className="text-slate-300 font-sans mt-0.5 block">{plan.timelineGuide.managementPhase.rule}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* TILE 3: "KEY REFERENCE LEVELS" (Collapsible) */}
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 shadow-md overflow-hidden transition-all">
                <button
                  onClick={() => toggleSection("levels")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-white font-sans">
                          Key Reference Levels ({brief.keyLevels.length} levels computed)
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-slate-400 font-mono mt-0.5">
                        <span>ONH: <strong className="text-white">{metrics.onh.toFixed(1)}</strong></span>
                        <span>•</span>
                        <span>VWAP: <strong className="text-white">{metrics.sessionVwap.toFixed(1)}</strong></span>
                        <span>•</span>
                        <span>PDC: <strong className="text-white">{metrics.pdc.toFixed(1)}</strong></span>
                        <span>•</span>
                        <span>PDH: <strong className="text-white">{metrics.pdh.toFixed(1)}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-amber-400">
                    <span className="hidden sm:inline text-[11px] font-sans">
                      {expandedSection === "levels" ? "Hide table" : "Click to view full table"}
                    </span>
                    {expandedSection === "levels" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {/* Expanded Full Table */}
                {expandedSection === "levels" && (
                  <div className="border-t border-slate-800">
                    <KeyLevelsTable
                      levels={brief.keyLevels}
                      currentPrice={quote.price}
                    />
                  </div>
                )}
              </div>

              {/* TILE 4: "9:30–10:00 AM EXECUTION CHECKLIST" (Collapsible) */}
              <div className="rounded-xl bg-slate-900/90 border border-slate-800 shadow-md overflow-hidden transition-all">
                <button
                  onClick={() => toggleSection("checklist")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-white font-sans block">
                        9:30–10:00 AM Execution Checklist Gate
                      </span>
                      <p className="text-xs text-slate-400 font-sans mt-0.5">
                        Verify entry rules before placing order (Wait for 9:34 AM • Check red news • 1 trade discipline)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-cyan-400">
                    <span className="hidden sm:inline text-[11px] font-sans">
                      {expandedSection === "checklist" ? "Hide checklist" : "Click to check items"}
                    </span>
                    {expandedSection === "checklist" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {/* Expanded Checklist */}
                {expandedSection === "checklist" && (
                  <div className="border-t border-slate-800 p-4">
                    <ChecklistCard
                      tradeDate={brief.tradeDate}
                      userId={currentProfile?.id || "minsung"}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Status Bar */}
            <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800 text-xs font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>
                  <strong>Real Market Feed:</strong> {brief.dataSource.providerName} ({brief.quote.symbol}) • Price:{" "}
                  <strong className="text-white">{quote.price.toFixed(2)}</strong>
                </span>
              </span>
              <span className="text-slate-500 text-[11px]">
                Click any card above to toggle deep-dive analysis
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
