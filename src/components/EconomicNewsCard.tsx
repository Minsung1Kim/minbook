"use client";

import React, { useState } from "react";
import { Folder, AlertTriangle, Clock, Calendar, ChevronDown, ChevronUp, Info } from "lucide-react";
import { EconomicEvent } from "@/types/market";
import { useTimezone } from "../context/TimezoneContext";

export function isEventPassed(
  dateStr: string | undefined,
  timeET: string | undefined,
  hasActual: boolean
): boolean {
  if (hasActual) return true;
  if (!dateStr || !timeET) return false;

  try {
    const now = new Date();
    const nowETParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(now);

    const curYear = parseInt(nowETParts.find((p) => p.type === "year")?.value || "0", 10);
    const curMonth = parseInt(nowETParts.find((p) => p.type === "month")?.value || "0", 10);
    const curDay = parseInt(nowETParts.find((p) => p.type === "day")?.value || "0", 10);
    const curHour = parseInt(nowETParts.find((p) => p.type === "hour")?.value || "0", 10);
    const curMin = parseInt(nowETParts.find((p) => p.type === "minute")?.value || "0", 10);

    const nowMinutes = (curYear * 10000 + curMonth * 100 + curDay) * 1440 + curHour * 60 + curMin;

    const [evYear, evMonth, evDay] = dateStr.split("-").map((s) => parseInt(s, 10));

    const match = timeET.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (!match) return false;
    let evHour = parseInt(match[1], 10);
    const evMin = parseInt(match[2], 10);
    const meridiem = match[3]?.toUpperCase();

    if (meridiem === "PM" && evHour < 12) evHour += 12;
    if (meridiem === "AM" && evHour === 12) evHour = 0;

    const evMinutes = (evYear * 10000 + evMonth * 100 + evDay) * 1440 + evHour * 60 + evMin;

    return nowMinutes >= evMinutes;
  } catch {
    return false;
  }
}

interface EconomicNewsCardProps {
  events: EconomicEvent[];
  tradeDate?: string;
}

export function EconomicNewsCard({ events, tradeDate }: EconomicNewsCardProps) {
  const { timezone, convertETTime, timezoneCode } = useTimezone();
  const [filter, setFilter] = useState<"ALL" | "RED_ONLY" | "TODAY">("ALL");
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const usEvents = events.filter(
    (e) => e.country === "USD" && (e.folderColor === "RED" || e.folderColor === "ORANGE")
  );

  const todayStr = tradeDate || new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  const filteredEvents = usEvents.filter((e) => {
    if (filter === "RED_ONLY") return e.folderColor === "RED";
    if (filter === "TODAY") return e.date === todayStr;
    return true;
  });

  const openWindowAlerts = usEvents.filter(
    (e) =>
      e.isNearOpenWindow &&
      (e.date === todayStr || !e.date) &&
      !isEventPassed(e.date, e.timeET, !!e.actual)
  );

  return (
    <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden font-sans">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[11px]">
          US Economic Calendar
        </span>

        {/* Filter Controls */}
        <div className="flex items-center space-x-1.5 text-[11px]">
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5">
            <button
              onClick={() => setFilter("ALL")}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                filter === "ALL"
                  ? "bg-zinc-700 text-zinc-100 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("TODAY")}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                filter === "TODAY"
                  ? "bg-zinc-700 text-zinc-100 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setFilter("RED_ONLY")}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                filter === "RED_ONLY"
                  ? "bg-rose-500/20 text-rose-300 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Red Only
            </button>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* NY Open Caution Alert */}
      {openWindowAlerts.length > 0 && (
        <div className="px-3.5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono text-[11px]">
            {openWindowAlerts.length} high-impact release near open window. Stand aside or wait for retrace.
          </span>
        </div>
      )}

      {/* Events List */}
      {isExpanded && (
        <div className="divide-y divide-zinc-800/60 max-h-[420px] overflow-y-auto">
          {filteredEvents.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500 font-mono">
              No matching economic events.
            </div>
          ) : (
            filteredEvents.map((evt) => {
              const isRed = evt.folderColor === "RED";
              const isPassed = isEventPassed(evt.date, evt.timeET, !!evt.actual);

              return (
                <div
                  key={evt.id}
                  className={`p-3 transition-colors ${
                    isPassed
                      ? "opacity-40 grayscale bg-zinc-950/40"
                      : isRed
                      ? "bg-rose-500/5 hover:bg-zinc-800/40"
                      : "hover:bg-zinc-800/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start space-x-2 min-w-0">
                      <Folder
                        className={`w-3.5 h-3.5 mt-0.5 shrink-0 fill-current ${
                          isPassed ? "text-zinc-600" : isRed ? "text-rose-400" : "text-amber-400"
                        }`}
                      />
                      <div className="min-w-0 space-y-0.5 font-mono">
                        <div className="flex items-center space-x-1.5 text-[11px]">
                          <span
                            className={`font-semibold tabular-nums ${
                              isPassed ? "text-zinc-500" : "text-zinc-200"
                            }`}
                          >
                            {convertETTime(evt.timeET, evt.date)}
                          </span>
                          <span className="text-zinc-600">|</span>
                          <span className="text-zinc-400 font-sans font-medium text-xs truncate">
                            {evt.event}
                          </span>
                        </div>

                        {/* Forecast / Prev / Actual */}
                        <div className="flex items-center space-x-3 text-[10px] text-zinc-500 tabular-nums">
                          {evt.forecast && <span>Frc: <strong className="text-zinc-300">{evt.forecast}</strong></span>}
                          {evt.previous && <span>Prv: <strong className="text-zinc-300">{evt.previous}</strong></span>}
                          {evt.actual && <span>Act: <strong className="text-zinc-100 font-bold">{evt.actual}</strong></span>}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold uppercase ${
                        isPassed
                          ? "bg-zinc-800 text-zinc-500"
                          : isRed
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {isPassed ? "Passed" : isRed ? "High" : "Med"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default EconomicNewsCard;
