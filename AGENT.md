# AGENT.md - OpenPulse Architecture & Operational Guide (v2.0)

## Overview
**OpenPulse** is an action-first quantitative pre-market & NY open decision engine engineered specifically for futures traders executing **1 trade per day on NQ / MNQ** (higher-timeframe continuation on retraces between 9:30 AM and 10:00 AM ET).

## Core Principles & Strategy Model
- **No Fluff / No Generic Calculators:** Traders do not need simple static level lists they can look up in seconds. They need concrete conditional solutions:
  - *Is a retrace probable today?* (Open-Test-Drive vs Runaway Open Drive vs Inventory Flush vs Chop Pinch with inspectable Factor Scorecards).
  - *What does it mean if price tests VWAP?* (Absorption confirmation vs Trapped longs panic-selling).
  - *Where is the structural trap?* (Why buying the first tick of the open or blindly buying red candles fails).
- **Single Trade Focus:** Strictly 1 trade per day.
- **Entry Window:** 9:34 AM – 9:48 AM ET (letting the initial 1–3 min opening whipsaw exhaust, executing on retrace absorption).
- **Execution Blueprint:** Concrete triggers:
  - Exact candle close/wick confirmation.
  - Hard structural invalidation points.
  - Multi-target expansion levels.
- **Post-Trade Empirical MAE/MFE Journal:** Records adverse drawdown heat (MAE in R), peak profit (MFE in R), and exit efficiency strictly from real logged trades. Sample size calibration gates (50 trades) prevent small-sample curve fitting.

## v2.0 Quantitative Architecture
- **Framework:** Next.js 16+ (App Router) + TypeScript + Tailwind CSS v4.
- **Market Data Pipeline (`src/lib/market/yahoo.ts` & `provider.ts`):**
  - Session Phase Detector: `PRE_MARKET_BRIEF`, `NY_OPEN_WINDOW_930_1000` (subphases: 09:30–09:33 Open Noise, 09:34–09:48 Prime Retrace, 09:49–09:59 Late Window Decay), `POST_WINDOW`.
  - Mandatory CME Delayed Feed Banner: If `exchangeDataDelayedBy > 0` during 09:30–10:00 ET, explicitly warns the trader and locks unverified live-candle triggers.
  - Live QQQ Equity Proxy: Integrated during regular trading hours as a real-time direction and VWAP proxy.
- **Mathematical Estimators (`src/lib/market/math.ts`):**
  - **HTF Fibonacci Engine:** Determines impulse direction from timestamps of trailing 5-day extremes (Bullish pulls down to discount, Bearish bounces up to premium; 0.382, 0.500, 0.618, 0.705 OTE).
  - **Garman-Klass Volatility:** Realized volatility estimator using OHLC.
  - **Yang-Zhang Volatility (10d & 20d):** Annualized realized volatility handling overnight price jumps, drift, and continuous variance.
  - **Variance Risk Premium (VRP):** `VRP = VXN - RealizedVol_YZ_20d`. Flags negative VRP (`RV > IV`) as tail-risk / stop-run dislocation.
  - **Rule of 16 Expected Move:** Daily 1-SD move and Expected Straddle (`~0.7979x`).
  - **Directional MAE/MFE & Exit Efficiency:** Proper directional formula for LONG and SHORT trades.
- **Session Levels Engine (`src/lib/market/levels.ts`):**
  - Globex session strictly `[18:00, 09:30)` ET.
  - Separate VWAP anchors: Globex VWAP (18:00), Prior Day RTH VWAP, RTH Session VWAP (09:30), with `TWAP FALLBACK` when volume is absent.
  - Daily Expected Move and Straddle bands in Key Levels table.
  - Cross-Index SMT Divergence (`NQ=F` vs `ES=F`) across session highs and lows.
  - Standardized Overnight Inventory: `% of Globex bars closing above PDC` (0%–100%).
- **Macro Regime Engine (`src/lib/market/regime.ts`):**
  - Full Volatility Surface: `^VXN`, `^VIX`, `^VIX3M`, `^VIX9D`, `^VIX1D`, `^VVIX`.
  - Term Structure Ratio (`VIX / VIX3M`): Backwardation (>1.0) vs Contango (<0.95).
  - Rolling 60-day Pearson correlation between NQ and 10Y Yield (`^TNX`): Inflation/Rate-Sensitive vs Growth-Scare.
  - Dynamic Regime Risk Multiplier: `1.0x` (normal), `0.5x` (backwardation / negative VRP / VVIX >= 110 / elevated shock), `0.0x` (stand aside).
- **Position Sizing Engine (`src/lib/risk/sizing.ts`):**
  - Dynamic MNQ contract count scaling based on dollar risk budget, prop drawdown, and regime multipliers. Stop-too-tight warning if stop < 0.5x 15m ATR.
- **Empirical Journal (`src/app/journal/` & `src/lib/db/`):**
  - Database schema migrated to store directional MAE, MFE, exit efficiency, and complete regime snapshot.
  - 50-trade sample calibration gate.
- **Persistence:** Node 24 native SQLite (`node:sqlite`) database (`data/openpulse.db`).

## Testing & Verification
- Unit test suite configured via `vitest` covering Fibonacci impulse, Garman-Klass & Yang-Zhang volatility, directional MAE/MFE, and MNQ/NQ position sizing.
- Verification command: `npm test` and `npm run build`.
