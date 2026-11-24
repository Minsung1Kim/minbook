"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/Header";
import { useTimezone } from "@/context/TimezoneContext";
import { EconomicEvent } from "@/types/market";
import { isEventPassed } from "@/components/EconomicNewsCard";
import {
  Calendar,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  ExternalLink,
  ShieldAlert,
  Zap,
  CheckCircle2
} from "lucide-react";

export default function CalendarPage() {
  const { timezone, convertETTime, timezoneCode } = useTimezone();
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [timeFilter, setTimeFilter] = useState<"ALL" | "TODAY" | "UPCOMING">("TODAY");
  const [impactFilter, setImpactFilter] = useState<"ALL" | "RED_ONLY" | "RED_ORANGE">("RED_ORANGE");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const todayStr = useMemo(() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  }, []);

  const fetchCalendar = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/calendar");
      const json = await res.json();
      if (json.success && json.data?.events) {
        setEvents(json.data.events);
        setLastUpdated(
          new Date().toLocaleTimeString("en-US", {
            timeZone: timezone,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          })
        );
      }
    } catch (e) {
      console.error("Failed to fetch economic calendar:", e);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
    const interval = setInterval(() => fetchCalendar(), 60000); // 1-minute auto poll
    return () => clearInterval(interval);
  }, []);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      // Impact Filter
      if (impactFilter === "RED_ONLY" && e.folderColor !== "RED") return false;
      if (impactFilter === "RED_ORANGE" && e.folderColor !== "RED" && e.folderColor !== "ORANGE") return false;

      // Time Filter
      const passed = isEventPassed(e.date, e.timeET, !!e.actual);
      if (timeFilter === "TODAY" && e.date !== todayStr) return false;
      if (timeFilter === "UPCOMING" && passed) return false;

      return true;
    });
  }, [events, impactFilter, timeFilter, todayStr]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    filteredEvents.forEach((ev) => {
      const d = ev.date || "Unknown";
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(ev);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEvents]);

  // Next upcoming high/medium impact event
  const nextEvent = useMemo(() => {
    const upcoming = events.filter((e) => {
      if (e.country !== "USD") return false;
      if (e.folderColor !== "RED" && e.folderColor !== "ORANGE") return false;
      return !isEventPassed(e.date, e.timeET, !!e.actual);
    });
    return upcoming.length > 0 ? upcoming[0] : null;
  }, [events]);

  // Red Folder alert during NY Open window (09:15-10:15 ET)
  const openAlerts = useMemo(() => {
    return events.filter(
      (e) =>
        e.isNearOpenWindow &&
        (e.date === todayStr || !e.date) &&
        !isEventPassed(e.date, e.timeET, !!e.actual)
    );
  }, [events, todayStr]);

  const formatDateHeader = (dateStr: string) => {
    if (dateStr === todayStr) {
      const dt = new Date(`${dateStr}T12:00:00Z`);
      const formatted = dt.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric"
      });
      return `TODAY — ${formatted.toUpperCase()}`;
    }
    try {
      const dt = new Date(`${dateStr}T12:00:00Z`);
      return dt.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric"
      }).toUpperCase();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Header selectedInstrument="NQ" onSelectInstrument={() => {}} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Top Macro Telemetry Bar */}
        <div className="p-4 rounded-lg bg-zinc-900/70 border border-zinc-800/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-base text-zinc-100 tracking-tight">
                  Economic Calendar
                </span>
                <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  Forex Factory Engine
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {timezoneCode} Synchronized
                </span>
              </div>
              <p className="text-xs text-zinc-400 max-w-2xl">
                High-impact US macroeconomic catalysts filtered and localized for NQ/MNQ futures day traders.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => fetchCalendar(true)}
                disabled={refreshing}
                className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-mono flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                title="Refresh calendar data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-zinc-300" : ""}`} />
                <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
              </button>
            </div>
          </div>

          {/* Alert & Next Milestone Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {/* 1. Next Release */}
            <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800 flex items-center justify-between gap-2 text-xs font-mono">
              <div className="space-y-0.5 min-w-0">
                <span className="text-zinc-500 text-[11px] uppercase tracking-wider flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-zinc-400" />
                  <span>Next Catalyst</span>
                </span>
                {nextEvent ? (
                  <div className="truncate text-zinc-200 font-semibold text-xs">
                    {nextEvent.event}
                  </div>
                ) : (
                  <div className="text-zinc-400 text-xs">All scheduled releases completed</div>
                )}
              </div>
              {nextEvent && (
                <div className="text-right shrink-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${
                      nextEvent.folderColor === "RED"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {convertETTime(nextEvent.timeET)} {timezoneCode}
                  </span>
                </div>
              )}
            </div>

            {/* 2. NY Open Window Risk (09:15–10:15) */}
            <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800 flex items-center justify-between gap-2 text-xs font-mono">
              <div className="space-y-0.5 min-w-0">
                <span className="text-zinc-500 text-[11px] uppercase tracking-wider flex items-center space-x-1">
                  <ShieldAlert className="w-3 h-3 text-amber-400" />
                  <span>Open Window Risk (09:30–10:00)</span>
                </span>
                <div className="truncate text-xs">
                  {openAlerts.length > 0 ? (
                    <span className="text-amber-400 font-bold">
                      {openAlerts.length} release(s) scheduled near open
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-medium flex items-center space-x-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Window clear of red folders</span>
                    </span>
                  )}
                </div>
              </div>
              {openAlerts.length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                  SLIPPAGE RISK
                </span>
              )}
            </div>

            {/* 3. Feed Status */}
            <div className="p-2.5 rounded bg-zinc-950/70 border border-zinc-800 flex items-center justify-between gap-2 text-xs font-mono">
              <div className="space-y-0.5">
                <span className="text-zinc-500 text-[11px] uppercase tracking-wider">Feed Verification</span>
                <div className="text-zinc-300 font-medium text-xs">Forex Factory Live Feed</div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-zinc-500">
                  {lastUpdated ? `Sync ${lastUpdated}` : "Connecting..."}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="px-4 py-2.5 rounded-lg bg-zinc-900/70 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center space-x-3">
            {/* Time Filter */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-[11px]">
              <button
                onClick={() => setTimeFilter("TODAY")}
                className={`px-2 py-0.5 rounded transition-colors ${
                  timeFilter === "TODAY"
                    ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Today Only
              </button>
              <button
                onClick={() => setTimeFilter("UPCOMING")}
                className={`px-2 py-0.5 rounded transition-colors ${
                  timeFilter === "UPCOMING"
                    ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Upcoming
              </button>
              <button
                onClick={() => setTimeFilter("ALL")}
                className={`px-2 py-0.5 rounded transition-colors ${
                  timeFilter === "ALL"
                    ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                This Week
              </button>
            </div>

            {/* Impact Filter */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 text-[11px]">
              <button
                onClick={() => setImpactFilter("RED_ORANGE")}
                className={`px-2 py-0.5 rounded transition-colors ${
                  impactFilter === "RED_ORANGE"
                    ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                High & Med
              </button>
              <button
                onClick={() => setImpactFilter("RED_ONLY")}
                className={`px-2 py-0.5 rounded transition-colors flex items-center space-x-1 ${
                  impactFilter === "RED_ONLY"
                    ? "bg-zinc-800 text-rose-400 font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span>Red Only</span>
              </button>
              <button
                onClick={() => setImpactFilter("ALL")}
                className={`px-2 py-0.5 rounded transition-colors ${
                  impactFilter === "ALL"
                    ? "bg-zinc-800 text-zinc-100 font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All
              </button>
            </div>
          </div>

          <div className="text-[11px] text-zinc-500">
            Showing {filteredEvents.length} events • Timezone:{" "}
            <strong className="text-zinc-300">{timezoneCode}</strong>
          </div>
        </div>

        {/* Schedule Table Grouped By Day */}
        {loading ? (
          <div className="py-20 text-center space-y-2 text-zinc-500 font-mono text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-zinc-400" />
            <p>Loading Forex Factory economic releases...</p>
          </div>
        ) : groupedEvents.length === 0 ? (
          <div className="py-16 text-center rounded-lg bg-zinc-900/40 border border-zinc-800 text-zinc-400 text-xs font-mono space-y-1">
            <p className="font-semibold text-zinc-300">No economic events match the active filters.</p>
            <p className="text-zinc-500">Try switching to &quot;This Week&quot; or selecting &quot;All Impacts&quot;.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedEvents.map(([dateKey, dayEvents]) => (
              <div
                key={dateKey}
                className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden"
              >
                {/* Date Header Strip */}
                <div className="px-4 py-2 border-b border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-zinc-200 text-[11px] tracking-wider">
                    {formatDateHeader(dateKey)}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {dayEvents.length} {dayEvents.length === 1 ? "release" : "releases"}
                  </span>
                </div>

                {/* Events Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-zinc-950/40 text-zinc-500 text-[11px] uppercase tracking-wider border-b border-zinc-800/60">
                      <tr>
                        <th className="py-2 px-3 w-28">Time ({timezoneCode})</th>
                        <th className="py-2 px-2.5 w-24">Impact</th>
                        <th className="py-2 px-2 w-16">Cur</th>
                        <th className="py-2 px-3">Economic Event</th>
                        <th className="py-2 px-3 text-right w-24">Actual</th>
                        <th className="py-2 px-3 text-right w-24">Forecast</th>
                        <th className="py-2 px-3 text-right w-24">Previous</th>
                        <th className="py-2 px-2.5 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 tabular-nums">
                      {dayEvents.map((ev) => {
                        const passed = isEventPassed(ev.date, ev.timeET, !!ev.actual);
                        const isExpanded = expandedEventId === ev.id;
                        const isRed = ev.folderColor === "RED";
                        const isOrange = ev.folderColor === "ORANGE";
                        const localTime = convertETTime(ev.timeET);

                        // Compare actual vs forecast
                        const hasActual = Boolean(ev.actual && ev.actual !== "-");
                        const hasForecast = Boolean(ev.forecast && ev.forecast !== "-");

                        return (
                          <React.Fragment key={ev.id}>
                            <tr
                              onClick={() =>
                                setExpandedEventId(isExpanded ? null : ev.id)
                              }
                              className={`hover:bg-zinc-800/40 transition-colors cursor-pointer group ${
                                passed ? "opacity-50 bg-zinc-950/20" : ""
                              } ${ev.isNearOpenWindow && !passed ? "bg-amber-500/5" : ""}`}
                            >
                              {/* Time */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span
                                  className={`font-semibold ${
                                    passed
                                      ? "text-zinc-500 line-through"
                                      : ev.isNearOpenWindow
                                      ? "text-amber-400 font-bold"
                                      : "text-zinc-200"
                                  }`}
                                >
                                  {localTime}
                                </span>
                              </td>

                              {/* Impact Badge */}
                              <td className="py-2.5 px-2.5 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold border ${
                                    isRed
                                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                      : isOrange
                                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                      : "bg-zinc-800 text-zinc-400 border-zinc-700"
                                  }`}
                                >
                                  {isRed ? "HIGH" : isOrange ? "MED" : "LOW"}
                                </span>
                              </td>

                              {/* Country */}
                              <td className="py-2.5 px-2 text-zinc-400 font-medium">
                                {ev.country}
                              </td>

                              {/* Event Name */}
                              <td className="py-2.5 px-3">
                                <div className="flex items-center space-x-2">
                                  <span
                                    className={`font-medium ${
                                      passed ? "text-zinc-400" : "text-zinc-100"
                                    }`}
                                  >
                                    {ev.event}
                                  </span>
                                  {ev.isNearOpenWindow && (
                                    <span className="text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                      Open Window
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Actual */}
                              <td className="py-2.5 px-3 text-right">
                                {ev.actual ? (
                                  <span className="font-bold text-zinc-100">
                                    {ev.actual}
                                  </span>
                                ) : (
                                  <span className="text-zinc-600">—</span>
                                )}
                              </td>

                              {/* Forecast */}
                              <td className="py-2.5 px-3 text-right text-zinc-300">
                                {ev.forecast || "—"}
                              </td>

                              {/* Previous */}
                              <td className="py-2.5 px-3 text-right text-zinc-500">
                                {ev.previous || "—"}
                              </td>

                              {/* Expand Toggle */}
                              <td className="py-2.5 px-2.5 text-center text-zinc-500 group-hover:text-zinc-300">
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5 mx-auto" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 mx-auto" />
                                )}
                              </td>
                            </tr>

                            {/* Expanded Details Row */}
                            {isExpanded && (
                              <tr className="bg-zinc-950/60 border-t border-zinc-800/40">
                                <td colSpan={8} className="p-3.5 space-y-2">
                                  <div className="p-3 rounded bg-zinc-900 border border-zinc-800 space-y-1.5 text-xs font-sans">
                                    <div className="flex items-center space-x-1.5 text-zinc-300 font-mono text-[11px] uppercase tracking-wider">
                                      <Zap className="w-3 h-3 text-amber-400" />
                                      <span className="font-bold text-zinc-200">
                                        Futures Market Impact & Mechanics:
                                      </span>
                                    </div>
                                    <p className="text-zinc-300 leading-relaxed text-xs">
                                      {ev.marketImpact || ev.notes || "High-impact catalyst. Expect algorithmic spread widening and stop-run probes around release time."}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
