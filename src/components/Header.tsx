"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  RefreshCw,
  Activity,
  BookOpen,
  Settings,
  Pause,
  Play
} from "lucide-react";
import { DataStatus } from "@/types/market";
import { UserProfile } from "@/types/app";

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
  onSelectProfile
}: HeaderProps) {
  const pathname = usePathname();
  const [etTime, setEtTime] = useState<string>("");
  const [windowStatus, setWindowStatus] = useState<{
    isActive: boolean;
    label: string;
    description: string;
  }>({
    isActive: false,
    label: "PRE-MARKET",
    description: "Calculating session metrics"
  });

  // Real-time Eastern Time (ET) clock and 9:30-10:00 AM window tracker
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      setEtTime(timeStr);

      const etDateStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
      const etDate = new Date(etDateStr);
      const hours = etDate.getHours();
      const minutes = etDate.getMinutes();
      const seconds = etDate.getSeconds();
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;

      const openStartSeconds = 9 * 3600 + 30 * 60; // 9:30 AM ET
      const openEndSeconds = 10 * 3600; // 10:00 AM ET

      if (totalSeconds >= openStartSeconds && totalSeconds <= openEndSeconds) {
        const elapsedMins = Math.floor((totalSeconds - openStartSeconds) / 60);
        const elapsedSecs = (totalSeconds - openStartSeconds) % 60;
        setWindowStatus({
          isActive: true,
          label: "NY OPEN RETRACE WINDOW",
          description: `${elapsedMins}m ${elapsedSecs}s elapsed (9:30–10:00 AM ET)`
        });
      } else if (totalSeconds < openStartSeconds) {
        const remaining = openStartSeconds - totalSeconds;
        const remHours = Math.floor(remaining / 3600);
        const remMins = Math.floor((remaining % 3600) / 60);
        const remSecs = remaining % 60;
        setWindowStatus({
          isActive: false,
          label: "PRE-MARKET",
          description: `NY Open in ${remHours > 0 ? `${remHours}h ` : ""}${remMins}m ${remSecs}s`
        });
      } else {
        setWindowStatus({
          isActive: false,
          label: "POST-OPEN SESSION",
          description: "Regular trading hours active (1 trade limit)"
        });
      }
    }

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedLastUpdated = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    : null;

  return (
    <header className="border-b border-slate-800 bg-[#0b0f17] sticky top-0 z-50">
      {/* Top Session Window Banner */}
      <div
        className={`px-4 py-1.5 text-xs flex flex-wrap items-center justify-between border-b transition-colors ${
          windowStatus.isActive
            ? "bg-emerald-950/40 border-emerald-900/60 text-emerald-300"
            : "bg-slate-900/50 border-slate-800 text-slate-400"
        }`}
      >
        <div className="flex items-center space-x-2.5">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              windowStatus.isActive ? "bg-emerald-400" : "bg-cyan-500"
            }`}
          />
          <span className="font-semibold text-slate-200 text-xs">
            {windowStatus.label}
          </span>
          <span className="text-slate-400 text-[11px] font-mono tabular-nums">
            {windowStatus.description}
          </span>
        </div>

        {/* Dynamic Live Update Status Bar */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1.5 text-slate-400 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Updated:</span>
            <span className="text-slate-200 font-mono tabular-nums font-medium">
              {formattedLastUpdated ? `${formattedLastUpdated} ET` : "--:--:--"}
            </span>
            <span className="text-slate-500 font-mono tabular-nums">({secondsAgo}s ago)</span>
          </div>

          <span className="text-slate-700">|</span>

          {/* Auto Refresh Toggle */}
          <button
            onClick={onToggleAutoRefresh}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] transition-colors border ${
              isAutoRefreshOn
                ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
                : "bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400"
            }`}
            title="Toggle automatic 10-second polling"
          >
            {isAutoRefreshOn ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="font-mono tabular-nums">SYNC: {autoRefreshCountdown}s</span>
              </>
            ) : (
              <>
                <Pause className="w-2.5 h-2.5" />
                <span>PAUSED</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand & Market Clock */}
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-2.5 group">
            <div className="w-7 h-7 rounded border border-cyan-500/40 bg-slate-900 flex items-center justify-center text-cyan-400">
              <Activity className="w-4 h-4" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="font-semibold text-base tracking-tight text-white">OpenPulse</span>
              <span className="text-[10px] font-mono text-cyan-400/90 tracking-wide font-medium">
                CME NQ
              </span>
            </div>
          </Link>

          {/* Live ET Digital Clock */}
          <div className="hidden md:flex items-center space-x-2 px-2.5 py-1 rounded bg-slate-900/90 border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-500">ET:</span>
            <span className="text-xs font-mono tabular-nums font-semibold text-slate-200">
              {etTime || "--:--:-- ET"}
            </span>
          </div>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden sm:flex items-center space-x-1">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center space-x-1.5 ${
              pathname === "/"
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Playbook</span>
          </Link>

          <Link
            href="/journal"
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center space-x-1.5 ${
              pathname.startsWith("/journal")
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span>MAE / MFE Journal</span>
          </Link>

          <Link
            href="/settings"
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center space-x-1.5 ${
              pathname.startsWith("/settings")
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>Settings</span>
          </Link>
        </nav>

        {/* Right Utility Bar */}
        <div className="flex items-center space-x-2.5">
          {/* Instrument Toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
            <button
              onClick={() => onSelectInstrument("NQ")}
              className={`px-2 py-0.5 rounded text-xs font-mono font-medium transition-colors ${
                selectedInstrument === "NQ"
                  ? "bg-cyan-500 text-slate-950 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              NQ
            </button>
            <button
              onClick={() => onSelectInstrument("MNQ")}
              className={`px-2 py-0.5 rounded text-xs font-mono font-medium transition-colors ${
                selectedInstrument === "MNQ"
                  ? "bg-cyan-500 text-slate-950 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              MNQ
            </button>
          </div>

          {/* Profile Switcher */}
          {profiles.length > 0 && (
            <div className="hidden md:flex items-center">
              <select
                value={currentProfile?.id || "minsung"}
                onChange={(e) => onSelectProfile && onSelectProfile(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded px-2 py-1 font-sans focus:outline-none focus:border-slate-700"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (${p.riskBudgetDollars})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Feed Latency / Staleness Badge */}
          <span
            className={`hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${
              dataStatus === "LIVE"
                ? "bg-emerald-950/60 text-emerald-400 border-emerald-800"
                : "bg-amber-950/60 text-amber-300 border-amber-800/80"
            }`}
            title={
              dataStatus === "DELAYED"
                ? "CME Globex free retail feed has a standard 10–15m exchange delay. Connect broker/Polygon in Settings for 0-second live tick streaming."
                : "Real-time feed active."
            }
          >
            {dataStatus === "DELAYED" ? "DELAYED (10-15m CME)" : "LIVE"}
          </span>

          {/* Manual Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors disabled:opacity-50"
            title="Refresh market data now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
