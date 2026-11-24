"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { Trader5CoreAnswersCard } from "@/components/Trader5CoreAnswersCard";
import { KeyLevelsTable } from "@/components/KeyLevelsTable";
import { RiskSizingCard } from "@/components/RiskSizingCard";
import { ChecklistCard } from "@/components/ChecklistCard";
import { OpenBriefData, KeyLevel } from "@/types/market";
import { UserProfile } from "@/types/app";
import { useTimezone } from "@/context/TimezoneContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RefreshCw, AlertTriangle, AlertCircle, Brain, Compass, ShieldAlert, Crosshair, TrendingUp, TrendingDown, Target } from "lucide-react";

const MinBookChart = dynamic(() => import("@/components/chart/MinBookChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[560px] w-full rounded-lg bg-zinc-950 border border-zinc-800/80 flex items-center justify-center">
      <div className="flex items-center space-x-2 text-xs text-zinc-400 font-mono">
        <RefreshCw className="w-4 h-4 animate-spin text-zinc-300" />
        <span>INITIALIZING MARKET STRUCTURE CHART (TV V5)...</span>
      </div>
    </div>
  ),
});

export function Dashboard() {
  const [selectedInstrument, setSelectedInstrument] = useState<"NQ" | "MNQ">("NQ");
  const [brief, setBrief] = useState<OpenBriefData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // User Profiles
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);

  // Dynamic live auto-refresh state (60s serverless guardrail)
  const [isAutoRefreshOn, setIsAutoRefreshOn] = useState<boolean>(true);
  const [refreshIntervalSec] = useState<number>(60);
  const [countdown, setCountdown] = useState<number>(60);
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  const lastFetchedTimeRef = useRef<number>(Date.now());
  const previousPriceRef = useRef<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<"up" | "down" | null>(null);

  const [focusedLevel, setFocusedLevel] = useState<KeyLevel | null>(null);

  // Fetch profiles
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const profileList = res.data?.profiles || res.profiles || [];
          setProfiles(profileList);
          const active =
            profileList.find((p: UserProfile) => p.id === "default") ||
            profileList[0];
          setCurrentProfile(active || null);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch market brief & actionable playbook
  const fetchBrief = useCallback(
    async (isManual: boolean = false) => {
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

        if (
          previousPriceRef.current !== null &&
          newData.quote.price !== previousPriceRef.current
        ) {
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
    },
    [selectedInstrument, refreshIntervalSec]
  );

  useEffect(() => {
    fetchBrief();
  }, [fetchBrief]);

  useEffect(() => {
    if (!isAutoRefreshOn) return;

    const timer = setInterval(() => {
      // Pause polling automatically whenever document is hidden (background tab)
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }

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

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const elapsed = Math.floor((Date.now() - lastFetchedTimeRef.current) / 1000);
        if (elapsed >= refreshIntervalSec) {
          fetchBrief();
          setCountdown(refreshIntervalSec);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAutoRefreshOn, fetchBrief, refreshIntervalSec]);

  const quote = brief?.quote;
  const metrics = brief?.sessionMetrics;
  const plan = brief?.tacticalPlan;
  const volSurface = brief?.macro.volatilitySurface;
  const macroRegime = brief?.macro.macroRegime;

  const { timezone, timezoneCode, config } = useTimezone();

  const formattedLastUpdated = brief?.generatedAt
    ? new Date(brief.generatedAt).toLocaleTimeString("en-US", {
        timeZone: timezone,
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const formattedExchangeTime = quote?.timestamp
    ? new Date(quote.timestamp).toLocaleTimeString("en-US", {
        timeZone: timezone,
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const isBull = brief?.bias.verdict.includes("BULLISH") ?? false;
  const isBear = brief?.bias.verdict.includes("BEARISH") ?? false;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 space-y-3.5">
        {/* Loading State */}
        {loading && !brief && (
          <div className="p-12 rounded-lg bg-zinc-900/50 border border-zinc-800 text-center space-y-2.5">
            <RefreshCw className="w-4 h-4 text-zinc-400 animate-spin mx-auto" />
            <p className="text-xs text-zinc-400 font-mono">
              Connecting quantitative market stream...
            </p>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-xs text-rose-300">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchBrief(true)}
              className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-700 font-mono"
            >
              Retry
            </button>
          </div>
        )}

        {brief && quote && metrics && plan && volSurface && macroRegime && (
          <>
            {/* CME Delayed Feed Warning if Active */}
            {plan.isDelayedFeedWarningActive && (
              <div className="px-3.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 font-mono">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-semibold text-[11px] uppercase">
                    {plan.delayedFeedBannerText}
                  </span>
                </div>
                <span className="text-[11px] text-amber-400/80">
                  CME mandates 10–15m delay on free web quotes. Rely on pre-computed levels.
                </span>
              </div>
            )}

            {/* News Catalyst Buffer Warning */}
            {plan.newsBufferWarning && (
              <div className="px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="font-medium">{plan.newsBufferWarning}</span>
              </div>
            )}

            {/* 1. HERO: AI QUANT PREDICTION COMMAND CARD (Forefront of MinBook) */}
            <div className="rounded-lg bg-zinc-900/80 border border-zinc-800/80 p-4 sm:p-5 space-y-3.5">
              {/* Top Banner Row: Model Identification & Conviction Badge */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-zinc-800/60 text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-zinc-800 text-zinc-100 font-semibold text-[11px] border border-zinc-700">
                    <Brain className="w-3.5 h-3.5 text-emerald-400" />
                    <span>AI QUANT PREDICTION</span>
                  </span>
                  <span className="text-[11px] text-zinc-400 hidden sm:inline">
                    NY Open Window (09:30–10:00 ET)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Conviction / Confidence */}
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${
                      isBull
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : isBear
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {plan.retraceAnalysis.probabilityPercent || (plan.retraceAnalysis.likelihoodTier === "HIGH" ? 82 : plan.retraceAnalysis.likelihoodTier === "MODERATE" ? 65 : 45)}% CONVICTION · {brief.bias.confidence} TIER
                  </span>

                  {/* Size Multiplier */}
                  <span className="px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/80 text-zinc-300 text-[11px] tabular-nums font-semibold">
                    SIZE {brief.bias.regimeRiskMultiplier.toFixed(1)}x
                  </span>

                  {/* Spot Price */}
                  <div className="flex items-baseline space-x-1 pl-1 font-mono tabular-nums text-xs">
                    <span
                      className={`font-bold transition-colors duration-150 ${
                        priceFlash === "up"
                          ? "text-emerald-400"
                          : priceFlash === "down"
                          ? "text-rose-400"
                          : "text-zinc-100"
                      }`}
                    >
                      {quote.displaySymbol} {quote.price.toFixed(2)}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        quote.change >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      ({quote.change >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* 3-Column Execution Prediction Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. The Call: Direction & Setup */}
                <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
                  <span className="text-zinc-400 text-[11px] font-mono uppercase tracking-wider flex items-center space-x-1.5">
                    <Compass className="w-3.5 h-3.5 text-zinc-400" />
                    <span>The Call: Direction &amp; Setup</span>
                  </span>
                  <div className="flex items-center space-x-2 pt-0.5">
                    <span
                      className={`text-sm font-bold tracking-tight uppercase flex items-center space-x-1 ${
                        isBull ? "text-emerald-400" : isBear ? "text-rose-400" : "text-amber-400"
                      }`}
                    >
                      {isBull ? <TrendingUp className="w-4 h-4" /> : isBear ? <TrendingDown className="w-4 h-4" /> : null}
                      <span>{isBull ? "BUY / LONG CONTINUATION" : isBear ? "SELL / SHORT CONTINUATION" : "STAND ASIDE / CHOP"}</span>
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 font-sans leading-relaxed">
                    {plan.singleTradeDirective}
                  </p>
                </div>

                {/* 2. The Stop Hunt: Opening Trap */}
                <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 text-[11px] font-mono uppercase tracking-wider flex items-center space-x-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      <span>Opening Stop Hunt Trap</span>
                    </span>
                    <span
                      className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                        plan.trader5Answers.stopHuntProbability.includes("HIGH")
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {plan.trader5Answers.stopHuntProbability.split(" ")[0]} RISK
                    </span>
                  </div>
                  <div className="text-xs font-mono font-bold text-amber-300">
                    Watch: {plan.trader5Answers.stopHuntDetails.sweepLevelName}
                  </div>
                  <p className="text-xs text-zinc-300 font-sans leading-relaxed line-clamp-2">
                    {plan.trader5Answers.stopHuntDetails.actionableAdvice}
                  </p>
                </div>

                {/* 3. The Trade: Cheat Sheet Levels */}
                <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1.5 text-xs font-mono">
                  <span className="text-zinc-400 text-[11px] uppercase tracking-wider flex items-center space-x-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Trade Cheat Sheet</span>
                  </span>
                  <div className="space-y-1 pt-0.5 tabular-nums text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Entry Retrace:</span>
                      <strong className="text-emerald-400">{plan.trader5Answers.retraceLevels[0]?.price.toFixed(1)} (VWAP)</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Invalidation Stop:</span>
                      <strong className="text-rose-400">
                        {((isBull ? metrics.onl : metrics.onh) - (isBull ? 4 : -4)).toFixed(1)} (Below Wick)
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Take Profit:</span>
                      <strong className="text-zinc-100">{plan.trader5Answers.drawsOnLiquidity[0]?.price.toFixed(1)} (Target #1)</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quant Model Consensus Strip: Explaining the Math Behind the Prediction */}
              <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-zinc-400 border-t border-zinc-800/60">
                <span className="text-zinc-500 uppercase tracking-wider font-semibold">Quant Strat Alignment:</span>
                <div>
                  <span className="text-zinc-500">Vol: </span>
                  <span className="text-zinc-200 font-medium">{volSurface.termStructureRegime}</span>
                </div>
                <span className="text-zinc-700">|</span>
                <div>
                  <span className="text-zinc-500">VRP: </span>
                  <span className={volSurface.isNegativeVrp ? "text-rose-400 font-bold" : "text-emerald-400 font-medium"}>
                    {volSurface.vrp > 0 ? "+" : ""}{volSurface.vrp.toFixed(1)}% ({volSurface.isNegativeVrp ? "Chop" : "Safe"})
                  </span>
                </div>
                <span className="text-zinc-700">|</span>
                {brief.gex && (
                  <>
                    <div>
                      <span className="text-zinc-500">GEX: </span>
                      <span className={brief.gex.netGammaRegime === "POSITIVE_GAMMA" ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                        {brief.gex.netGammaRegime === "POSITIVE_GAMMA" ? "+Γ Floor" : "-Γ Momentum"}
                      </span>
                    </div>
                    <span className="text-zinc-700">|</span>
                  </>
                )}
                <div>
                  <span className="text-zinc-500">SMT: </span>
                  <span className={metrics.smtDivergence?.hasDivergence ? "text-amber-400 font-bold" : "text-zinc-200"}>
                    {metrics.smtDivergence?.hasDivergence ? metrics.smtDivergence.divergenceType.split(" ")[0] : "NQ/ES Synced"}
                  </span>
                </div>
                <span className="text-zinc-700">|</span>
                {brief.footprint && (
                  <>
                    <div>
                      <span className="text-zinc-500">CVD: </span>
                      <span className={brief.footprint.sessionCvd >= 0 ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                        {brief.footprint.sessionCvd >= 0 ? "+" : ""}{(brief.footprint.sessionCvd / 1000).toFixed(1)}k
                      </span>
                    </div>
                    <span className="text-zinc-700">|</span>
                  </>
                )}
                <div>
                  <span className="text-zinc-500">Impulse: </span>
                  <span className="text-zinc-200 font-medium">5D {metrics.htfImpulseDirection}</span>
                </div>
              </div>
            </div>

            {/* 2. 2-COLUMN MAIN WORKSPACE (Chart-First: 68% Left, 32% Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
              {/* Left Column (~68% width): Full-Height MinBookChart */}
              <div className="lg:col-span-8 space-y-3">
                <MinBookChart
                  brief={brief}
                  selectedInstrument={selectedInstrument}
                  focusedLevel={focusedLevel}
                  onClearFocusedLevel={() => setFocusedLevel(null)}
                  onSelectLevel={(lvl) => setFocusedLevel(lvl)}
                />
              </div>

              {/* Right Column (~32% width): Tabbed Side Panel (Playbook in FRONT of Levels) */}
              <div className="lg:col-span-4">
                <Tabs defaultValue="playbook" className="w-full">
                  <TabsList className="w-full grid grid-cols-3 bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg mb-2.5">
                    <TabsTrigger
                      value="playbook"
                      className="text-xs font-mono font-medium py-1.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 transition-colors"
                    >
                      Playbook
                    </TabsTrigger>
                    <TabsTrigger
                      value="levels"
                      className="text-xs font-mono font-medium py-1.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 transition-colors"
                    >
                      Levels
                    </TabsTrigger>
                    <TabsTrigger
                      value="sizer"
                      className="text-xs font-mono font-medium py-1.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 transition-colors"
                    >
                      Sizer
                    </TabsTrigger>
                  </TabsList>

                  {/* Playbook Content (Default & First) */}
                  <TabsContent
                    value="playbook"
                    className="mt-0 space-y-3 focus-visible:outline-none max-h-[600px] overflow-y-auto pr-1"
                  >
                    <Trader5CoreAnswersCard
                      answers={plan.trader5Answers}
                      currentPrice={quote.price}
                      factorScorecard={plan.retraceAnalysis.factorScorecard}
                      smtDivergence={metrics.smtDivergence}
                      volatilitySurface={volSurface}
                      gex={brief.gex}
                      footprint={brief.footprint}
                    />

                    <ChecklistCard
                      tradeDate={brief.tradeDate}
                      userId={currentProfile?.id || "default"}
                    />
                  </TabsContent>

                  {/* Levels Content (Second) */}
                  <TabsContent value="levels" className="mt-0 focus-visible:outline-none">
                    <KeyLevelsTable
                      levels={brief.keyLevels}
                      currentPrice={quote.price}
                      focusedLevelId={focusedLevel?.id}
                      onSelectLevel={(lvl) => setFocusedLevel(lvl)}
                    />
                  </TabsContent>

                  {/* Sizer Content (Third) */}
                  <TabsContent value="sizer" className="mt-0 focus-visible:outline-none">
                    <RiskSizingCard
                      atr15m={metrics.atr15mIntraday}
                      regimeRiskMultiplier={brief.bias.regimeRiskMultiplier}
                      defaultInstrument={selectedInstrument}
                      defaultBaseRisk={currentProfile?.riskBudgetDollars || 250}
                      suggestedStopPts={Math.round(metrics.atr15mIntraday * 0.85)}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            {/* Bottom Status Bar */}
            <div className="px-3.5 py-2 rounded-lg bg-zinc-900/70 border border-zinc-800/80 text-[11px] font-mono text-zinc-400 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>
                  Feed: {brief.dataSource.providerName} • Price:{" "}
                  <strong className="text-zinc-100 tabular-nums font-semibold">
                    {quote.price.toFixed(2)}
                  </strong>{" "}
                  • CME Tick:{" "}
                  <span className="text-zinc-300 tabular-nums">
                    {formattedExchangeTime ? `${formattedExchangeTime} ${timezoneCode}` : "--:--:--"}
                  </span>
                </span>
              </span>
              <span className="text-zinc-500 tabular-nums">
                Updated {secondsAgo}s ago • Next sync in {countdown}s
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default Dashboard;
