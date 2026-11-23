"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { MacroRegimeStrip } from "@/components/MacroRegimeStrip";
import { BiasCard } from "@/components/BiasCard";
import { StopRiskCard } from "@/components/StopRiskCard";
import { KeyLevelsTable } from "@/components/KeyLevelsTable";
import { ChecklistCard } from "@/components/ChecklistCard";
import { OpenBriefData } from "@/types/market";
import { UserProfile } from "@/types/app";
import { AlertCircle, RefreshCw, Sparkles, Terminal } from "lucide-react";

export function Dashboard() {
  const [brief, setBrief] = useState<OpenBriefData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedInstrument, setSelectedInstrument] = useState<"NQ" | "MNQ">("NQ");
  const [riskDollars, setRiskDollars] = useState<number>(250);
  const [targetDollars, setTargetDollars] = useState<number>(550);

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);

  // Load user profiles
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.profiles?.length > 0) {
          setProfiles(res.profiles);
          const initial = res.current || res.profiles[0];
          setCurrentProfile(initial);
          if (initial.riskBudgetDollars) setRiskDollars(initial.riskBudgetDollars);
          if (initial.targetBudgetDollars) setTargetDollars(initial.targetBudgetDollars);
          if (initial.defaultInstrument) setSelectedInstrument(initial.defaultInstrument);
        }
      })
      .catch((err) => console.warn("Failed to load settings:", err));
  }, []);

  // Fetch market brief
  const fetchBrief = useCallback(async (isForceRefresh: boolean = false) => {
    if (isForceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const url = `/api/market-data?symbol=${selectedInstrument}&risk=${riskDollars}&target=${targetDollars}${
        isForceRefresh ? "&refresh=true" : ""
      }`;
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
  }, [selectedInstrument, riskDollars, targetDollars]);

  useEffect(() => {
    fetchBrief(false);
  }, [fetchBrief]);

  const handleProfileChange = (profileId: string) => {
    const found = profiles.find((p) => p.id === profileId);
    if (found) {
      setCurrentProfile(found);
      setRiskDollars(found.riskBudgetDollars);
      setTargetDollars(found.targetBudgetDollars);
      setSelectedInstrument(found.defaultInstrument);
    }
  };

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
        onSelectProfile={handleProfileChange}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Loading skeleton */}
        {loading && !brief && (
          <div className="space-y-6 animate-pulse">
            <div className="h-20 bg-slate-900 rounded-xl border border-slate-800" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-96 bg-slate-900 rounded-xl border border-slate-800" />
              <div className="h-96 bg-slate-900 rounded-xl border border-slate-800" />
            </div>
            <div className="h-96 bg-slate-900 rounded-xl border border-slate-800" />
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-200 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <div className="text-xs font-mono">
                <span className="font-bold">Error loading live market data:</span> {error}
              </div>
            </div>
            <button
              onClick={() => fetchBrief(true)}
              className="px-3 py-1 rounded bg-rose-900 text-rose-200 text-xs font-mono hover:bg-rose-800 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Render Dashboard content when brief is available */}
        {brief && (
          <>
            {/* Macro & Regime Strip */}
            <MacroRegimeStrip
              quote={brief.quote}
              vix={brief.macro.vix}
              us10y={brief.macro.us10y}
              dxy={brief.macro.dxy}
              megaCaps={brief.macro.megaCaps}
              events={brief.macro.events}
              dealerGammaTilt={brief.macro.dealerGammaTilt}
            />

            {/* Row 1: Bias Card + Stop Risk Card */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              <BiasCard bias={brief.bias} metrics={brief.sessionMetrics} />
              <StopRiskCard
                guidance={brief.riskGuidance}
                riskDollars={riskDollars}
                targetDollars={targetDollars}
                onChangeRisk={(val) => setRiskDollars(val)}
                onChangeTarget={(val) => setTargetDollars(val)}
                selectedInstrument={selectedInstrument}
                onSelectInstrument={(inst) => setSelectedInstrument(inst)}
              />
            </div>

            {/* Row 2: Key Levels Table + 9:30 AM Checklist */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2">
                <KeyLevelsTable
                  levels={brief.keyLevels}
                  currentPrice={brief.quote.price}
                />
              </div>

              <div className="lg:col-span-1">
                <ChecklistCard
                  tradeDate={brief.tradeDate}
                  userId={currentProfile?.id || "minsung"}
                />
              </div>
            </div>

            {/* Honest Data Source & Disclaimer Notice */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs font-mono text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  <strong>Data Feed:</strong> {brief.dataSource.providerName} • Status:{" "}
                  <span className="text-slate-200 font-bold">{brief.dataSource.quoteStatus}</span> • Last print:{" "}
                  {new Date(brief.dataSource.lastUpdated).toLocaleTimeString("en-US", {
                    timeZone: "America/New_York",
                    hour12: true,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                  })}{" "}
                  ET
                </span>
              </div>
              <span className="text-[11px] text-slate-500">
                1 Trade/Day Protocol • OpenPulse Decision Engine
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
