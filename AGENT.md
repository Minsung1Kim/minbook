# AGENT.md - OpenPulse Architecture & Operational Guide

## Overview
**OpenPulse** is an action-first pre-market & NY open decision engine engineered specifically for futures traders executing **1 trade per day on NQ / MNQ** (higher-timeframe continuation on retraces between 9:30 AM and 10:00 AM ET).

## Core Principles & Strategy Model
- **No Fluff / No Generic Calculators:** Traders do not need simple contract calculators or static level lists they can look up in seconds. They need concrete conditional solutions:
  - *Is a retrace probable/possible today?* (Open-Test-Drive vs Runaway Open Drive vs Inventory Flush vs Chop Pinch).
  - *What does it mean if price tests VWAP?* (Absorption confirmation vs Trapped longs panic-selling).
  - *Where is the structural trap?* (Why buying the first tick of the open or blindly buying red candles fails).
- **Single Trade Focus:** Strictly 1 trade per day.
- **Entry Window:** 9:34 AM – 9:48 AM ET (letting the initial 1–3 min opening whipsaw exhaust, executing on retrace absorption).
- **Execution Blueprint:** Concrete triggers:
  - Exact candle close/wick confirmation.
  - Hard structural invalidation points.
  - Multi-target expansion levels.
- **Post-Trade Empirical MAE/MFE Journal:** Records adverse drawdown heat (MAE in R) and peak profit (MFE in R) to give statistical evidence of when a trade is working vs failing.

## Architecture
- **Framework:** Next.js 16+ (App Router) + TypeScript + Tailwind CSS v4.
- **Action Playbook Engine (`src/lib/market/playbook.ts`):**
  - Synthesizes session metrics into Archetypes:
    - `OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)`: 70–85% probability of testing VWAP/ON Mid before continuation.
    - `OPEN-DRIVE (RUNAWAY / SHALLOW RETRACE ONLY)`: Gap day; deep VWAP retrace is unlikely, only shallow pullbacks to 3-min candle highs.
    - `OPEN-REVERSAL / INVENTORY FLUSH`: Trapped overnight longs forced to liquidate down to PDC.
    - `OPEN-AUCTION / CHOP PINCH`: Range-bound between PDC and VWAP; trade suspension advised.
  - Generates conditional "If-Then" action scenarios for:
    - VWAP test
    - VWAP breakdown
    - Overnight High (ONH) liquidity sweeps
    - Prior Day Close (PDC) inventory resets
- **Key Levels & Regime:** Computes PDH, PDL, PDC, PD Mid, ONH, ONL, ON Mid, London High/Low, Session VWAP, HTF 50%/61.8% Golden Pocket.
- **Persistence:** Node 24 native SQLite (`node:sqlite`) database (`data/openpulse.db`) tracking trade journals with empirical MAE/MFE analytics and checklist gates.

## Directory Map
- `src/app/page.tsx`: 9:30 AM Playbook Dashboard.
- `src/app/journal/page.tsx`: 30-Second MAE/MFE trade logger & empirical statistics engine.
- `src/app/settings/page.tsx`: Trader profile defaults, guardrails & market data configuration.
- `src/components/ActionPlaybookCard.tsx`: Retrace probability, expected pullback depth, #1 rule directive, and 30-min tactical timeline.
- `src/components/ScenarioMatrixCard.tsx`: Conditional "What It Means If..." scenarios and Session VWAP rulebook.
- `src/components/KeyLevelsTable.tsx`: Scannable reference levels with point distances and platform copy shortcuts.
- `src/components/ChecklistCard.tsx`: 7-point 9:30 AM execution gate.
- `src/lib/market/`: Market data provider adapters, cache singleton, level calculation, and playbook engine.
