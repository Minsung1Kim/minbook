"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/Header";
import { Trader5CoreAnswersCard } from "@/components/Trader5CoreAnswersCard";
import { KeyLevelsTable } from "@/components/KeyLevelsTable";
import { ChecklistCard } from "@/components/ChecklistCard";
import { EconomicNewsCard } from "@/components/EconomicNewsCard";
import { RiskSizingCard } from "@/components/RiskSizingCard";
import { OpenBriefData } from "@/types/market";
import { UserProfile } from "@/types/app";
import {
  Compass,
  Crosshair,
  TrendingUp,
  TrendingDown,
  Layers,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
  AlertCircle,
  AlertTriangle,
  Activity,
  ShieldCheck
} from "lucide-react";

export function Dashboard() {
  const [selectedInstrument, setSelectedInstrument] = useState<"NQ" | "MNQ">("NQ");
  const [brief, setBrief] = useState<OpenBriefData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // User Profiles
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);

  // Dynamic live auto-refresh state
  const [isAutoRefreshOn, setIsAutoRefreshOn] = useState<boolean>(true);
  const [refreshIntervalSec] = useState<number>(10);
  const [countdown, setCountdown] = useState<number>(10);
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  const lastFetchedTimeRef = useRef<number>(Date.now());
  const previousPriceRef = useRef<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<"up" | "down" | null>(null);

  // Collapsible section states
  const [expandedSection, setExpandedSection] = useState<"vwap" | "retrace" | "levels" | "checklist" | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string>("sc-vwap-test");

  // Fetch profiles
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setProfiles(res.data.profiles || []);
          const active = (res.data.profiles || []).find((p: UserProfile) => p.id === "minsung") || res.data.profiles?.[0];
          setCurrentProfile(active || null);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch market brief & actionable playbook
  const fetchBrief = useCallback(async (isManual: boolean = false) => {
    if (isManual) setRefreshing(true);
    setError(null);

    try {
      const url = `/api/market-data?symbol=${selectedInstrument}&refresh=true`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch market data");
      }

      const newData = json.data as OpenBriefData;

      if (previousPriceRef.current !== null && newData.quote.price !== previousPriceRef.current) {
        if (newData.quote.price > previousPriceRef.current) {
          setPriceFlash("up");
        } else {
          setPriceFlash("down");
        }
        setTimeout(() => setPriceFlash(null), 1000);
      }
      previousPriceRef.current = newData.quote.price;

      setBrief(newData);
      lastFetchedTimeRef.current = Date.now();
      setSecondsAgo(0);
      setCountdown(refreshIntervalSec);
    } catch (err: any) {
      console.error("fetchBrief error:", err);
      setError(err?.message || "Failed to load market data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedInstrument, refreshIntervalSec]);

  // Initial fetch
  useEffect(() => {
    fetchBrief();
  }, [fetchBrief]);

  // Auto-refresh timer loop
  useEffect(() => {
    if (!isAutoRefreshOn) return;

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastFetchedTimeRef.current) / 1000);
      setSecondsAgo(elapsed);

      setCountdown((prev) => {
        if (prev <= 1) {
          fetchBrief();
          return refreshIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoRefreshOn, fetchBrief, refreshIntervalSec]);

  const toggleSection = (section: "vwap" | "retrace" | "levels" | "checklist") => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const quote = brief?.quote;
  const metrics = brief?.sessionMetrics;
  const plan = brief?.tacticalPlan;
  const volSurface = brief?.macro.volatilitySurface;
  const macroRegime = brief?.macro.macroRegime;

  const activeScenario = plan?.scenarios.find((s) => s.id === activeScenarioId) || plan?.scenarios[0];
  const distToVwap = metrics && quote ? Math.round((quote.price - metrics.sessionVwap) * 10) / 10 : 0;

  const formattedLastUpdated = brief?.generatedAt
    ? new Date(brief.generatedAt).toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    : null;

  const formattedExchangeTime = quote?.timestamp
    ? new Date(quote.timestamp).toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    : null;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <Header
        lastUpdated={brief?.generatedAt}
        secondsAgo={secondsAgo}
        autoRefreshCountdown={countdown}
        isAutoRefreshOn={isAutoRefreshOn}
        onToggleAutoRefresh={() => setIsAutoRefreshOn(!isAutoRefreshOn)}
        dataStatus={brief?.dataSource.quoteStatus || "LIVE"}
        providerName={brief?.dataSource.providerName || "Yahoo Finance"}
        isRefreshing={refreshing}
        onRefresh={() => fetchBrief(true)}
        selectedInstrument={selectedInstrument}
        onSelectInstrument={(inst) => setSelectedInstrument(inst)}
        currentProfile={currentProfile}
        profiles={profiles}
        onSelectProfile={(id) => {
          const found = profiles.find((p) => p.id === id);
          if (found) setCurrentProfile(found);
        }}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Loading State */}
        {loading && !brief && (
          <div className="p-12 rounded-lg bg-[#0f1624] border border-slate-800 text-center space-y-3">
            <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Loading OpenPulse v2.0 quantitative data feed...</p>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-900/60 flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchBrief(true)}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white border border-rose-900/60"
            >
              Retry
            </button>
          </div>
        )}

        {brief && quote && metrics && plan && (
          <>
            {/* Prominent Delayed Feed Banner During 9:30–10:00 AM ET */}
            {plan.isDelayedFeedWarningActive && (
              <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-800/80 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-semibold tracking-wide uppercase text-[11px]">
                    {plan.delayedFeedBannerText}
                  </span>
                </div>
                <span className="text-[11px] text-amber-300/80 font-mono">
                  CME Group mandates 10–15m delay on free web quotes. Rely on pre-computed levels & your live broker chart.
                </span>
              </div>
            )}

            {/* News Buffer Warning if Catalyst is at 9:45 or 10:00 AM */}
            {plan.newsBufferWarning && (
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/80 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-medium">{plan.newsBufferWarning}</span>
              </div>
            )}

            {/* Live QQQ Proxy Banner if Available */}
            {plan.qqqLiveProxy && (
              <div className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-2.5">
                  <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono font-bold">
                    LIVE QQQ PROXY
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-white">
                    ${plan.qqqLiveProxy.price.toFixed(2)}
                  </span>
                  <span
                    className={`font-mono tabular-nums text-[11px] font-medium ${
                      plan.qqqLiveProxy.change >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {plan.qqqLiveProxy.change >= 0 ? "+" : ""}{plan.qqqLiveProxy.change.toFixed(2)} ({plan.qqqLiveProxy.changePercent >= 0 ? "+" : ""}{plan.qqqLiveProxy.changePercent.toFixed(2)}%)
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  Real-time equity direction reference for 9:30–10:00 AM ET window
                </span>
              </div>
            )}

            {/* 1. HERO DIRECTIVE CARD */}
            <div className="p-5 rounded-lg bg-[#0f1624] border border-slate-800 space-y-4">
              {/* Ticker & Real-Time Sync Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                <div className="flex items-center space-x-4">
                  <div className="flex items-baseline space-x-2.5">
                    <span
                      className={`text-2xl sm:text-3xl font-mono tabular-nums font-bold tracking-tight transition-colors duration-150 ${
                        priceFlash === "up"
                          ? "text-emerald-400"
                          : priceFlash === "down"
                          ? "text-rose-400"
                          : "text-white"
                      }`}
                    >
                      {quote.displaySymbol} {quote.price.toFixed(2)}
                    </span>

                    <span
                      className={`text-xs font-mono tabular-nums font-semibold flex items-center ${
                        quote.change >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {quote.change >= 0 ? <TrendingUp className="w-3.5 h-3.5 mr-0.5 inline" /> : <TrendingDown className="w-3.5 h-3.5 mr-0.5 inline" />}
                      {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%)
                    </span>
                  </div>

                  <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-mono tabular-nums bg-slate-900 text-slate-300 border border-slate-800">
                    VIX: {brief.macro.vix.value.toFixed(1)}
                  </span>
                </div>

                {/* Right: Last Updated & Sync Indicator */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center space-x-1.5 text-slate-400 text-[11px]">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>Polled:</span>
                    <strong className="text-slate-200 font-mono tabular-nums">
                      {formattedLastUpdated ? `${formattedLastUpdated} ET` : "--:--:--"}
                    </strong>
                    <span className="text-slate-500 font-mono tabular-nums">({secondsAgo}s ago)</span>
                  </div>

                  {formattedExchangeTime && (
                    <span
                      className="hidden md:inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums bg-slate-900 text-amber-300 border border-slate-800"
                      title="Actual CME Globex exchange timestamp."
                    >
                      CME Tick: {formattedExchangeTime} ET ({quote.status})
                    </span>
                  )}

                  <button
                    onClick={() => fetchBrief(true)}
                    disabled={refreshing}
                    className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                    title="Refresh market data now"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-cyan-400" : ""}`} />
                  </button>

                  <span className="px-2 py-0.5 rounded text-[11px] font-mono tabular-nums font-semibold bg-slate-900 text-cyan-300 border border-slate-800">
                    {plan.retraceAnalysis.likelihoodTier} RETRACE PROBABILITY
                  </span>
                </div>
              </div>

              {/* The #1 Single Action Directive */}
              <div className="space-y-1.5">
                <span className="text-xs text-slate-400 font-medium block">
                  Today's Execution Directive (9:30–10:00 AM ET):
                </span>
                <p className="text-sm text-slate-100 font-medium leading-relaxed bg-slate-900/60 p-3.5 rounded border border-slate-800/80">
                  {plan.singleTradeDirective}
                </p>
              </div>

              {/* Live Distance Reference Columns */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
                <div className="p-2.5 rounded bg-slate-900/40 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block">Session VWAP ({metrics.vwapCalculationMode === "TWAP_FALLBACK" ? "TWAP" : "VWAP"})</span>
                  <span className="text-sm font-mono tabular-nums font-bold text-white mt-0.5 block">{metrics.sessionVwap.toFixed(1)}</span>
                  <span className={`text-[11px] font-mono tabular-nums font-medium ${distToVwap >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {distToVwap >= 0 ? `${distToVwap} pts below` : `${Math.abs(distToVwap)} pts above`}
                  </span>
                </div>

                <div className="p-2.5 rounded bg-slate-900/40 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block">Overnight High (ONH)</span>
                  <span className="text-sm font-mono tabular-nums font-bold text-white mt-0.5 block">{metrics.onh.toFixed(1)}</span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">{(metrics.onh - quote.price).toFixed(1)} pts away</span>
                </div>

                <div className="p-2.5 rounded bg-slate-900/40 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block">Expected Straddle Move</span>
                  <span className="text-sm font-mono tabular-nums font-bold text-white mt-0.5 block">±{metrics.expectedMoveStraddle.toFixed(1)} pts</span>
                  <span className="text-[11px] text-slate-500 font-mono">{metrics.overnightRangeConsumedPercent.toFixed(0)}% consumed ON</span>
                </div>

                <div className="p-2.5 rounded bg-slate-900/40 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block">Expected Pullback</span>
                  <span className="text-sm font-mono tabular-nums font-bold text-slate-100 mt-0.5 block">~{plan.retraceAnalysis.expectedPullbackDepthPts} pts</span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">15m ATR: {metrics.atr15mIntraday} pts</span>
                </div>
              </div>

              {/* Volatility Surface Strip */}
              {volSurface && (
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-400">Vol Surface:</span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-slate-300">
                      VXN: {volSurface.vxn.toFixed(1)}%
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-slate-300">
                      YZ 20d RV: {volSurface.realizedVolYZ20d.toFixed(1)}%
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-semibold ${
                        volSurface.isNegativeVrp
                          ? "bg-rose-950/60 border border-rose-800 text-rose-300"
                          : "bg-emerald-950/60 border border-emerald-800 text-emerald-300"
                      }`}
                    >
                      VRP: {volSurface.vrp > 0 ? "+" : ""}{volSurface.vrp.toFixed(1)}%
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-slate-300">
                      VIX/3M: {volSurface.termRatio.toFixed(2)} ({volSurface.termStructureRegime})
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-slate-300">
                      VVIX: {volSurface.vvix.toFixed(1)}
                    </span>
                  </div>

                  {macroRegime && (
                    <span className="text-slate-400 font-mono text-[10px]">
                      {macroRegime.macroCorrelationRegime} (r = {macroRegime.stockBondCorrelation60d.toFixed(2)})
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 2. THE 5 CORE TRADER QUESTIONS & FACTOR SCORECARD */}
            <Trader5CoreAnswersCard
              answers={plan.trader5Answers}
              currentPrice={quote.price}
              factorScorecard={plan.retraceAnalysis.factorScorecard}
              smtDivergence={metrics.smtDivergence}
              volatilitySurface={volSurface}
            />

            {/* 3. DYNAMIC CONTRACT & STOP SIZER */}
            <RiskSizingCard
              atr15m={metrics.atr15mIntraday}
              regimeRiskMultiplier={brief.bias.regimeRiskMultiplier}
              defaultInstrument={selectedInstrument}
              defaultBaseRisk={currentProfile?.riskBudgetDollars || 250}
              defaultTargetRR={2.2}
              suggestedStopPts={Math.round(metrics.atr15mIntraday * 0.85)}
            />

            {/* 4. US ECONOMIC CALENDAR (Red & Orange Folders) */}
            <EconomicNewsCard
              events={brief.macro.events}
              tradeDate={brief.tradeDate}
            />

            {/* 5. EXPANDABLE DRILLDOWN TILES */}
            <div className="space-y-3">
              {/* TILE 1: "WHAT IF VWAP HITS?" (Collapsible) */}
              <div className="rounded-lg bg-[#0f1624] border border-slate-800 overflow-hidden">
                <button
                  onClick={() => toggleSection("vwap")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-900/40 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Compass className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold text-white">
                          What It Means If VWAP Hits ({metrics.sessionVwap.toFixed(1)})
                        </span>
                        <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-slate-900 text-slate-300 border border-slate-800">
                          {distToVwap >= 0 ? `${distToVwap} pts below` : `${Math.abs(distToVwap)} pts above`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xl">
                        Absorption wick = continuation entry | Clean close below = retrace failed (stand aside)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span className="hidden sm:inline text-xs">
                      {expandedSection === "vwap" ? "Collapse rules" : "View rules"}
                    </span>
                    {expandedSection === "vwap" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {expandedSection === "vwap" && (
                  <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/30 space-y-4 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3.5 rounded bg-slate-900/80 border border-emerald-900/40 space-y-1.5">
                        <div className="flex items-center space-x-1.5 text-emerald-400 font-semibold text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>IF BOUNCED & DEFENDED (Absorption)</span>
                        </div>
                        <p className="text-slate-300 leading-relaxed font-sans">
                          {plan.vwapPlaybook.bounceMeaning}
                        </p>
                      </div>

                      <div className="p-3.5 rounded bg-slate-900/80 border border-rose-900/40 space-y-1.5">
                        <div className="flex items-center space-x-1.5 text-rose-400 font-semibold text-xs">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>IF SLICED & ACCEPTED BELOW (Breakdown)</span>
                        </div>
                        <p className="text-slate-300 leading-relaxed font-sans">
                          {plan.vwapPlaybook.breakdownMeaning}
                        </p>
                      </div>
                    </div>

                    <div className="p-3 rounded bg-slate-900 border border-slate-800 space-y-1">
                      <span className="text-white font-medium block">
                        Action Required When Price Touches {metrics.sessionVwap.toFixed(1)}:
                      </span>
                      <p className="text-slate-300 leading-relaxed">
                        {plan.vwapPlaybook.actionIfTested}
                      </p>
                    </div>

                    {/* Interactive Scenario Buttons */}
                    <div className="space-y-2 pt-1">
                      <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">
                        Select Conditional Scenario:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {plan.scenarios.map((sc) => (
                          <button
                            key={sc.id}
                            onClick={() => setActiveScenarioId(sc.id)}
                            className={`p-2.5 rounded text-left border transition-colors ${
                              activeScenarioId === sc.id
                                ? "bg-slate-800 border-cyan-500 text-white"
                                : "bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/60"
                            }`}
                          >
                            <span className="font-semibold block text-xs">{sc.conditionShort}</span>
                            <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                              {sc.targetObjective.split(":")[0]}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {activeScenario && (
                      <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-xs font-semibold text-white">{activeScenario.condition}</span>
                          <span className="text-[11px] font-mono text-cyan-400">{activeScenario.status}</span>
                        </div>

                        <div className="space-y-1">
                          <span className="text-slate-400 font-medium block text-[11px]">WHAT IT MEANS (INSTITUTIONAL):</span>
                          <p className="text-slate-200 leading-relaxed">{activeScenario.whatItMeans}</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div className="p-3 rounded bg-slate-900 border border-emerald-900/50 space-y-1">
                            <span className="text-emerald-400 font-semibold block text-[11px]">ENTRY TRIGGER:</span>
                            <p className="text-slate-200">{activeScenario.entryTrigger}</p>
                          </div>

                          <div className="p-3 rounded bg-slate-900 border border-rose-900/50 space-y-1">
                            <span className="text-rose-400 font-semibold block text-[11px]">HARD INVALIDATION (STOP):</span>
                            <p className="text-slate-200">{activeScenario.invalidation}</p>
                          </div>
                        </div>

                        <div className="p-3 rounded bg-slate-900/80 border border-amber-900/50 text-slate-300 text-xs">
                          <strong className="text-amber-400">Retail Trap Warning:</strong> {activeScenario.trapWarning}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* TILE 2: "IS RETRACE PROBABLE TODAY?" (Collapsible) */}
              <div className="rounded-lg bg-[#0f1624] border border-slate-800 overflow-hidden">
                <button
                  onClick={() => toggleSection("retrace")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-900/40 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Crosshair className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold text-white">
                          Is a Retrace Probable Today?
                        </span>
                        <span className="text-[11px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-slate-900 text-cyan-300 border border-slate-800">
                          {plan.retraceAnalysis.likelihoodTier} LIKELIHOOD
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xl">
                        {plan.retraceAnalysis.verdictHeadline}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span className="hidden sm:inline text-xs">
                      {expandedSection === "retrace" ? "Hide analysis" : "View analysis"}
                    </span>
                    {expandedSection === "retrace" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

                {expandedSection === "retrace" && (
                  <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-900/30 space-y-3 text-xs">
                    <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800 space-y-2">
                      <span className="font-semibold text-white text-sm block">
                        {plan.retraceAnalysis.verdictHeadline}
                      </span>
                      <p className="text-slate-300 leading-relaxed">
                        {plan.retraceAnalysis.explanation}
                      </p>
                    </div>

                    <div className="p-3 rounded bg-slate-900/60 border border-slate-800 text-slate-200">
                      <strong className="text-cyan-400">Actionable Retrace Protocol:</strong> {plan.retraceAnalysis.retraceActionAdvice}
                    </div>

                    {/* Timeline Guide */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                        <span className="text-amber-400 font-mono font-medium block">09:30–09:33 AM</span>
                        <span className="text-slate-300 mt-0.5 block">{plan.timelineGuide.observePhase.rule}</span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                        <span className="text-cyan-400 font-mono font-medium block">09:34–09:48 AM</span>
                        <span className="text-slate-200 mt-0.5 block">{plan.timelineGuide.entryWindow.rule}</span>
                      </div>
                      <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                        <span className="text-emerald-400 font-mono font-medium block">09:48–10:00 AM</span>
                        <span className="text-slate-300 mt-0.5 block">{plan.timelineGuide.managementPhase.rule}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* TILE 3: "KEY REFERENCE LEVELS" (Collapsible) */}
              <div className="rounded-lg bg-[#0f1624] border border-slate-800 overflow-hidden">
                <button
                  onClick={() => toggleSection("levels")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-900/40 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Layers className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold text-white">
                          Reference Levels Matrix ({brief.keyLevels.length} levels)
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                        <span>ONH: <strong className="text-slate-200">{metrics.onh.toFixed(1)}</strong></span>
                        <span>•</span>
                        <span>VWAP: <strong className="text-slate-200">{metrics.sessionVwap.toFixed(1)}</strong></span>
                        <span>•</span>
                        <span>PDC: <strong className="text-slate-200">{metrics.pdc.toFixed(1)}</strong></span>
                        <span>•</span>
                        <span>PDH: <strong className="text-slate-200">{metrics.pdh.toFixed(1)}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span className="hidden sm:inline text-xs">
                      {expandedSection === "levels" ? "Hide table" : "View full table"}
                    </span>
                    {expandedSection === "levels" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

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
              <div className="rounded-lg bg-[#0f1624] border border-slate-800 overflow-hidden">
                <button
                  onClick={() => toggleSection("checklist")}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-900/40 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <CheckCircle2 className="w-4 h-4 text-slate-400" />
                    <div>
                      <span className="text-sm font-semibold text-white block">
                        NY Open Execution Checklist
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Pre-flight gates (Wait for 9:34 AM • Check news catalysts • Stop fits budget)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span className="hidden sm:inline text-xs">
                      {expandedSection === "checklist" ? "Hide checklist" : "Open checklist"}
                    </span>
                    {expandedSection === "checklist" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>

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
            <div className="px-4 py-2.5 rounded bg-[#0f1624] border border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>
                  Feed: {brief.dataSource.providerName} • Price:{" "}
                  <strong className="text-white font-mono tabular-nums">{quote.price.toFixed(2)}</strong> • Exchange Tick:{" "}
                  <span className="text-slate-300 font-mono tabular-nums">{formattedExchangeTime ? `${formattedExchangeTime} ET` : "--:--:--"}</span>{" "}
                  ({quote.status})
                </span>
              </span>
              <span className="text-slate-500 font-mono tabular-nums text-[11px]">
                Last updated {secondsAgo}s ago • Next sync in {countdown}s
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
