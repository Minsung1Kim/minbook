"use client";

import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Flame,
  AlertTriangle,
  Layers,
  Cpu,
  BarChart3
} from "lucide-react";
import { MarketQuote, MacroIndicator, EconomicEvent } from "@/types/market";

interface MacroRegimeStripProps {
  quote: MarketQuote;
  vix: MacroIndicator;
  us10y: MacroIndicator;
  dxy: MacroIndicator;
  megaCaps: Array<{
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
  }>;
  events: EconomicEvent[];
  dealerGammaTilt?: {
    regime: string;
    source: string;
    note: string;
  };
}

export function MacroRegimeStrip({
  quote,
  vix,
  us10y,
  dxy,
  megaCaps,
  events,
  dealerGammaTilt
}: MacroRegimeStripProps) {
  const isPositive = quote.change >= 0;
  const redAlertEvents = events.filter((e) => e.alert);

  return (
    <div className="space-y-3">
      {/* Red Folder News Alert Banner (if any) */}
      {redAlertEvents.length > 0 && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-200 flex items-start space-x-3 shadow-lg shadow-rose-950/20">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-wide text-rose-300">
                HIGH IMPACT MORNING EVENT ALERT:
              </span>
              <span className="px-1.5 py-0.2 rounded bg-rose-900 text-rose-200 font-mono text-[11px]">
                {redAlertEvents.map((e) => `${e.timeET} ${e.event}`).join(" • ")}
              </span>
            </div>
            <p className="mt-1 text-rose-300/80 leading-relaxed font-mono">
              {redAlertEvents[0].notes}
            </p>
          </div>
        </div>
      )}

      {/* Main Strip: Quote Ticker + Macro Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Quote Primary Box */}
        <div className="col-span-2 p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold text-cyan-400">
                {quote.displaySymbol}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {quote.symbol}
              </span>
            </div>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded font-semibold flex items-center space-x-1 ${
                isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
              }`}
            >
              {isPositive ? <TrendingUp className="w-3 h-3 mr-1 inline" /> : <TrendingDown className="w-3 h-3 mr-1 inline" />}
              {isPositive ? "+" : ""}
              {quote.change.toFixed(2)} ({isPositive ? "+" : ""}
              {quote.changePercent.toFixed(2)}%)
            </span>
          </div>

          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-mono font-bold text-white tracking-tight">
              {quote.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div className="text-[11px] font-mono text-slate-400 text-right">
              <span>H: {quote.high.toFixed(1)}</span>
              <span className="mx-1 text-slate-600">|</span>
              <span>L: {quote.low.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* VIX Volatility Card */}
        <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono flex items-center space-x-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>VIX</span>
            </span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                vix.value > 25
                  ? "bg-rose-500/10 text-rose-400"
                  : vix.value > 19
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {vix.value > 25 ? "HIGH" : vix.value > 19 ? "ELEVATED" : "NORMAL"}
            </span>
          </div>

          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-white">
              {vix.value.toFixed(2)}
            </span>
            <span className={`text-[11px] font-mono ${vix.change >= 0 ? "text-rose-400" : "text-emerald-400"}`}>
              {vix.change >= 0 ? "+" : ""}
              {vix.change.toFixed(2)}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 truncate mt-1" title={vix.note}>
            {vix.note}
          </div>
        </div>

        {/* 10Y Treasury Yield Card */}
        <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono flex items-center space-x-1">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>US 10Y Yield</span>
            </span>
          </div>

          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-white">
              {us10y.value.toFixed(3)}%
            </span>
            <span className={`text-[11px] font-mono ${us10y.change >= 0 ? "text-slate-300" : "text-emerald-400"}`}>
              {us10y.change >= 0 ? "+" : ""}
              {us10y.change.toFixed(3)}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 truncate mt-1" title={us10y.note}>
            {us10y.note}
          </div>
        </div>

        {/* US Dollar (DXY) Card */}
        <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>DXY Dollar</span>
            </span>
          </div>

          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xl font-mono font-bold text-white">
              {dxy.value.toFixed(2)}
            </span>
            <span className={`text-[11px] font-mono ${dxy.change >= 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {dxy.change >= 0 ? "+" : ""}
              {dxy.change.toFixed(2)}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 truncate mt-1">
            {dxy.regime}
          </div>
        </div>

        {/* Tech Mega-Caps Breadth Card */}
        <div className="col-span-2 p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono flex items-center space-x-1">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Tech Mega-Caps Breadth</span>
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              NQ Core Drivers
            </span>
          </div>

          <div className="grid grid-cols-6 gap-1.5 mt-2">
            {megaCaps.map((c) => {
              const isUp = c.changePercent >= 0;
              return (
                <div
                  key={c.symbol}
                  className="px-1.5 py-1 rounded bg-slate-950 border border-slate-800 text-center"
                  title={`${c.name}: $${c.price}`}
                >
                  <div className="text-[10px] font-mono font-bold text-slate-300">
                    {c.symbol}
                  </div>
                  <div
                    className={`text-[10px] font-mono font-semibold ${
                      isUp ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isUp ? "+" : ""}
                    {c.changePercent.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
