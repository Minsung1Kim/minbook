"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import {
  Share2,
  Copy,
  Check,
  Calendar,
  Layers,
  Activity,
  Compass,
  Scale,
  Users,
  ExternalLink,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { SavedDailyBrief } from "@/types/app";
import { OpenBriefData } from "@/types/market";

export default function BriefsPage() {
  const [briefs, setBriefs] = useState<Array<{ id: string; tradeDate: string; symbol: string; verdict: string }>>([]);
  const [currentBrief, setCurrentBrief] = useState<OpenBriefData | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<string>("all");

  useEffect(() => {
    fetch("/api/briefs")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.briefs?.length > 0) {
          setBriefs(res.briefs);
          const latest = res.briefs[0].tradeDate;
          setSelectedDate(latest);
          loadBrief(latest);
        } else {
          // If no saved briefs, load today's market brief
          loadBrief();
        }
      })
      .catch(() => loadBrief());
  }, []);

  const loadBrief = (date?: string) => {
    setLoading(true);
    const url = date ? `/api/briefs?date=${date}` : "/api/market-data";
    fetch(url)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          const data = res.brief ? res.brief.data : res.data;
          setCurrentBrief(data);
          if (data?.tradeDate) setSelectedDate(data.tradeDate);
        }
      })
      .finally(() => setLoading(false));
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/briefs?date=${selectedDate}&friend=${selectedFriend}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyDiscordMemo = () => {
    if (!currentBrief) return;
    const memo = `
══════════════════════════════════════════════
⚡ **OPENPULSE PRE-MARKET BRIEFING • ${currentBrief.tradeDate}** ⚡
══════════════════════════════════════════════
• **Instrument:** ${currentBrief.instrument} (${currentBrief.underlyingAsset})
• **Current Market Price:** ${currentBrief.quote.price.toFixed(2)} (${currentBrief.quote.change >= 0 ? "+" : ""}${currentBrief.quote.change.toFixed(2)} pts)
• **NY Open Strategy:** 1 Trade/Day HTF Continuation Retrace (9:30–10:00 AM ET)

🎯 **BIAS & VERDICT:**
${currentBrief.bias.verdict} (${currentBrief.bias.confidence} Confidence)
"${currentBrief.bias.summary}"

🛡️ **STOP RISK & POSITION SIZING:**
• Risk Budget: $${currentBrief.riskGuidance.userRiskDollars} | Target: $${currentBrief.riskGuidance.userTargetDollars} (~${(currentBrief.riskGuidance.userTargetDollars / currentBrief.riskGuidance.userRiskDollars).toFixed(1)}R)
• 1 NQ Stop Buffer: ${currentBrief.riskGuidance.maxStopPointsNQ} pts
• Sizing Advice: ${currentBrief.riskGuidance.recommendedSizing.summary}

📍 **KEY REFERENCE LEVELS:**
• PDH: ${currentBrief.sessionMetrics.pdh.toFixed(2)}
• ONH: ${currentBrief.sessionMetrics.onh.toFixed(2)}
• VWAP: ${currentBrief.sessionMetrics.sessionVwap.toFixed(2)}
• ON Mid: ${currentBrief.sessionMetrics.onMid.toFixed(2)}
• PDC: ${currentBrief.sessionMetrics.pdc.toFixed(2)}
• ONL: ${currentBrief.sessionMetrics.onl.toFixed(2)}
• PDL: ${currentBrief.sessionMetrics.pdl.toFixed(2)}

⏳ **RETRACE ENTRY ZONE (9:34–9:50 AM ET):**
${currentBrief.bias.idealRetraceZone.startPrice.toFixed(2)} — ${currentBrief.bias.idealRetraceZone.endPrice.toFixed(2)}
_${currentBrief.bias.idealRetraceZone.description}_

⚠️ **RULE:** 1 Trade per day. Wait for the retrace. No revenge trading.
══════════════════════════════════════════════
    `.trim();

    navigator.clipboard.writeText(memo);
    setCopiedMemo(true);
    setTimeout(() => setCopiedMemo(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <Header
        lastUpdated={currentBrief?.dataSource.lastUpdated}
        dataStatus={currentBrief?.dataSource.quoteStatus}
        providerName={currentBrief?.dataSource.providerName}
        selectedInstrument={currentBrief?.instrument || "NQ"}
        onSelectInstrument={() => {}}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900/90 border border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <Share2 className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold tracking-tight text-white">
                Friends & Shared Morning Briefs
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Share the exact morning levels, bias verdict, and stop risk with your trading group.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyDiscordMemo}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-mono font-bold text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-600/20 transition-all"
            >
              {copiedMemo ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedMemo ? "Memo Copied!" : "Copy Discord / Telegram Memo"}</span>
            </button>

            <button
              onClick={copyShareLink}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs border border-slate-700 flex items-center space-x-1.5 transition-all"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-cyan-400" />}
              <span>{copiedLink ? "Link Copied!" : "Copy Share Link"}</span>
            </button>
          </div>
        </div>

        {/* Room / Friend Selector Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 text-xs font-mono">
          <span className="text-slate-400 flex items-center space-x-1 mr-2">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>Trading Group:</span>
          </span>
          {["all", "minsung", "alex", "jordan"].map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFriend(f)}
              className={`px-3 py-1 rounded-md transition-colors ${
                selectedFriend === f
                  ? "bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold"
                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {f === "all" ? "Group Master Brief" : f === "minsung" ? "Minsung (Me)" : f === "alex" ? "Alex (MNQ Focus)" : "Jordan (Prop 50k)"}
            </button>
          ))}
        </div>

        {/* Main Brief View */}
        {loading && (
          <div className="p-12 text-center font-mono text-slate-400 text-sm animate-pulse">
            Loading morning briefing snapshot...
          </div>
        )}

        {!loading && currentBrief && (
          <div className="space-y-6">
            {/* Top Snapshot Summary Card */}
            <div className="p-6 rounded-xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                  <div>
                    <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                      Trading Date: {currentBrief.tradeDate}
                    </span>
                    <h2 className="text-xl sm:text-2xl font-mono font-bold text-white">
                      {currentBrief.quote.displaySymbol} @ {currentBrief.quote.price.toFixed(2)}
                    </h2>
                  </div>
                </div>

                <div className="px-3 py-1 rounded-md bg-slate-950 border border-slate-800 font-mono text-xs">
                  <span className="text-slate-400">Verdict: </span>
                  <strong className="text-emerald-400">{currentBrief.bias.verdict}</strong>
                </div>
              </div>

              {/* Plain English Verdict & Plan */}
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800/80 font-mono space-y-2">
                <span className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider block">
                  Today's Single Trade Plan (9:30–10:00 AM ET):
                </span>
                <p className="text-sm text-slate-200 leading-relaxed">
                  {currentBrief.bias.summary}
                </p>
                <div className="text-xs text-slate-400 pt-2 border-t border-slate-800/60">
                  Target Retrace Zone:{" "}
                  <strong className="text-white">
                    {currentBrief.bias.idealRetraceZone.startPrice.toFixed(2)} — {currentBrief.bias.idealRetraceZone.endPrice.toFixed(2)}
                  </strong>{" "}
                  ({currentBrief.bias.idealRetraceZone.description})
                </div>
              </div>

              {/* Sizing & Risk Guidance */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-xs font-mono space-y-2">
                  <span className="text-slate-400 font-semibold flex items-center space-x-1">
                    <Scale className="w-3.5 h-3.5 text-amber-400" />
                    <span>Risk & Invalidation Budget</span>
                  </span>
                  <div className="text-white">
                    Risk Budget: <strong>${currentBrief.riskGuidance.userRiskDollars}</strong> → Target:{" "}
                    <strong>${currentBrief.riskGuidance.userTargetDollars}</strong>
                  </div>
                  <div className="text-slate-400">
                    Max Stop Distance (1 NQ):{" "}
                    <strong className="text-cyan-400">
                      {currentBrief.riskGuidance.maxStopPointsNQ} pts
                    </strong>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-xs font-mono space-y-2">
                  <span className="text-slate-400 font-semibold flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Recommended Execution Sizing</span>
                  </span>
                  <p className="text-emerald-300">
                    {currentBrief.riskGuidance.recommendedSizing.summary}
                  </p>
                </div>
              </div>

              {/* Key Reference Levels Grid */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block">
                  Reference Levels for Today's Session:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-xs font-mono">
                  {[
                    { name: "PDH", val: currentBrief.sessionMetrics.pdh },
                    { name: "ONH", val: currentBrief.sessionMetrics.onh },
                    { name: "VWAP", val: currentBrief.sessionMetrics.sessionVwap },
                    { name: "ON Mid", val: currentBrief.sessionMetrics.onMid },
                    { name: "PDC", val: currentBrief.sessionMetrics.pdc },
                    { name: "ONL", val: currentBrief.sessionMetrics.onl },
                    { name: "PDL", val: currentBrief.sessionMetrics.pdl }
                  ].map((l) => (
                    <div
                      key={l.name}
                      className="p-2.5 rounded bg-slate-950 border border-slate-800 text-center"
                    >
                      <div className="text-slate-400 text-[10px] font-semibold">{l.name}</div>
                      <div className="text-white font-bold text-sm mt-0.5">{l.val.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Historical Briefs Archive */}
            {briefs.length > 0 && (
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Recent Daily Briefs Archive:</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs font-mono">
                  {briefs.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        setSelectedDate(b.tradeDate);
                        loadBrief(b.tradeDate);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-colors ${
                        selectedDate === b.tradeDate
                          ? "bg-cyan-950/40 border-cyan-700 text-cyan-200"
                          : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-bold">{b.tradeDate} ({b.symbol})</div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{b.verdict}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
