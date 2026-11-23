# AGENT.md - OpenPulse Architecture & Operational Guide

## Overview
**OpenPulse** is a specialized pre-market & NY open bias, key-levels, and stop-risk briefing web application designed for futures traders trading **1 trade per day on NQ / MNQ** (higher-timeframe continuation on retraces between 9:30 AM and 10:00 AM ET).

## Core Principles & Trading Model
- **Single Trade Focus:** 1 trade per day on NQ/MNQ.
- **Entry Window:** 9:30 AM – 10:00 AM ET (allowing initial 1-3 min opening whipsaw to settle, entering on retrace to defined key levels/VWAP).
- **Risk / Reward:** $200–$300 default risk budget ($250 baseline) targeting $500–$600 (~2R–3R).
- **Data Integrity:** Honest data labeling. Every number displays its source (e.g. Yahoo Finance, Polygon, Seed/Derived), timestamp, and staleness badge (`LIVE`, `DELAYED`, `DERIVED`, `MANUAL INPUT`, `SAMPLE / UNCONFIGURED`).
- **No Chart Clutter:** Clean terminal/briefing layout focused on structural decision-making, level confluence, and MAE/MFE discipline.

## Architecture
- **Framework:** Next.js 16+ (App Router) + TypeScript + Tailwind CSS v4.
- **Data Persistence:** Node built-in SQLite (`node:sqlite`) database located at `data/openpulse.db`, with automated table initialization and migrations.
- **Market Data Engine:** Pluggable `MarketDataProvider` interface:
  - `YahooFinanceProvider`: Zero-config free market data for `NQ=F`, `QQQ`, `^NDX`, `^VIX`, `DX-Y.NYB`, `^TNX`.
  - `PolygonProvider`: Pluggable via `POLYGON_API_KEY` for real-time / delayed aggregates.
  - `SeedFallbackProvider`: Realistic structured fallback with clear `SAMPLE` badging if third-party APIs are unreachable or offline.
  - `CachedMarketDataService`: In-memory server cache with TTL to protect rate limits and eliminate unnecessary external requests.
- **Key Levels & Regime Engine:**
  - Prior Day High (PDH), Prior Day Low (PDL), Prior Day Close (PDC), Prior Day Midpoint (PD Mid).
  - Overnight (Globex) Session High (ONH), Overnight Low (ONL), Overnight Midpoint.
  - London High/Low, Asia High/Low where available from overnight intraday bars.
  - Session VWAPs (Globex session anchor and NY open anchor).
  - HTF Retracement Zones (50% equilibrium and 61.8% golden pocket).
  - Volatility-adjusted stop buffer guidance (ATR 14 and realized range vs. dollar risk in points: NQ = $20/pt, MNQ = $2/pt).
  - Macro and regime confirmation (VIX, 10Y Yield, DXY, Tech Mega-Caps, Economic News Releases).
- **Shared Briefs & Rooms:** Shareable daily snapshot permalinks and user profiles (e.g., Minsung, Alex, Jordan, custom).
- **Post-Trade MAE / MFE Journal:** Logs trades with Maximum Adverse Excursion (MAE in R) and Maximum Favorable Excursion (MFE in R) to compute empirical drawdown stats on continuation trades.

## Directory Structure
- `src/app/`: Next.js App Router pages and API route handlers (`/api/market-data`, `/api/briefs`, `/api/journal`, `/api/settings`).
- `src/components/`: Modular UI cards (Header/Clock, BiasCard, StopRiskCard, KeyLevelsTable, MacroRegimeStrip, Checklist, BriefsView, JournalView, SettingsModal).
- `src/lib/db/`: SQLite schema, connection singleton, repository methods.
- `src/lib/market/`: Market data providers, types, key levels calculator, regime analyzer.
- `src/types/`: Shared TypeScript domain types.
