"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  RefreshCw,
  Activity,
  ShieldCheck,
  TrendingUp,
  BookOpen,
  Settings,
  Share2,
  AlertTriangle,
  User
} from "lucide-react";
import { DataStatus } from "@/types/market";
import { UserProfile } from "@/types/app";

interface HeaderProps {
  lastUpdated?: string;
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
  dataStatus = "DELAYED",
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
      // Format time in ET
      const timeStr = now.toLocaleTimeString("en-US", {
        timeZone: "America/New_York",
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      setEtTime(timeStr);

      // Check hours/minutes in ET
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
          description: "Regular trading hours active (Review 1 Trade Rule)"
        });
      }
    }

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: DataStatus) => {
    switch (status) {
      case "LIVE":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "DELAYED":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "DERIVED":
        return "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
      case "SAMPLE":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <header className="border-b border-slate-800 bg-[#090d16]/90 backdrop-blur sticky top-0 z-50">
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
              windowStatus.isActive
                ? "bg-emerald-400 animate-ping"
                : "bg-cyan-400"
            }`}
          />
          <span className="font-semibold tracking-wider text-slate-200">
            {windowStatus.label}:
          </span>
          <span className="text-slate-300 font-mono">
            {windowStatus.description}
          </span>
        </div>

        <div className="flex items-center space-x-3 text-[11px] font-mono">
          <span className="text-slate-400">NY Open Strategy:</span>
          <span className="text-cyan-300 font-semibold">1 Trade/Day NQ Retrace</span>
          <span className="text-slate-600">|</span>
          <span className="text-emerald-400">Risk $200–$300 → Target $500–$600</span>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & ET Clock */}
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 p-0.5 shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-shadow">
              <div className="w-full h-full bg-[#090d16] rounded-[7px] flex items-center justify-center">
                <Activity className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">OpenPulse</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                  NQ OPEN
                </span>
              </div>
              <p className="text-[10px] text-slate-400 tracking-wide font-mono">
                HTF Continuation & Stop Risk
              </p>
            </div>
          </Link>

          {/* Live ET Digital Clock */}
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-md bg-slate-900/80 border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] text-slate-400 font-mono uppercase">ET:</span>
            <span className="text-sm font-mono font-bold text-white tracking-wider">
              {etTime || "--:--:-- ET"}
            </span>
          </div>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden lg:flex items-center space-x-1">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center space-x-1.5 ${
              pathname === "/"
                ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Open Playbook</span>
          </Link>

          <Link
            href="/journal"
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center space-x-1.5 ${
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
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center space-x-1.5 ${
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
        <div className="flex items-center space-x-3">
          {/* Instrument Toggle */}
          <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-xs font-mono">
            <button
              onClick={() => onSelectInstrument("NQ")}
              className={`px-2.5 py-1 rounded-md transition-all font-semibold ${
                selectedInstrument === "NQ"
                  ? "bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="E-mini Nasdaq 100 ($20/pt)"
            >
              NQ
            </button>
            <button
              onClick={() => onSelectInstrument("MNQ")}
              className={`px-2.5 py-1 rounded-md transition-all font-semibold ${
                selectedInstrument === "MNQ"
                  ? "bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Micro E-mini Nasdaq 100 ($2/pt - precision scaling)"
            >
              MNQ
            </button>
          </div>

          {/* Profile Switcher */}
          {profiles.length > 0 && (
            <div className="hidden sm:flex items-center">
              <select
                value={currentProfile?.id || "minsung"}
                onChange={(e) => onSelectProfile && onSelectProfile(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-cyan-500"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Provider & Staleness Badge */}
          <div className="flex items-center space-x-1.5">
            <div
              className={`px-2 py-1 rounded text-[11px] font-mono border flex items-center space-x-1.5 ${getStatusColor(
                dataStatus
              )}`}
              title={`Feed: ${providerName} (${dataStatus})`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              <span className="font-semibold">{dataStatus}</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-400 border border-slate-800 hover:border-slate-700 transition-colors disabled:opacity-50"
              title="Force refresh live market data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav Links */}
      <div className="lg:hidden px-4 py-2 bg-slate-900/60 border-t border-slate-800/60 flex items-center justify-around text-xs font-mono">
        <Link href="/" className={pathname === "/" ? "text-cyan-400 font-bold" : "text-slate-400"}>
          Playbook
        </Link>
        <Link href="/journal" className={pathname.startsWith("/journal") ? "text-amber-400 font-bold" : "text-slate-400"}>
          Journal
        </Link>
        <Link href="/settings" className={pathname.startsWith("/settings") ? "text-slate-200 font-bold" : "text-slate-400"}>
          Settings
        </Link>
      </div>
    </header>
  );
}
