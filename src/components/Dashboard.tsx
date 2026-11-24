"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { Header } from "@/components/Header";
import { KeyLevelsTable } from "@/components/KeyLevelsTable";
import { OpenBriefData, KeyLevel } from "@/types/market";
import { UserProfile } from "@/types/app";
import { useTimezone } from "@/context/TimezoneContext";
import { buildPlainEnglishBrief, ActionableArea } from "@/lib/market/plainEnglishBrief";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Target,
  ArrowUpRight,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  BarChart3,
} from "lucide-react";

const MinBookChart = dynamic(() => import("@/components/chart/MinBookChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[560px] w-full rounded-lg bg-zinc-950 border border-zinc-800/80 flex items-center justify-center">
      <div className="flex items-center space-x-2 text-xs text-zinc-400 font-mono">
        <RefreshCw className="w-4 h-4 animate-spin text-zinc-300" />
        <span>LOADING CHART...</span>
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

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);

  const [isAutoRefreshOn, setIsAutoRefreshOn] = useState<boolean>(true);
  const [refreshIntervalSec] = useState<number>(60);
  const [countdown, setCountdown] = useState<number>(60);
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  const lastFetchedTimeRef = useRef<number>(Date.now());
  const previousPriceRef = useRef<number | null>(null);
  const [priceFlash, setPriceFlash] = useState<"up" | "down" | null>(null);

  const [focusedLevel, setFocusedLevel] = useState<KeyLevel | null>(null);
  const [copiedPriceId, setCopiedPriceId] = useState<string | null>(null);
  const [showQuantMath, setShowQuantMath] = useState<boolean>(false);
  const [showGameplan, setShowGameplan] = useState<boolean>(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("minbook_show_gameplan");
      if (saved === "false") setShowGameplan(false);
    } catch {}
  }, []);

  const toggleGameplan = () => {
    const next = !showGameplan;
    setShowGameplan(next);
    try {
      localStorage.setItem("minbook_show_gameplan", String(next));
    } catch {}
  };

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
          setPriceFlash(newData.quote.price > previousPriceRef.current ? "up" : "down");
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
      if (typeof document !== "undefined" && document.hidden) return;
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

  const { timezone, timezoneCode } = useTimezone();

  const quote = brief?.quote;
  const plan = brief?.tacticalPlan;

  const plainBrief = useMemo(() => {
    if (!brief) return null;
    return buildPlainEnglishBrief(brief);
  }, [brief]);

  const formattedExchangeTime = quote?.timestamp
    ? new Date(quote.timestamp).toLocaleTimeString("en-US", {
        timeZone: timezone,
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const handleSelectArea = (area: ActionableArea) => {
    if (area.sourceLevel) {
      setFocusedLevel(area.sourceLevel);
    } else {
      setFocusedLevel({
        id: area.id,
        name: area.name,
        shortName: area.shortName,
        price: area.price,
        role: area.directionTag === "SUPPORT" ? "RETRACE ZONE" : "TARGET",
        distancePoints: area.distancePts,
        distancePercent: 0,
        timeframe: "INTRADAY",
        note: area.reason,
      });
    }
  };

  const handleCopyPrice = (e: React.MouseEvent, id: string, price: number) => {
    e.stopPropagation();
    navigator.clipboard.writeText(price.toFixed(2));
    setCopiedPriceId(id);
    setTimeout(() => setCopiedPriceId(null), 1500);
  };

  const isBull = plainBrief?.direction === "BULLISH";
  const isBear = plainBrief?.direction === "BEARISH";

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
        {loading && !brief && (
          <div className="p-12 rounded-lg bg-zinc-900/50 border border-zinc-800 text-center space-y-2.5">
            <RefreshCw className="w-4 h-4 text-zinc-400 animate-spin mx-auto" />
            <p className="text-xs text-zinc-400 font-mono">
              Loading market bias, bounce zones, and targets...
            </p>
          </div>
        )}

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

        {brief && quote && plan && plainBrief && (
          <>
            {/* Feed Delay / News Warning Banners (only shown when active) */}
            {plan.isDelayedFeedWarningActive && (
              <div className="px-3.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 font-mono">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-semibold text-[11px] uppercase">
                    {plan.delayedFeedBannerText}
                  </span>
                </div>
                <span className="text-[11px] text-amber-400/80">
                  Free web quotes carry a 10–15m CME delay.
                </span>
              </div>
            )}

            {plan.newsBufferWarning && (
              <div className="px-3.5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span className="font-medium">{plan.newsBufferWarning}</span>
              </div>
            )}

            {/* 1. CLEAN BIAS HERO + PLAIN-ENGLISH QUANT MATH & FACTS */}
            <div className="rounded-lg bg-zinc-900/80 border border-zinc-800/80 p-4 sm:p-5 space-y-3.5">
              {/* Top Row: Direction Bias, Risk Badge, Spot Price */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider border ${
                        isBull
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : isBear
                          ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      }`}
                    >
                      {isBull ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : isBear ? (
                        <TrendingDown className="w-3.5 h-3.5" />
                      ) : (
                        <ShieldAlert className="w-3.5 h-3.5" />
                      )}
                      <span>{plainBrief.direction}</span>
                    </span>

                    <span className="px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300">
                      {plainBrief.gameplan.sessionLabel}
                    </span>

                    <span className="px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-400">
                      {plainBrief.scoreSummary}
                    </span>

                    <span
                      className={`px-2 py-1 rounded text-[11px] font-mono font-semibold border ${
                        plainBrief.riskStatus.tone === "emerald"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : plainBrief.riskStatus.tone === "amber"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      }`}
                      title={plainBrief.riskStatus.reason}
                    >
                      {plainBrief.riskStatus.label}
                    </span>
                  </div>

                  <h1 className="text-base sm:text-lg font-semibold text-zinc-100 tracking-tight pt-1">
                    {plainBrief.verdictTitle}
                  </h1>
                  <p className="text-xs text-zinc-400 leading-relaxed max-w-3xl">
                    {plainBrief.verdictSubtitle}
                  </p>
                </div>

                {/* Right: Live Price & Toggle Quant Facts */}
                <div className="flex md:flex-col items-center md:items-end justify-between gap-2 shrink-0">
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-[11px] text-zinc-500 uppercase">
                      {quote.displaySymbol} Futures Spot
                    </div>
                    <div className="flex items-baseline space-x-1.5 justify-end">
                      <span
                        className={`text-xl font-bold transition-colors duration-150 ${
                          priceFlash === "up"
                            ? "text-emerald-400"
                            : priceFlash === "down"
                            ? "text-rose-400"
                            : "text-zinc-100"
                        }`}
                      >
                        {quote.price.toFixed(2)}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          quote.change >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {quote.change >= 0 ? "+" : ""}
                        {quote.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowQuantMath(!showQuantMath)}
                    className="px-2.5 py-1 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-300 flex items-center space-x-1.5 transition-colors"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{showQuantMath ? "Hide Quant Math" : "Show Quant Math"}</span>
                    {showQuantMath ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              {/* Quant Facts & Math Grid (Plain English + Real Numbers) */}
              {showQuantMath && (
                <div className="pt-3 border-t border-zinc-800/70 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {plainBrief.quantFacts.map((fact) => (
                    <div
                      key={fact.id}
                      className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                          {fact.label}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                            fact.status === "BULLISH"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : fact.status === "BEARISH"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : fact.status === "CAUTION"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700"
                          }`}
                        >
                          {fact.status}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-zinc-200 leading-snug">
                        {fact.headline}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 leading-snug tabular-nums">
                        {fact.mathDetail}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 1B. FUTURES DAY-TRADING GAMEPLAN (Minimizable: Stop Hunt, Stop Loss Room & Key Reminders) */}
            <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden">
              <button
                type="button"
                onClick={toggleGameplan}
                className="w-full px-4 py-2 bg-zinc-950/60 hover:bg-zinc-900/80 transition-colors flex items-center justify-between text-xs font-mono"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                    Futures Gameplan
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-900 text-zinc-400 border border-zinc-800">
                    {plainBrief.gameplan.sessionLabel} · {plainBrief.gameplan.sessionWindowHuman}
                  </span>
                  {!showGameplan && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span
                        className={`px-1.5 py-0.2 rounded font-bold border ${
                          plainBrief.gameplan.stopHunt.shouldWait
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-zinc-800 text-zinc-300 border-zinc-700"
                        }`}
                      >
                        {plainBrief.gameplan.stopHunt.badge}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded font-bold border ${
                          plainBrief.gameplan.stopLoss.mode === "EXTRA_ROOM"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        }`}
                      >
                        SL: {plainBrief.gameplan.stopLoss.mode === "EXTRA_ROOM" ? "EXTRA ROOM" : "AT WICK"}
                      </span>
                    </div>
                  )}
                </div>
                <span className="flex items-center space-x-1 text-[11px] text-zinc-400">
                  <span>{showGameplan ? "Minimize" : "Show"}</span>
                  {showGameplan ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </span>
              </button>

              {showGameplan && (
                <div className="p-3 border-t border-zinc-800/80 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Box 1: Wait for Stop Hunt? */}
                  <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/80 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                        Wait for Stop Hunt?
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          plainBrief.gameplan.stopHunt.shouldWait
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-zinc-800 text-zinc-300 border-zinc-700"
                        }`}
                      >
                        {plainBrief.gameplan.stopHunt.badge}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {plainBrief.gameplan.stopHunt.detail}
                    </p>
                  </div>

                  {/* Box 2: Stop Loss Placement (At Wick vs Extra Room) */}
                  <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/80 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                        Stop Loss Placement
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          plainBrief.gameplan.stopLoss.mode === "EXTRA_ROOM"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        }`}
                      >
                        {plainBrief.gameplan.stopLoss.badge}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {plainBrief.gameplan.stopLoss.detail}
                    </p>
                  </div>

                  {/* Box 3: Key Futures Day-Trading Reminders */}
                  <div className="rounded-lg bg-zinc-950/60 border border-zinc-800/80 p-3 space-y-1.5">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 block">
                      Key Futures Notes ({plainBrief.gameplan.sessionLabel})
                    </span>
                    <ul className="space-y-1 text-xs">
                      {plainBrief.gameplan.keyTips.map((tip, i) => (
                        <li key={i} className="flex items-start space-x-1.5 leading-snug">
                          <span
                            className={`font-mono text-[10px] font-bold shrink-0 mt-0.5 ${
                              tip.tone === "emerald"
                                ? "text-emerald-400"
                                : tip.tone === "amber"
                                ? "text-amber-400"
                                : tip.tone === "rose"
                                ? "text-rose-400"
                                : "text-zinc-400"
                            }`}
                          >
                            • {tip.label}:
                          </span>
                          <span className="text-zinc-300">{tip.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* 2. WORKSPACE: CHART (LEFT) + BOUNCE & TARGET AREAS (RIGHT) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
              {/* Chart (~67% width) */}
              <div className="lg:col-span-8">
                <MinBookChart
                  brief={brief}
                  selectedInstrument={selectedInstrument}
                  focusedLevel={focusedLevel}
                  onClearFocusedLevel={() => setFocusedLevel(null)}
                  onSelectLevel={(lvl) => setFocusedLevel(lvl)}
                />
              </div>

              {/* Right Panel (~33% width): Bounce Areas + Target Areas */}
              <div className="lg:col-span-4">
                <Tabs defaultValue="zones" className="w-full">
                  <TabsList className="w-full grid grid-cols-2 bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg mb-2.5">
                    <TabsTrigger
                      value="zones"
                      className="text-xs font-mono font-medium py-1.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 transition-colors"
                    >
                      Bounce &amp; Targets
                    </TabsTrigger>
                    <TabsTrigger
                      value="levels"
                      className="text-xs font-mono font-medium py-1.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 transition-colors"
                    >
                      All Levels
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab 1: Areas To Target (Top) & Areas It Could Bounce From (Bottom) */}
                  <TabsContent
                    value="zones"
                    className="mt-0 space-y-3 focus-visible:outline-none"
                  >
                    {/* Section A: Areas To Target */}
                    <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden">
                      <div className="px-3.5 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between">
                        <span className="text-xs font-mono font-semibold text-zinc-200 uppercase tracking-wider flex items-center space-x-1.5">
                          <Target className="w-3.5 h-3.5 text-amber-400" />
                          <span>Areas To Target</span>
                        </span>
                        <span className="text-[11px] font-mono text-zinc-500">
                          Click to show on chart
                        </span>
                      </div>

                      <div className="divide-y divide-zinc-800/60">
                        {plainBrief.targetAreas.length === 0 ? (
                          <div className="p-4 text-xs text-zinc-500 font-mono">
                            No target magnets computed.
                          </div>
                        ) : (
                          plainBrief.targetAreas.map((area) => {
                            const isFocused = focusedLevel?.id === area.id || focusedLevel?.id === area.sourceLevel?.id;
                            const isCopied = copiedPriceId === area.id;
                            return (
                              <div
                                key={area.id}
                                onClick={() => handleSelectArea(area)}
                                className={`p-3 cursor-pointer transition-colors group ${
                                  isFocused ? "bg-zinc-800/80" : "hover:bg-zinc-800/40"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <span className="text-xs font-semibold text-zinc-100 truncate">
                                      {area.name}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700 shrink-0">
                                      {area.directionTag === "UPSIDE TARGET" ? "UP" : "DOWN"}
                                    </span>
                                  </div>

                                  <div className="flex items-center space-x-2 font-mono tabular-nums shrink-0">
                                    <span className="text-xs font-bold text-zinc-100">
                                      {area.price.toFixed(2)}
                                    </span>
                                    <span
                                      className={`text-[11px] ${
                                        area.distancePts >= 0 ? "text-emerald-400" : "text-rose-400"
                                      }`}
                                    >
                                      {area.distancePts >= 0 ? "+" : ""}
                                      {area.distancePts.toFixed(1)}
                                    </span>
                                    <button
                                      onClick={(e) => handleCopyPrice(e, area.id, area.price)}
                                      className="p-1 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Copy price"
                                    >
                                      {isCopied ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                                <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                                  {area.reason}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Section B: Areas It Could Bounce From */}
                    <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden">
                      <div className="px-3.5 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between">
                        <span className="text-xs font-mono font-semibold text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>Areas It Could Bounce From</span>
                        </span>
                        <span className="text-[11px] font-mono text-zinc-500">
                          Click to show on chart
                        </span>
                      </div>

                      <div className="divide-y divide-zinc-800/60">
                        {plainBrief.bounceAreas.length === 0 ? (
                          <div className="p-4 text-xs text-zinc-500 font-mono">
                            No nearby bounce levels computed.
                          </div>
                        ) : (
                          plainBrief.bounceAreas.map((area) => {
                            const isFocused = focusedLevel?.id === area.id || focusedLevel?.id === area.sourceLevel?.id;
                            const isCopied = copiedPriceId === area.id;
                            return (
                              <div
                                key={area.id}
                                onClick={() => handleSelectArea(area)}
                                className={`p-3 cursor-pointer transition-colors group ${
                                  isFocused ? "bg-zinc-800/80" : "hover:bg-zinc-800/40"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center space-x-2 min-w-0">
                                    <span className="text-xs font-semibold text-zinc-100 truncate">
                                      {area.name}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold border shrink-0 ${
                                        area.strengthLabel === "HIGH"
                                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                          : "bg-zinc-800 text-zinc-300 border-zinc-700"
                                      }`}
                                    >
                                      {area.strengthLabel}
                                    </span>
                                  </div>

                                  <div className="flex items-center space-x-2 font-mono tabular-nums shrink-0">
                                    <span className="text-xs font-bold text-zinc-100">
                                      {area.price.toFixed(2)}
                                    </span>
                                    <span
                                      className={`text-[11px] ${
                                        area.distancePts >= 0 ? "text-emerald-400" : "text-rose-400"
                                      }`}
                                    >
                                      {area.distancePts >= 0 ? "+" : ""}
                                      {area.distancePts.toFixed(1)}
                                    </span>
                                    <button
                                      onClick={(e) => handleCopyPrice(e, area.id, area.price)}
                                      className="p-1 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Copy price"
                                    >
                                      {isCopied ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                                <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                                  {area.reason}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Tab 2: Full Levels Table */}
                  <TabsContent value="levels" className="mt-0 focus-visible:outline-none">
                    <KeyLevelsTable
                      levels={brief.keyLevels}
                      currentPrice={quote.price}
                      focusedLevelId={focusedLevel?.id}
                      onSelectLevel={(lvl) => setFocusedLevel(lvl)}
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
                  • Tick:{" "}
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
