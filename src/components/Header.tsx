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
  Play,
  Pause
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
          label: "ACTIVE NY OPEN RETRACE WINDOW",
          description: `${elapsedMins}m ${elapsedSecs}s into 9:30–10:00 AM window (1 Trade/Day)`
        });
      } else if (totalSeconds < openStartSeconds) {
        const remaining = openStartSeconds - totalSeconds;
        const remHours = Math.floor(remaining / 3600);
        const remMins = Math.floor((remaining % 3600) / 60);
        const remSecs = remaining % 60;
        setWindowStatus({
          isActive: false,
          label: "PRE-MARKET BRIEFING",
          description: `9:30 AM NY Open in ${remHours > 0 ? `${remHours}h ` : ""}${remMins}m ${remSecs}s`
        });
      } else {
        setWindowStatus({
          isActive: false,
          label: "POST-OPEN SESSION",
          description: "Regular trading hours active (1 Trade Rule)"
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
    <header className="border-b border-slate-800 bg-[#090d16]/95 backdrop-blur sticky top-0 z-50">
      {/* Top Banner: NY Open Retrace Window Tracker */}
      <div
        className={`px-4 py-1.5 text-xs flex flex-wrap items-center justify-between border-b transition-colors ${
          windowStatus.isActive
            ? "bg-emerald-950/60 border-emerald-800 text-emerald-200 animate-open-window-pulse"
            : "bg-slate-900/40 border-slate-800/80 text-slate-400"
        }`}
      >
        <div className="flex items-center space-x-2">
          <span
            className={`w-2 h-2 rounded-full ${
              windowStatus.isActive ? "bg-emerald-400 animate-ping" : "bg-cyan-400"
            }`}
          />
          <span className="font-semibold tracking-wider text-slate-200 font-mono">
            {windowStatus.label}:
          </span>
          <span className="text-slate-300 font-mono">{windowStatus.description}</span>
        </div>

        {/* Dynamic Live Update Status Bar */}
        <div className="flex items-center space-x-3 text-[11px] font-mono">
          <div className="flex items-center space-x-1.5 text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400">Updated:</span>
            <strong className="text-white">{formattedLastUpdated ? `${formattedLastUpdated} ET` : "--:--:--"}</strong>
            <span className="text-cyan-300">({secondsAgo}s ago)</span>
          </div>

          <span className="text-slate-600">|</span>

          {/* Auto Refresh Status Pill */}
          <button
            onClick={onToggleAutoRefresh}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
              isAutoRefreshOn
                ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800"
                : "bg-slate-800 text-slate-400 border border-slate-700"
            }`}
            title="Toggle live auto-refresh timer"
          >
            {isAutoRefreshOn ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>SYNC IN {autoRefreshCountdown}s</span>
              </>
            ) : (
              <>
                <Pause className="w-2.5 h-2.5" />
                <span>SYNC PAUSED</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-15 flex items-center justify-between">
        {/* Brand & ET Clock */}
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 p-0.5 shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-[#090d16] rounded-[6px] flex items-center justify-center">
                <Activity className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-tight text-white">OpenPulse</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                  LIVE NQ
                </span>
              </div>
            </div>
          </Link>

          {/* Live ET Digital Clock */}
          <div className="hidden md:flex items-center space-x-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] text-slate-400 font-mono">ET:</span>
            <span className="text-xs font-mono font-bold text-white tracking-wider">
              {etTime || "--:--:-- ET"}
            </span>
          </div>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden sm:flex items-center space-x-1 font-mono">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
              pathname === "/"
                ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Playbook</span>
          </Link>

          <Link
            href="/journal"
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
              pathname.startsWith("/journal")
                ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>MAE / MFE Journal</span>
          </Link>

          <Link
            href="/settings"
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
              pathname.startsWith("/settings")
                ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>Settings</span>
          </Link>
        </nav>

        {/* Right Controls: Instrument, Profile, Provider Status, Refresh */}
        <div className="flex items-center space-x-2.5">
          {/* Instrument Toggle */}
          <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-xs font-mono">
            <button
              onClick={() => onSelectInstrument("NQ")}
              className={`px-2.5 py-1 rounded-md transition-all font-bold ${
                selectedInstrument === "NQ"
                  ? "bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              NQ
            </button>
            <button
              onClick={() => onSelectInstrument("MNQ")}
              className={`px-2.5 py-1 rounded-md transition-all font-bold ${
                selectedInstrument === "MNQ"
                  ? "bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20"
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
                className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-md px-2 py-1 font-mono focus:outline-none focus:border-cyan-500"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Manual Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-400 border border-slate-800 hover:border-slate-700 transition-colors disabled:opacity-50 flex items-center space-x-1"
            title="Force refresh live market data immediately"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
