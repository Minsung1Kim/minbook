"use client";

import React, { useState } from "react";
import {
  Folder,
  AlertTriangle,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
  Info
} from "lucide-react";
import { EconomicEvent } from "@/types/market";

interface EconomicNewsCardProps {
  events: EconomicEvent[];
  tradeDate?: string;
}

export function EconomicNewsCard({ events, tradeDate }: EconomicNewsCardProps) {
  const [filter, setFilter] = useState<"ALL" | "RED_ONLY" | "TODAY">("ALL");
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Filter only US events and Red/Orange folders
  const usEvents = events.filter(
    (e) => e.country === "USD" && (e.folderColor === "RED" || e.folderColor === "ORANGE")
  );

  const todayStr = tradeDate || new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  const filteredEvents = usEvents.filter((e) => {
    if (filter === "RED_ONLY") return e.folderColor === "RED";
    if (filter === "TODAY") return e.date === todayStr;
    return true;
  });

  // Check if any event is scheduled near 9:30–10:00 AM NY Open window
  const openWindowAlerts = usEvents.filter((e) => e.isNearOpenWindow && (e.date === todayStr || !e.date));

  return (
    <div className="rounded-lg bg-[#0f1624] border border-slate-800 overflow-hidden font-sans">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <Calendar className="w-4 h-4 text-slate-400" />
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-semibold tracking-tight text-white">
                US Economic Calendar
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                (Red & Orange Folders)
              </span>
            </div>
          </div>
        </div>

        {/* Filter Controls & Collapse Toggle */}
        <div className="flex items-center space-x-2 text-xs">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
            <button
              onClick={() => setFilter("ALL")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                filter === "ALL"
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All US ({usEvents.length})
            </button>
            <button
              onClick={() => setFilter("TODAY")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                filter === "TODAY"
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setFilter("RED_ONLY")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center space-x-1 ${
                filter === "RED_ONLY"
                  ? "bg-rose-950/80 text-rose-300 border border-rose-800"
                  : "text-rose-400/80 hover:text-rose-300"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>Red Only</span>
            </button>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors"
            title={isExpanded ? "Collapse calendar" : "Expand calendar"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="divide-y divide-slate-800/60">
          {/* NY Open Execution Alert Banner (if event is at 9:45 AM or 10:00 AM) */}
          {openWindowAlerts.length > 0 && (
            <div className="px-5 py-2.5 bg-amber-950/20 border-b border-amber-900/40 text-xs text-amber-200/90 flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-300 font-semibold">NY Open Volatility Caution:</strong>{" "}
                <span>
                  {openWindowAlerts.map((e) => `${e.event} (${e.timeET})`).join(", ")} scheduled near the 9:30–10:00 AM retrace window. Expect brief spread expansion and fast wicks. Protect open profit or wait for release reaction.
                </span>
              </div>
            </div>
          )}

          {/* Events List */}
          {filteredEvents.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No matching US Red or Orange folder events found for this filter.
            </div>
          ) : (
            filteredEvents.map((evt) => {
              const isRed = evt.folderColor === "RED";
              const isToday = evt.date === todayStr;

              return (
                <div
                  key={evt.id}
                  className={`p-4 sm:px-5 hover:bg-slate-900/30 transition-colors ${
                    isRed ? "bg-rose-950/10" : ""
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    {/* Left: Folder Icon, Impact Tag, Time, Event Name */}
                    <div className="flex items-start space-x-3 min-w-0">
                      {/* Folder Badge */}
                      <div
                        className="shrink-0 mt-0.5"
                        title={isRed ? "Red Folder: High Impact" : "Orange Folder: Medium Impact"}
                      >
                        <Folder
                          className={`w-4 h-4 fill-current ${
                            isRed ? "text-rose-400" : "text-amber-400"
                          }`}
                        />
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Country */}
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-slate-900 text-slate-300 border border-slate-700">
                            USD
                          </span>

                          {/* Impact Pill */}
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                              isRed
                                ? "bg-rose-950 text-rose-300 border border-rose-800/80"
                                : "bg-amber-950 text-amber-300 border border-amber-800/80"
                            }`}
                          >
                            {isRed ? "Red Folder • High" : "Orange Folder • Med"}
                          </span>

                          {/* Time in ET */}
                          <span className="text-xs font-mono tabular-nums font-semibold text-slate-200 flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>{evt.timeET} ET</span>
                          </span>

                          {/* Date Tag */}
                          <span className="text-[11px] font-mono text-slate-400">
                            {isToday ? "(Today)" : evt.date}
                          </span>

                          {/* Open Window Warning */}
                          {evt.isNearOpenWindow && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80">
                              Near NY Open
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h3 className="text-sm font-semibold text-white tracking-tight">
                          {evt.event}
                        </h3>

                        {/* Forecast vs Previous Data */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono tabular-nums pt-0.5">
                          {evt.forecast && (
                            <span>
                              Forecast: <strong className="text-slate-200">{evt.forecast}</strong>
                            </span>
                          )}
                          {evt.previous && (
                            <span>
                              Previous: <strong className="text-slate-400">{evt.previous}</strong>
                            </span>
                          )}
                          {evt.actual && (
                            <span>
                              Actual: <strong className="text-emerald-400">{evt.actual}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Notes / Status */}
                    <div className="sm:text-right shrink-0 text-xs text-slate-400">
                      <span className="text-[11px] text-slate-500 block">
                        {evt.notes}
                      </span>
                    </div>
                  </div>

                  {/* RED NEWS MANDATORY EXPLANATION: Short & Simple Market Impact */}
                  {isRed && evt.marketImpact && (
                    <div className="mt-3 p-3 rounded bg-slate-900/70 border border-rose-900/40 text-xs text-slate-300 space-y-1">
                      <div className="flex items-center space-x-1.5 text-rose-300 font-semibold text-[11px]">
                        <Info className="w-3.5 h-3.5" />
                        <span>How This Red News Affects NQ / Futures:</span>
                      </div>
                      <p className="text-slate-200 leading-relaxed font-sans pl-5">
                        {evt.marketImpact}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Footer Info */}
      <div className="px-5 py-2.5 bg-slate-900/40 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Red Folder = High Volatility / Stop-Hunt Catalyst</span>
          </span>
          <span className="flex items-center space-x-1 text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Orange Folder = Medium Impact</span>
          </span>
        </div>
        <span className="text-slate-500">Filtered: United States (USD) Only</span>
      </div>
    </div>
  );
}
