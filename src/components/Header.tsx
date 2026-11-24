"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RefreshCw, Activity, BookOpen, Target, Clock, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { DataStatus } from "@/types/market";
import { UserProfile } from "@/types/app";
import { getCMESessionInfo, CMESessionInfo } from "@/lib/market/sessionClock";
import { useTimezone } from "@/context/TimezoneContext";
import { SupportedTimezone } from "@/lib/market/timezone";
import { createClient } from "@/lib/supabase/client";

interface HeaderProps {
  lastUpdated?: string;
  secondsAgo?: number;
  autoRefreshCountdown?: number;
  isAutoRefreshOn?: boolean;
  onToggleAutoRefresh?: () => void;
  dataStatus?: DataStatus;
  providerName?: string;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  selectedInstrument: "NQ" | "MNQ";
  onSelectInstrument: (inst: "NQ" | "MNQ") => void;
  currentProfile?: UserProfile | null;
  profiles?: UserProfile[];
  onSelectProfile?: (profileId: string) => void;
}

export function Header({
  lastUpdated,
  secondsAgo = 0,
  autoRefreshCountdown = 10,
  isAutoRefreshOn = true,
  onToggleAutoRefresh,
  dataStatus = "LIVE",
  providerName = "Yahoo Finance",
  isRefreshing = false,
  onRefresh,
  selectedInstrument,
  onSelectInstrument,
  currentProfile,
  profiles = [],
  onSelectProfile,
}: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { timezone, setTimezone, timezoneCode, config } = useTimezone();
  const [currentTime, setCurrentTime] = useState<string>("");
  const [sessionInfo, setSessionInfo] = useState<CMESessionInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<{ email?: string } | null>(null);

  const handleSignOut = async () => {
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    try {
      await fetch("/auth/signout", { method: "POST" });
    } catch {}
    router.push("/login");
    router.refresh();
  };

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setCurrentUser(data.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user || null);
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        timeZone: timezone,
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setCurrentTime(timeStr);
      setSessionInfo(getCMESessionInfo(now, timezone));
    }

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  const isWindowActive = sessionInfo?.isWindowActive ?? false;

  return (
    <>
      <header className="sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 transition-colors">
        <div className="max-w-[1640px] mx-auto px-3 sm:px-5 lg:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Wordmark & Clean Nav */}
          <div className="flex items-center space-x-6 shrink-0">
            <Link href="/" className="flex items-center space-x-2 group">
              <span className="font-semibold text-sm tracking-tight text-zinc-100 group-hover:text-white transition-colors">
                MinBook
              </span>
              <span className="text-[11px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                NQ
              </span>
            </Link>

            {/* Clean 4-Tab Nav (Desktop) */}
            <nav className="hidden sm:flex items-center space-x-1">
              <Link
                href="/"
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  pathname === "/"
                    ? "bg-zinc-800/90 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                Brief
              </Link>

              <Link
                href="/journal"
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  pathname.startsWith("/journal")
                    ? "bg-zinc-800/90 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                P&amp;L Journal
              </Link>

              <Link
                href="/performance"
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  pathname.startsWith("/performance")
                    ? "bg-zinc-800/90 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                Audit
              </Link>

              <Link
                href="/calendar"
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  pathname.startsWith("/calendar")
                    ? "bg-zinc-800/90 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                News Calendar
              </Link>
            </nav>
          </div>

          {/* Right: Instrument, Timezone, Target Session Pill, Countdown, Latency Dot, Refresh */}
          <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
            {/* Instrument Toggle: NQ | MNQ */}
            <div className="hidden sm:flex items-center p-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono">
              <button
                onClick={() => onSelectInstrument("NQ")}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  selectedInstrument === "NQ"
                    ? "bg-zinc-700 text-zinc-100 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                NQ
              </button>
              <button
                onClick={() => onSelectInstrument("MNQ")}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  selectedInstrument === "MNQ"
                    ? "bg-zinc-700 text-zinc-100 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                MNQ
              </button>
            </div>

            {/* Timezone Switcher: ET | CT | PT */}
            <div className="hidden md:flex items-center p-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono">
              <button
                onClick={() => setTimezone("America/New_York")}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  timezone === "America/New_York"
                    ? "bg-zinc-700 text-zinc-100 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="US Eastern (ET)"
              >
                ET
              </button>
              <button
                onClick={() => setTimezone("America/Chicago")}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  timezone === "America/Chicago"
                    ? "bg-zinc-700 text-zinc-100 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="US Central (CT)"
              >
                CT
              </button>
              <button
                onClick={() => setTimezone("America/Los_Angeles")}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  timezone === "America/Los_Angeles"
                    ? "bg-zinc-700 text-zinc-100 font-bold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
                title="US West / Pacific (PT)"
              >
                PT
              </button>
            </div>

            {/* Active Session Pill */}
            <div
              className="hidden lg:flex items-center px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300"
              title={sessionInfo?.activeSessionWindowHuman || "CME Futures 24/5 Session"}
            >
              <span>
                {sessionInfo
                  ? `${sessionInfo.isMarketOpen ? "LIVE" : sessionInfo.activeSession === "WEEKEND" ? "CLOSED" : "BREAK"} • ${sessionInfo.activeSessionLabel}`
                  : "CME FUTURES"}
              </span>
            </div>

            {/* Live Countdown & Session Indicator */}
            <div className="flex items-center space-x-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 font-mono text-[11px] tabular-nums text-zinc-300">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  sessionInfo?.activeSession === "NY_AM" ||
                  sessionInfo?.activeSession === "NY_PM" ||
                  sessionInfo?.activeSession === "LONDON" ||
                  sessionInfo?.activeSession === "ASIA"
                    ? "bg-emerald-400 animate-pulse"
                    : sessionInfo?.isMarketOpen
                    ? "bg-amber-400"
                    : "bg-zinc-500"
                }`}
              />
              <span className="lg:hidden font-semibold text-zinc-200">
                {sessionInfo?.activeSession?.replace("_", " ") || "--"} ·
              </span>
              <span className="font-medium">{sessionInfo?.activeSessionCountdown || "--"}</span>
            </div>

            {/* Subtle Data-Latency Dot */}
            <div
              className="flex items-center space-x-1.5 text-[11px] font-mono text-zinc-400 pl-1"
              title={
                dataStatus === "DELAYED"
                  ? "Delayed free exchange feed (10–15m delay per CME rules)."
                  : "Real-time feed active."
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  dataStatus === "LIVE" ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span className="hidden sm:inline">
                {dataStatus === "LIVE" ? "Live" : "15m Delayed"}
              </span>
            </div>

            {/* Quiet Icon-Only Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors disabled:opacity-50"
              title="Refresh market data"
              aria-label="Refresh data"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-zinc-200" : ""}`}
              />
            </button>

            {/* Auth Controls */}
            {currentUser ? (
              <div className="flex items-center space-x-1.5 pl-2 border-l border-zinc-800">
                <span
                  className="hidden xl:inline text-[11px] font-mono text-zinc-400 truncate max-w-[120px]"
                  title={currentUser.email}
                >
                  {currentUser.email?.split("@")[0]}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center space-x-1"
                  title="Sign Out"
                >
                  <LogOut className="w-3 h-3" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center pl-2 border-l border-zinc-800">
                <Link
                  href="/login"
                  className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center space-x-1"
                  title="Sign In"
                >
                  <LogIn className="w-3 h-3" />
                  <span className="hidden sm:inline">Sign In</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile / Small-Tablet Quick Control Bar (< md) so NQ/MNQ & Timezone are always reachable */}
        <div className="md:hidden border-t border-zinc-800/60 bg-zinc-950/95 px-3 sm:px-5 py-1.5 flex items-center justify-between gap-2 text-[11px] font-mono">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span className="text-zinc-400 truncate">
              {sessionInfo
                ? `${sessionInfo.isMarketOpen ? "LIVE" : sessionInfo.activeSession === "WEEKEND" ? "CLOSED" : "BREAK"} • ${sessionInfo.activeSessionLabel}`
                : "CME FUTURES"}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <div className="flex sm:hidden items-center p-0.5 rounded bg-zinc-900 border border-zinc-800">
              <button
                onClick={() => onSelectInstrument("NQ")}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  selectedInstrument === "NQ"
                    ? "bg-zinc-700 text-zinc-100 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                NQ
              </button>
              <button
                onClick={() => onSelectInstrument("MNQ")}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  selectedInstrument === "MNQ"
                    ? "bg-zinc-700 text-zinc-100 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                MNQ
              </button>
            </div>

            <div className="flex items-center p-0.5 rounded bg-zinc-900 border border-zinc-800">
              {(["America/New_York", "America/Chicago", "America/Los_Angeles"] as SupportedTimezone[]).map((tzOption) => {
                const code = tzOption === "America/New_York" ? "ET" : tzOption === "America/Chicago" ? "CT" : "PT";
                return (
                  <button
                    key={tzOption}
                    onClick={() => setTimezone(tzOption)}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                      timezone === tzOption
                        ? "bg-zinc-700 text-zinc-100 font-bold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (< sm) - Placed outside <header> so position:fixed binds to viewport */}
      <nav
        aria-label="Mobile Navigation"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 h-14 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 px-3 flex items-center justify-around shadow-2xl safe-area-bottom"
      >
        <Link
          href="/"
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded transition-colors ${
            pathname === "/"
              ? "text-zinc-100 font-semibold"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Activity className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] tracking-tight">Brief</span>
        </Link>

        <Link
          href="/journal"
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded transition-colors ${
            pathname.startsWith("/journal")
              ? "text-zinc-100 font-semibold"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <BookOpen className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] tracking-tight">Journal</span>
        </Link>

        <Link
          href="/performance"
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded transition-colors ${
            pathname.startsWith("/performance")
              ? "text-zinc-100 font-semibold"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Target className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] tracking-tight">Audit</span>
        </Link>

        <Link
          href="/calendar"
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded transition-colors ${
            pathname.startsWith("/calendar")
              ? "text-zinc-100 font-semibold"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Clock className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] tracking-tight">News</span>
        </Link>
      </nav>
    </>
  );
}
