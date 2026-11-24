# OpenPulse Changelog

All notable changes and architectural decisions are logged here.

## [2026-11-23] Initial Architecture & Scaffolding
- Initialized Next.js 16 (App Router) project with TypeScript and Tailwind CSS v4.
- Installed `lucide-react` for high-contrast financial terminal iconography.
- Configured Node 24 native `node:sqlite` (`DatabaseSync`), confirming fast zero-dependency local SQLite persistence.
- Created `AGENT.md` and `.ai/changelog.md` tracking architecture, operational principles, and development progress.

## [2026-11-23] User Direction Pivot: Actionable Solutions & "What It Means" Scenarios
- **Removed generic sizing sliders and calculators** (`StopRiskCard.tsx` and `src/lib/market/risk.ts` deleted).
- **Removed generic briefs tab** (`/briefs` page and `/api/briefs` deleted).
- **Engineered Action Playbook & Retrace Probability Engine (`src/lib/market/playbook.ts`):**
  - Answers: *Is a retrace possible/probable today?*
  - Classifies session into 4 archetypes:
    1. `OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)`: 70–85% chance of early dip to VWAP/ON Mid before continuation.
    2. `OPEN-DRIVE (RUNAWAY / SHALLOW RETRACE ONLY)`: Gap day where deep VWAP retrace will NOT happen; warns trader not to wait for VWAP or they get left behind.
    3. `OPEN-REVERSAL / INVENTORY FLUSH`: Trapped overnight longs forced to liquidate down to PDC.
    4. `OPEN-AUCTION / CHOP PINCH`: Compressed range between PDC and VWAP; high whipsaw risk.
  - Computes expected pullback depth in points.
  - Generates Today's #1 Execution Directive.
- **Engineered Interactive "What It Means If..." Action Matrix (`ScenarioMatrixCard.tsx`):**
  - Scenario 1 (VWAP Test): Institutional meaning, absorption trigger, hard invalidation stop, multi-target, retail trap warning.
  - Scenario 2 (VWAP Breakdown): Retrace failure mechanics, why averaging down is fatal, downside targets.
  - Scenario 3 (ONH Sweep): Opening liquidity sweep mechanics, why buying tick 1 is a trap.
  - Scenario 4 (PDC Inventory Reset): Defensive responsive bounce vs daily breakdown.
- **Engineered VWAP Direct Rulebook:**
  - Explains what a bounce off VWAP means vs what a clean breakdown means in real time.
- **Maintained Post-Trade MAE/MFE Empirical Journal (`/journal`):**
  - Keeps 30-second post-trade logger with empirical drawdown statistics on winning continuation retraces.
- **Verification:**
  - `npm run build` compiled 10/10 routes with zero errors.
  - Verified live server responses on `/`, `/journal`, `/settings`, `/api/market-data`.

## [2026-11-23] - Dynamic Auto-Refresh & Live Polling Architecture
- Added client-side ticker & countdown timer (10s intervals) with relative "X seconds ago" indicator and absolute "Last Updated: HH:MM:SS ET" stamp.
- Added live price flash animations (cyan/emerald for tick up, rose for tick down).
- Lowered Yahoo Finance in-memory chart cache to 8s and service TTL to 10s for responsive live prints without triggering rate limits.
- Validated production build with Next.js 16.4.6 and verified live dynamic updates on `http://localhost:3000`.

## [2026-11-23] - De-Slop Overhaul (kill-ai-slop guidelines)
- Audited codebase with `yetone/kill-ai-slop` scanner; systematically eliminated machine-generated aesthetic tells.
- Replaced atmospheric gradient cards and oversized fuzzy glow shadows (`shadow-2xl`) with crisp, matte terminal surfaces (`#0f1624`) and subtle hairline borders (`border-slate-800`).
- Removed emoji spam (`⚡`, `<Sparkles />`) and hyper-inflated AI marketing copy. Replaced with concise, institutional trader terminology.
- Stripped `font-mono` from full prose paragraphs, navigation links, and forms; restored modern sans-serif typography for UI text, reserving `font-mono tabular-nums` strictly for prices, deltas, and ticks.
- Removed bouncy hover jumps (`scale-105`) and radioactive pulsing glows (`box-shadow: 0 0 24px rgba(...)`); restored standard 150ms subtle color shifts.
- Purged dead prototype components (`BiasCard.tsx`, `ActionPlaybookCard.tsx`, `MacroRegimeStrip.tsx`, `ScenarioMatrixCard.tsx`).
- Verified zero TypeScript build errors and validated live HTTP 200 response on `http://localhost:3000`.

## [2026-11-23] - US Economic Calendar (Red & Orange Folders Only)
- Created `src/lib/market/economicCalendar.ts` providing filtered economic calendar data for US (`USD`) high-impact (Red folder) and medium-impact (Orange folder) releases.
- Implemented `getMarketImpactExplanation()` providing concise, 1-sentence explanations for Red news explaining how beats vs. misses impact Treasury yields, dollar, and NQ/futures continuation retraces.
- Added `EconomicNewsCard.tsx` directly to the main dashboard with:
  - Red / Orange folder visual tags and release time in Eastern Time (`font-mono tabular-nums`).
  - Forecast, Previous, and Actual figures.
  - NY Open Volatility Caution banner for catalysts occurring near the 9:30–10:00 AM ET retrace window (e.g. 9:45 AM Flash PMI, 10:00 AM ISM).
  - Quick filters for "All US", "Today", and "Red Only".
- Preserved `kill-ai-slop` compliance with clean hairlines, crisp typography, and zero rainbow glow.

## [2026-11-23] - Live Feed Fix & CME 10-15m Delay Transparency
- Diagnosed root cause of stalled price updates: unauthenticated fetch to Yahoo Finance chart API was triggering HTTP 429 ("Too Many Requests") due to rapid 10s client polling, triggering silent fallback to static baseline seed.
- Integrated `yahoo-finance2` with automated crumb and session cookie negotiation to eliminate 429 errors.
- Added server-side 15-second TTL cache and fallback to last known valid quote.
- Clarified CME Globex 10-15 minute exchange delay rules for free public web feeds: added transparent `DELAYED (10-15m CME)` badge and displayed exact CME exchange tick timestamp (`quote.timestamp`) alongside client poll time.
- Verified live CME Globex price updates (`NQ=F` at 26,860.00) following 6:00 PM ET futures session reopen.

## [2026-11-23] - OpenPulse v2.0 Comprehensive Quantitative Upgrade
- **Latency & Execution Integrity:**
  - Separated pre-market structural mode from live execution mode via `SessionPhase` (`PRE_MARKET_BRIEF`, `NY_OPEN_WINDOW_930_1000`, `POST_WINDOW`) and `ExecutionWindowSubPhase` (Open Noise, Prime Retrace, Late Window Decay).
  - Implemented mandatory `DELAYED FUTURES FEED (10–15m LAG) — USE PRE-OPEN PLAN + LIVE CHART` banner during 09:30–10:00 ET when futures feed has exchange delay.
  - Added live `QQQ` equity proxy support as real-time direction and VWAP guide.
- **Structural Levels & Mathematical Fixes:**
  - Extended Globex window to `[18:00, 09:30)` ET so the critical 09:15–09:30 ET pre-open sweep window is preserved.
  - Implemented timestamp-based impulse direction for HTF Fibonacci retracement (`computeHTFFibonacci`), correctly calculating 0.382, 0.500, 0.618, and 0.705 (OTE) levels for both bullish and bearish impulses.
  - Separated VWAP anchors: Globex VWAP (18:00), Prior Day RTH VWAP, RTH Session VWAP (09:30), with `TWAP FALLBACK` flag when volume is absent.
  - Added Rule of 16 Implied Move bands (1-SD and Expected Straddle `~0.7979x`) to Key Levels table, along with overnight range consumed percentage.
  - Ingested `ES=F` for Cross-Index SMT Divergence across session highs and lows.
- **Volatility Surface & Macro Regime:**
  - Ingested full volatility surface: `^VXN`, `^VIX`, `^VIX3M`, `^VIX9D`, `^VIX1D`, `^VVIX`.
  - Implemented annualized Garman-Klass and Yang-Zhang realized volatility estimators and Variance Risk Premium (`VRP = VXN - RealizedVol_YZ_20d`).
  - Added negative VRP stop-run dislocation warnings and term structure backwardation triggers (`VIX/VIX3M > 1.0`).
  - Wired up 60-day Pearson correlation between `NQ=F` and `^TNX` (Inflation/Rate-Sensitive vs Growth-Scare).
  - Standardized Overnight Inventory strictly to `% of Globex bars closing above PDC` (0%–100%).
- **Volatility-Normalized Playbook & Factor Scorecard:**
  - Replaced hardcoded point cutoffs with dynamic fractions of `ATR_15m` and `ExpectedMove_Straddle`.
  - Removed fabricated static percentages; replaced with transparent Qualitative Likelihood Tiers backed by an inspectable 7-factor scorecard (+1 / 0 / -1).
  - Added execution window time-decay tracking and automated News Buffer Warning for 09:45/10:00 AM catalysts.
- **Risk Sizing Engine:**
  - Built `RiskSizingCard.tsx` providing dynamic MNQ contract calculations, drawdown budget checks, regime multiplier scaling (1.0x, 0.5x, 0.0x), and stop-too-tight warnings.
- **Empirical MAE/MFE Journal:**
  - Fixed directional math for LONG and SHORT trades, including MFE Exit Efficiency (`(Actual_R / MFE_R) * 100`).
  - Removed static fabricated stats; added a 50-trade sample calibration gate.
  - Auto-attaches daily regime snapshots (VXN, VRP, Term Ratio, Inventory, SMT, Bias).
- **Unit Testing:**
  - Added `vitest` unit test suite covering Fibonacci impulse, realized volatility & VRP, directional MAE/MFE, and position sizing (13/13 tests passing).
- **Build & Verification:**
  - Verified clean Next.js 16 production build and live background server running on `http://localhost:3000`.

## [2026-11-23] - Interactive TradingView-Style Market Structure Chart (Lightweight Charts v5)
- **Library Integration:**
  - Installed `lightweight-charts@^5.3.0` adhering strictly to modern v5 APIs.
- **Strict v5 API Compliance:**
  - Enforced `chart.addSeries(CandlestickSeries, ...)` and `chart.addSeries(LineSeries, ...)` (no deprecated v4 methods).
  - Used `createSeriesMarkers(series, markers)` plugin for Opening Bell (09:30 AM ET) and SMT sweep markers.
  - Formatted all bar timestamps into strictly ascending, deduplicated Unix seconds (`Math.floor(ms / 1000)`).
- **Next.js App Router & Client Safety:**
  - Built `src/components/chart/OpenPulseChart.tsx` as a `'use client'` component and imported via `next/dynamic` with `{ ssr: false }`.
  - Wrapped chart lifecycle in `useRef` with `ResizeObserver` responsive sizing and `chart.remove()` in `useEffect` cleanup to eliminate React Strict Mode duplicate canvases.
- **Eastern Time (`America/New_York`) Formatting:**
  - Configured `localization.timeFormatter` and `timeScale.tickMarkFormatter` to display timestamps in Eastern Time (`America/New_York`), ensuring the critical 09:30–10:00 ET open window aligns cleanly on the x-axis across session boundaries.
- **Engineered Visual Overlays & Custom Primitives:**
  - **Dynamic Timeframe Switcher:** Added `15m` (default) and `5m` toggle backed by `/api/market-data/chart`.
  - **VWAP Overlay:** Plotted session/Globex cumulative VWAP as an amber line series, with automated `TWAP` mode indicator when volume is unpopulated.
  - **Categorized Price Line Overlays (`createPriceLine`):** Grouped into Liquidity/Targets (`PDH`, `PDL`, `ONH`, `ONL`), Retrace Anchors (`PDC`, `ON Mid`, `HTF 50% EQ`, `HTF 61.8% GP`), Sub-Sessions (`LonH`, `LonL`, `AsiaH`, `AsiaL`), and Volatility Bands (Upper/Lower Straddle, Upper/Lower 1-SD). Cleanly managed via interactive toggle pills with `removePriceLine` deduplication.
  - **Custom Canvas Primitives (`ISeriesPrimitive`):**
    - `VerticalTimeHighlightPrimitive`: Renders translucent cyan shading over the 09:30–10:00 ET NY Open Retrace Window and subtle tint for Globex overnight (18:00–09:30 ET).
    - `HorizontalRetraceZonePrimitive`: Renders soft translucent horizontal bands between primary retrace levels (e.g. VWAP / ON Mid or HTF 50%–61.8% Golden Pocket) reflecting the active directional bias.
- **Interactive UX & HUD:**
  - High-contrast dark terminal styling (`#090d16` canvas, `#0f1624` cards, slate-800 hairline borders).
  - Top-left HUD overlay with live crosshair OHLC, price change and %, nearest liquidity magnet and retrace level distance indicators, and live data-latency badge (`DELAYED 10–15m CME` vs `LIVE PROXY`).
  - Added subtle `Charts by TradingView` attribution link conforming to Apache-2.0 notice requirements.
  - **Bonus Feature:** Wired interactive focus from the Reference Levels table (`KeyLevelsTable.tsx`), allowing traders to click any session level pill to dynamically highlight and focus that level with a glowing price line on the chart.
- **Verification:**
  - Added unit test suite in `src/__tests__/chart.test.ts` covering bar timestamp sanitization, ascending sort, deduplication, cumulative VWAP/TWAP calculations, and ET formatting (17/17 tests passing across suite).
  - Executed `npm run build` with zero TypeScript or SSR hydration errors.
  - Verified live API and production server responses on `http://localhost:3000`.

## [2026-11-23] - Dashboard Streamlining & Free Chart Crosshair Exploration
- **Streamlined Dashboard Architecture:**
  - Removed generic calculator clutter (`RiskSizingCard.tsx` deleted from dashboard).
  - Removed the bottom 4 collapsible drilldown sections ("What It Means If VWAP Hits", "Is a Retrace Probable Today?", "Reference Levels Matrix", and "NY Open Execution Checklist").
  - Cleaned up unused states (`expandedSection`, `activeScenarioId`, `toggleSection`) and unused icon imports.
  - Focused the platform strictly on the 4 institutional & scientifically grounded cores:
    1. Today's #1 Execution Directive & Bias Banner (with 7-factor scorecard, VRP, VXN, stock-bond correlation).
    2. Interactive Market Structure Chart (Lightweight Charts v5 with free crosshair exploration).
    3. The 5 Core Trader Answers (Bias direction, Stop hunt / sweep level, Retrace levels, Draws on liquidity, R:R guidance, SMT Divergence, Vol surface).
    4. US Economic Calendar (Red & orange folders with passed events grayed out).
- **Free Chart Crosshair & Price Observation:**
  - Replaced magnetic candle lock (`CrosshairMode.Magnet`) with `CrosshairMode.Normal` (mode 0), allowing traders to freely move the cursor anywhere across price and time to observe arbitrary price coordinates and test stop loss locations.
  - Added real-time Free Cursor HUD indicator (`freeCursor.price` and `freeCursor.dist`) displaying the exact price under the crosshair and its live points distance from the current quote price (`+X.X pts vs quote`).
  - Added `rightOffset: 12` to `timeScale` to provide whitespace on the right of the chart canvas for projecting levels into the future.
- **Economic Calendar Passed Event Graying:**
  - Built `isEventPassed` utility in `EconomicNewsCard.tsx` comparing event dates and ET release times against current Eastern Time.
  - Automatically grays out passed economic events (`opacity-45 grayscale bg-slate-950/40 text-slate-500` with muted folder icon, line-through title, and `PASSED` badge).
  - Open window volatility warning banner now dynamically suppresses alerts for events that have already passed.
- **Verification:**
  - Added test cases in `src/__tests__/chart.test.ts` for `isEventPassed` (18/18 tests passing).
  - `npm run build` compiled 11/11 routes with zero TypeScript or build errors.
  - Production server running on `http://localhost:3000`.

## [2026-11-23] - CME Futures Session Clock & Trade Date Rollover Refactor
- **Centralized CME Session Clock (`src/lib/market/sessionClock.ts`):**
  - Refactored session resolution from calendar midnight (`12:00 AM ET`) to CME Futures trade date rollover rules (`5:00 PM / 6:00 PM ET`):
    - Mon–Thu `00:00–16:59 ET`: `targetTradeDate` = today.
    - Mon–Thu `17:00–23:59 ET`: `targetTradeDate` = next weekday (tomorrow).
    - Fri `00:00–16:59 ET`: `targetTradeDate` = today (Friday).
    - Fri `17:00 ET` through Sun `23:59 ET`: `targetTradeDate` = upcoming Monday.
  - Implemented 5-phase session state machine:
    1. `CME_BREAK_OR_WEEKEND`: Maintenance break (17:00–17:59 ET Mon–Thu) or weekend closure (Fri 17:00 – Sun 17:59 ET).
    2. `DEVELOPING_OVERNIGHT`: Sun–Thu 18:00–23:59 ET and Mon–Fri 00:00–08:29 ET with sub-phases `ASIA` (18:00–02:59 ET) and `LONDON` (03:00–08:29 ET).
    3. `PRE_MARKET_LOCK`: Mon–Fri 08:30–09:29 ET.
    4. `NY_OPEN_WINDOW`: Mon–Fri 09:30–09:59 ET.
    5. `POST_WINDOW_RECAP`: Mon–Fri 10:00–16:59 ET.
  - Implemented DST-safe UTC epoch millisecond converter (`getETEpochMs`, `parseDateStrToETEpochMs`).
  - Integrated 2024–2028 US/CME full-closure holiday skip list so holiday eves roll cleanly to the next valid trading day.
- **Deterministic Prior-Day & Globex Bar Slicing (`src/lib/market/levels.ts`):**
  - Eliminated blind array indexing (`dailyBars[len - 2]`); implemented date-matched selection of the most recent completed daily bar strictly before `targetTradeDate` (`barDate < targetTradeDate`). This ensures evening Globex visits lock Monday's session as `PDH`/`PDL`/`PDC` regardless of whether Yahoo Finance outputs an in-progress Tuesday daily candle.
  - Anchored Globex intraday bars strictly between `18:00 ET` of the calendar evening preceding `targetTradeDate` up to `09:30 ET` of `targetTradeDate`.
  - Added Early-Globex Guard (`18:00–18:30 ET`): If fewer than 2 Globex bars exist, returns `globexStatus: "INITIALIZING"`, safely defaults overnight inventory to 50% (`BALANCED`), and prevents division by zero or state leakage.
- **Macro Calendar & Phase-Aware Directives (`economicCalendar.ts`, `playbook.ts`):**
  - Aligned US economic news catalyst filtering to `targetTradeDate` instead of calendar today.
  - Overhauled tactical directives based on active CME phase:
    - `DEVELOPING_OVERNIGHT`: Labeled as `DEVELOPING — PREP FOR [DAY, MMM DD] 9:30 AM OPEN`, noting that London session and 8:30 AM macro releases are pending.
    - `PRE_MARKET_LOCK`: Labeled as `FINAL PRE-MARKET BRIEF — [DAY] 9:30 AM OPEN`.
    - `NY_OPEN_WINDOW`: Active execution checklist with countdown to 10:00 AM ET window close.
    - `POST_WINDOW_RECAP`: Displays `[DAY] 9:30 AM WINDOW COMPLETE — STAY FLAT / LOG TRADE` with a direct link to `/journal` and countdown to the 6:00 PM ET rollover.
    - `CME_BREAK_OR_WEEKEND`: Displays `MARKET CLOSED — PREPARING FOR [DAY, MMM DD] 9:30 AM OPEN` with countdown to 18:00 ET Globex open.
- **Dashboard Header & Visual Overlays (`Header.tsx`, `Dashboard.tsx`, `primitives.ts`):**
  - Top header displays real-time ET clock, Target Session Pill (e.g. `TARGET: TUE NOV 24 • 9:30 AM ET OPEN`), dynamic status badges (`DEVELOPING (ASIA)`, `FINALIZED`, `ACTIVE EXECUTION`, `RECAP`, `WEEKEND`), and live human countdown (`12h 51m to Open`, `18m left in Window`, `3h 15m to 6:00 PM Rollover`).
  - Added direct link to `/journal` in Hero card during `POST_WINDOW_RECAP`.
  - Updated vertical highlight primitive to handle trailing in-progress evening Globex session without visual clipping.
- **Verification:**
  - Added test suite `src/__tests__/sessionClock.test.ts` covering 13 test cases across all rollover rules, phase state transitions, Thanksgiving holiday skip, prior-day slicing with and without in-progress candles, early-Globex guards, and playbook directives (**31/31 unit tests passing** across 6 files).
  - Executed `npm run build` with zero TypeScript or hydration errors.
  - Verified live API and production server responses on `http://localhost:3000`.

## [2026-11-23] - Free Delayed GEX Engine & Free 1m-Derived Footprint / Absorption Modules
- **Free Delayed GEX Engine (`src/lib/market/gex.ts`):**
  - Engineered $0 Dealer Gamma Exposure module for Nasdaq-100 translated directly into `NQ=F` points.
  - **Data Feeds & Resilience:** Fetches delayed options JSON from Cboe (`_NDX.json` / `QQQ.json`) with a 15-minute server-side TTL cache. Automatically falls back to `yahoo-finance2` `options('QQQ')` across nearest 3 expirations with server-side Black-Scholes gamma ($\Gamma = \frac{N'(d_1)}{S \cdot \sigma \cdot \sqrt{T}}$, clamped $T \ge 1/252$, IV substituted with `^VXN/100` if zero).
  - **Public-Chain Convention:** $\text{CallGEX} = +\Gamma \cdot \text{CallOI} \cdot 100 \cdot S^2 \cdot 0.01$ and $\text{PutGEX} = -\Gamma \cdot \text{PutOI} \cdot 100 \cdot S^2 \cdot 0.01$.
  - **Translation to NQ Scale:** Translates cumulative zero-crossing `gammaFlipNq`, largest call strike `callWallNq`, largest put strike `putWallNq`, and top 5 strikes within $\pm 2.5\%$ into `NQ=F` index points using the basis ratio ($NQ / Spot$).
  - **Scorecard Factor H Integration:** Integrated into `regime.ts` and `playbook.ts` as an environmental regime tilt (`POSITIVE_GAMMA` warns of mean-reversion chop and range dampening, scaling R:R targets to 1.8R–2.2R; `NEGATIVE_GAMMA` supports expansion runs of 2.5R–3.0R and warns of aggressive stop sweeps).
  - Transparent labeling badge: `DELAYED OI-BASED GEX ESTIMATE (NOT LIVE DEALER INVENTORY)`.
- **Free 1m-Derived Footprint & Absorption Engine (`src/lib/market/footprint.ts`):**
  - Built a zero-cost order-flow proxy ingesting delayed `1m` OHLCV bars for `NQ=F` via Yahoo Finance (15-second TTL cache).
  - Groups 1m bars into parent candles (5m/15m) and calculates:
    - Close Location Value ($\text{CLV} = \frac{(C - L) - (H - C)}{H - L} \in [-1, +1]$).
    - Intrabar Delta ($\text{Volume} \cdot \text{CLV}$) and Delta Ratio ($\Delta / V$).
    - Point of Control (POC) price bucketed into 2.5 pt price bins.
    - Dual Cumulative Volume Delta: Session CVD (reset at 18:00 ET Globex open) and RTH CVD (reset at 09:30 ET NY open).
  - **Automated Structural Markers:**
    - `ABS BUY` / `ABS SELL`: Passive absorption detected when volume $\ge 1.8 \times \text{avgVol20}$, body ratio $\le 0.35$, wick ratio $\ge 0.40$, within $0.5 \times \text{ATR}_{15m}$ of key support/resistance levels.
    - `IMP+` / `IMP-`: Aggressive sweep detected when volume $\ge 1.5 \times \text{avgVol20}$ and $|\text{deltaRatio}| \ge 0.65$.
    - `CVD DIV ▼` / `CVD DIV ▲`: Multi-bar CVD divergence detected over trailing 6–12 bars.
  - Transparent labeling disclaimer: `Free 1m-Derived Intrabar Delta Proxy (Delayed — Not CME L2 Tick Flow)`.
- **Lightweight Charts v5 UI & HUD Additions (`src/components/chart/OpenPulseChart.tsx`):**
  - Added toolbar toggle pills for `GEX Levels` and `Footprint Markers` (with hover tooltips).
  - Plotted GEX price lines (`γ FLIP`, `CALL WALL`, `PUT WALL`) with `createPriceLine` and `removePriceLine` cleanup.
  - Rendered Footprint markers using `createSeriesMarkers(candleSeries, markers)` sorted strictly ascending by timestamp.
  - Added top-right compact GEX HUD card displaying +Γ/-Γ regime badge, Gamma Flip, Call Wall, Put Wall, 0DTE Net GEX, basis ratio, and disclaimer.
  - Added bottom summary strip CVD readout (1m Session CVD and RTH CVD).
- **Verification & Testing:**
  - Added unit test suites `src/__tests__/gex.test.ts` (9 tests) and `src/__tests__/footprint.test.ts` (9 tests).
  - All 8 test files passing cleanly with **49/49 unit tests**.
  - `npm run build` compiled all routes with zero TypeScript or static generation errors.
  - Live production API validated at `/api/market-data?symbol=NQ&refresh=true`.

## [2026-11-23] - Self-Recording Prediction Archive, Auto-Grader & Self-Improvement Engine
- **Persistence Schema & Repository Abstraction (`src/lib/calibration/store.ts`):**
  - Architected `ICalibrationRepository` interface cleanly abstracting persistence behind Node 24 SQLite (`node:sqlite`) for 1-file Supabase migration readiness.
  - Implemented 3 dedicated tables:
    1. `daily_predictions`: Unique on `targetTradeDate` (`YYYY-MM-DD`). Captures frozen snapshot at 09:15–09:29 ET (`spotAtFreeze`, `biasVerdict`, `confidenceTier`, `archetype`, `stopHuntWatch`, `primaryRetraceLevels`, `liquidityDraws`, and JSON `regimeInputs` including all 8 factor scores). Enforces strict immutability to eliminate hindsight bias.
    2. `prediction_grades`: 1-to-1 with `daily_predictions`. Stores objective execution outcomes (`openPrice930`, `windowHigh`, `windowLow`, `windowClose1000`, `biasCorrect`, `favorableExcursionPts`, `adverseExcursionPts`, `retraceTapped`, `stopHuntOccurred`, `liquidityDrawHit`, `chopWarningCorrect`, `brierScore`, `compositeScore`).
    3. `model_weights_history`: Versioned factor weights records (`v1.0`, `v1.1`, ...) with `is_active` state, out-of-sample accuracy benchmarks, sample size tracking, and change rationale for zero-risk rollbacks.
- **Automated Freeze & Grading Pipeline (`src/lib/calibration/grader.ts` & API Routes):**
  - **Auto-Freeze (`POST /api/calibration/freeze` + automatic hook on morning dashboard load):** Automatically freezes pre-market snapshot between 09:15–09:29 ET (or on first request during pre-market/open window). Rejects any attempts to overwrite an existing frozen prediction after 09:30 ET.
  - **Auto-Grader (`POST /api/calibration/grade` + automatic background trigger after 10:20 ET):** Fetches actual 5m/1m NQ candles once settled past the CME delay. Evaluates directional continuation (hit $\ge 0.75 \times \text{ATR}_{15m}$ before $-1.00 \times \text{ATR}_{15m}$ stop), retrace tapping, stop hunt execution, and liquidity targets.
  - **Optional Cron Endpoint (`/api/cron/snapshot-and-grade`):** Secure cron endpoint protected by `CRON_SECRET` for automated scheduled executions.
- **Walk-Forward Self-Improvement Calibration Engine (`src/lib/calibration/optimizer.ts`):**
  - **Factor Attribution Tracker:** Computes win rate, lift vs baseline ($\text{WinRate} - \text{Baseline}$), and performance split by volatility regime (`Normal` vs `High Vol / Negative VRP`) for all 8 factors. Classifies each factor as `EDGE ENHANCER` (emerald), `NEUTRAL` (slate), or `NOISE DETRACTOR` (rose).
  - **Strict N >= 30 Sample Calibration Gate:** Live weights remain locked while $N < 30$ to prevent small-sample curve fitting. When $N \ge 30$, runs a walk-forward 70/30 chronological time-split optimization with bounded weight updates ($[0.2, 2.4]$).
  - **Anti-Overfitting Protection:** Only surfaces a "Proposed Calibrated Weights Ready" card if out-of-sample accuracy strictly improves on the held-out 30% test set.
  - **Interactive Trader Control:** Allows traders to inspect the exact weight diff and rationale, and click **Apply Weights** or **Rollback**.
  - **Dynamic Scorecard Integration (`playbook.ts` & `service.ts`):** Wired active factor weights dynamically into `generateTacticalPlaybook` scorecard calculations.
- **AI Journal Bot Cross-Linkage (`src/app/journal/page.tsx`):**
  - Cross-checks logged trade entries against OpenPulse's frozen pre-market call and grade on that trade date.
  - Diagnoses root causes automatically:
    - *"Flawless Execution: Aligned with OpenPulse & Executed on Retrace with minimal heat"*
    - *"Execution Error: Entered too early / chased opening noise before 09:34 AM retrace absorption"*
    - *"System Misread: Negative-VRP Volatility Chop"*
    - *"Discipline Breach: Traded on Stand Aside / Chop Day"*.
- **System Self-Audit Dashboard (`src/app/performance/page.tsx`):**
  - Added dedicated navigation tab in `Header.tsx`.
  - Displays overall hit-rate KPIs (Bias Direction, Retrace Tap Rate, Stop-Hunt Accuracy, Draw-on-Liquidity Rate), Excursion Profile (MFE/MAE ratio and composite execution score), Factor Attribution Leaderboard, Proposed Model Update diff drawer, and filterable history table.
- **Verification & Testing:**
  - Added unit test suite `src/__tests__/calibration.test.ts` (9 tests) covering immutable snapshot locking, tamper-rejection, deterministic 09:30–10:00 grading math, stop hunt identification, Brier calibration scores, sample size gate, and walk-forward weight bounds.
  - All 9 test files passing cleanly (**58/58 unit tests passing**).
  - `npm run build` compiled all 14 routes with zero TypeScript errors.
  - Live API validated at `/api/calibration/audit`, `/api/calibration/freeze`, and `/api/calibration/weights`.

## [2026-11-23] - Interactive Click-to-Size Planner & Visual Trade Replay Player
- **Interactive Click-to-Size & Visual R:R Box (`src/components/chart/RiskBoxPrimitive.ts` & `OpenPulseChart.tsx`):**
  - **Lightweight Charts v5 Primitive:** Implemented `RiskBoxPrimitive` (`ISeriesPrimitive<Time>`) rendering red translucent Risk Zone and green translucent Reward Zone with right-aligned in-canvas badge pills (`ENTRY: price`, `STOP: price (-pts)`, `TARGET: price (+pts • net R:R)`).
  - **Toolbar Controls:** Added `"Plan Trade (Click-to-Size)"`, `"Snap to Levels"` (snapping clicks within 3.5 pts to nearest key level or GEX strike), and `"Clear Plan"`.
  - **2-Click Flow on Chart Canvas:**
    - Click 1 sets planned entry price.
    - Click 2 sets stop loss, automatically inferring `LONG` or `SHORT` direction and calculating position size.
    - Optional Click 3 or preset R buttons (`2.0R`, `2.2R`, `2.5R`, `3.0R`) adjust target price.
  - **Dynamic Sizing & Commission Integration (`src/lib/risk/sizing.ts`):**
    - Implemented `computeDetailedRiskPlan(...)` calculating recommended `MNQ` contracts (`Math.floor(adjustedRiskUsd / (stopPts * 2))`), `NQ` comparison, round-trip fees (`$1.24/rt MNQ`, `$4.50/rt NQ`), Gross vs Net P&L & Net R:R, and stop-too-tight warning (`stopPts < 0.5 * ATR_15m`).
    - Added floating Planning HUD card with one-click `"Send Plan to AI Journal ➔"` button forwarding trade parameters to `/journal` via `sessionStorage`.
- **Visual Trade Replay Player in AI Journal (`src/components/journal/TradeReplayChart.tsx` & `src/app/journal/page.tsx`):**
  - **Expandable Replay Rows:** Added `"Replay"` / `"Close"` toggle button on every trade row in `/journal`, rendering `TradeReplayChart` (dynamically imported with `{ ssr: false }`).
  - **Interactive Playback Scrubber:**
    - Controls: `Reset to 08:30 AM`, `Step -1 Bar`, `Play / Pause` (`1x` / `2x`), `Step +1 Bar`, `Show Full Session`, and timeline range slider.
    - Event shortcuts: `Jump to Entry` and `Jump to Exit`.
  - **Visual Overlays & Markers:**
    - Overlays session candlestick bars, session VWAP line, 09:30–10:00 ET window highlight band, and trade's planned Risk/Reward box.
    - Renders TradingView Lightweight Charts v5 markers for `09:30 OPEN`, `ENTRY`, `MAE -X.XXR` pin on worst-price candle, `MFE +X.XXR` pin on peak candle, and `EXIT` flag with realized P&L.
  - **Running HUD:** Displays current bar ET timestamp, close price, trade phase (`PRE-ENTRY`, `TRADE ACTIVE`, `TRADE CLOSED`), and live unrealized P&L in points, `$`, and `R`.
  - **SQLite Bar Persistence & Offline Synthetic Fallback (`src/lib/db/index.ts`):**
    - Added `session_bars_json TEXT DEFAULT NULL` column to `trades` table with auto-migration.
    - Automatically serializes current session bars upon submitting new trades.
    - Implemented `generateSyntheticSessionBars` deterministic bar interpolator for historical trades, ensuring 100% crash-proof bar-by-bar replay offline.
  - **AI Journal Auto-Population:** Reads forwarded planned trade draft on mount to pre-fill entry, stop, target, direction, and notes in the trade logger form.
- **Verification & Testing:**
  - Added unit test suite `src/__tests__/risk_plan.test.ts` (5 tests) verifying direction inference, MNQ/NQ contract sizing, round-trip fee deduction, net R:R math, and stop-too-tight warnings.
  - All 10 test files passing cleanly (**63/63 unit tests passing**).
  - `npm run build` compiled all routes with zero TypeScript or static generation errors.
  - Live production server verified at `http://localhost:3000` and `http://localhost:3000/journal`.

## [2026-11-23] - SMT Indicator Engine, Institutional Stop Hunt Playbook & Chart HUD Minimization
- **Smart Money Technique (SMT) Indicator Engine (`src/lib/market/levels.ts` & `SMTIndicatorCard.tsx`):**
  - Implemented cross-asset divergence monitoring between `NQ=F` (Nasdaq 100) and `ES=F` (S&P 500) at key swing points (overnight highs and lows):
    - **Bullish SMT (NQ Swept Low, ES Held):** NQ triggers sell stops below overnight low while ES holds a higher low $\rightarrow$ confirms NQ sweep was an engineered liquidity harvest / bear trap with ES leading; trader waits for NQ Market Structure Shift (MSS) displacement to enter LONG.
    - **Bullish SMT (ES Swept Low, NQ Held):** ES flushes below low while NQ holds a higher low $\rightarrow$ indicates relative tech accumulation; trader waits for ES reclaim and NQ MSS to enter LONG on NQ.
    - **Bearish SMT (NQ Swept High, ES Held):** NQ sweeps buy stops above overnight high while ES fails to reach high (lower high) $\rightarrow$ confirms bull trap / exhaustion; trader waits for NQ MSS back below ONH to enter SHORT.
    - **Bearish SMT (ES Swept High, NQ Held):** ES makes new high while NQ prints lower high $\rightarrow$ signals selective distribution; trader waits for ES failure and NQ MSS downward to enter SHORT.
  - Built dedicated `SMTIndicatorCard.tsx` displayed prominently on the dashboard with real-time status pill (`BULLISH SMT`, `BEARISH SMT`, `SYNCED`), side-by-side NQ vs ES price and swing point comparison, leader asset vs swept asset badges, institutional mechanics breakdown, and actionable MSS trigger directives.
  - Added SMT divergence markers to `OpenPulseChart.tsx` (`SMT BULL ▲` / `SMT BEAR ▼` with leader asset attribution) and an SMT indicator badge in the chart's bottom summary strip.
- **Institutional Stop Hunt Likelihood Revamp & 3-Phase Playbook (`src/lib/market/playbook.ts` & `Trader5CoreAnswersCard.tsx`):**
  - Revamped Stop Hunt presentation with rigorous institutional terminology:
    - Identifies target pools explicitly as **Buy-Side Liquidity (BSL)** or **Sell-Side Liquidity (SSL)** with precise price levels (`ONH`, `ONL`, `PDH`, `PDL`).
    - Probability tiering: `HIGH (82% INSTITUTIONAL SWEEP RISK)`, `MODERATE (55% TWO-WAY WICK PROBE)`, `LOW (DIRECT DRIVE)`.
    - Structured into a 3-Phase Execution Playbook:
      1. **The Trap:** Retail breakout stop clusters targeted by institutional algorithms.
      2. **The Shift (MSS):** Wick rejection back inside range followed by 1m/5m Market Structure Shift displacement.
      3. **Trader Directive:** Mandatory execution discipline (e.g. *"DO NOT CHASE BREAKOUT. Wait for sweep wick to close back inside range, confirm MSS, and enter on the retrace to VWAP"*).
- **Session Signals & Tactical Setup Live Convergence Strip:**
  - Added a live Session Pulse header inside `Trader5CoreAnswersCard.tsx` uniting the 4 core institutional data engines:
    1. SMT Live Divergence status.
    2. Dealer Gamma Regime (+Γ/-Γ) and Gamma Flip strike.
    3. Footprint Delta & CVD (Session CVD and RTH CVD).
    4. Volatility Surface VRP (Variance Risk Premium Contango/Backwardation).
- **Chart Window Minimization & Clean Canvas Master Toggle (`OpenPulseChart.tsx`):**
  - Added individual minimize (`-`) and expand (`+`) buttons to each floating overlay:
    - Dealer Gamma Regime card (top-right).
    - OHLC Bar & Latency strip (top-left).
    - Planning Mode Step Banner / Interactive Risk Card.
  - Added a master `"Minimize All Windows" / "Show Windows"` (`Minimize2` / `Maximize2`) toggle button in the chart header toolbar, allowing discretionary traders to instantly hide all floating cards and inspect pure market structure candles with 100% visibility.
- **Verification & Testing:**
  - Added comprehensive unit test suite `src/__tests__/smt.test.ts` (5 tests) verifying all 4 institutional divergence combinations and the synchronized baseline.
  - All 11 unit test suites passing cleanly (**68/68 unit tests passing**).
  - Next.js production build (`npm run build`) succeeded with 0 TypeScript errors.
  - Production server running on `http://localhost:3000` with HTTP 200 response on dashboard and `/api/market-data`.

## [2026-11-24] - Complete Institutional UI/UX Overhaul (Linear / Raycast Aesthetic) & De-Slop
- **Design System Foundation (Quiet, High-Contrast Institutional Desk):**
  - Standardized monochrome base surface hierarchy on shadcn/ui primitives (`card`, `tabs`, `table`, `badge`, `button`, `sheet`, `separator`, `tooltip`, `switch`):
    - Base canvas: deep neutral matte (`#09090b` / `bg-zinc-950`).
    - Primary surface: `#111113` (`bg-zinc-900/70`).
    - Hairline 1px borders: `border-zinc-800/80`.
  - **Eliminated AI Visual Slop:**
    - Purged neon glows, saturated multi-colored card borders, gradient card headers, drop-shadow soup, and purple/indigo AI palettes.
    - Standardized typography with Geist Sans for readable UI and Geist Mono `tabular-nums` for prices, levels, points, R-multiples, and deltas.
    - Set functional UI text floor to 11px across all components to satisfy WCAG AA legibility and Impeccable standards.
  - **Strict Semantic Color Budget:**
    - Emerald (`text-emerald-400` / `bg-emerald-500/10`): Bullish, Profit, GO, Support, Positive CVD.
    - Crimson/Rose (`text-rose-400` / `bg-rose-500/10`): Bearish, Loss, Risk Invalidation, Negative CVD.
    - Amber (`text-amber-400` / `bg-amber-500/10`): Caution, Delayed Feed, Developing Regime, SMT Warning.
    - Neutral Zincs/Whites: All labels, structural lines, headers, tabs, and non-trading indicators.
- **Top Header Bar (`src/components/Header.tsx`):**
  - Streamlined into a single compact 56px (`h-14`) bar.
  - Left: Clean `OpenPulse` wordmark with `NQ` tag + 3-tab navigation (`Brief`, `AI Journal`, `Audit`).
  - Right: Instrument toggle (`NQ` | `MNQ`), Timezone switcher (`ET` | `CT` | `PT`), Target session pill, live countdown with green pulse dot, CME latency dot, and quiet refresh icon button.
- **Main Dashboard (`src/components/Dashboard.tsx`):**
  - **Hero Directive Strip:** 1 clean, high-conviction horizontal bar containing Bias verdict (`CONTINUATION BULLISH` / `CHOP` / `STAND ASIDE`), Size multiplier (`1.0x` / `0.5x`), Price & Change, and single 1-sentence plain-English directive.
  - **Flat Telemetry Strip:** Horizontal monospace strip displaying `VXN`, `VIX/3M`, `VVIX`, `VRP`, `GEX`, `SMT`, and `10Y` with zero nested cards.
  - **2-Column Trading Workspace:**
    - Left Column (~68% width): Full-height 560px TradingView Lightweight Charts v5 market structure chart with monochrome toolbar pills (`Liquidity`, `Retrace`, `VWAP`, `Zones`, `Sub-Sessions`, `Volatility`, `GEX`, `Footprint`, `SMT`, `HUD`).
    - Right Column (~32% width): Tabbed side panel (`Levels` | `Playbook` | `Sizer`) using shadcn `Tabs`.
- **Key Levels Monospace Table (`src/components/KeyLevelsTable.tsx`):**
  - Formatted as a tight monospace ladder sorted by price descending (`Level`, `Price`, `Dist`, `Role`, `Copy`).
  - Clicking any row highlights that level on the chart canvas.
- **AI Journal Overhaul (`src/app/journal/page.tsx`):**
  - 1-line top performance summary bar (`Net P&L`, `Win Rate`, `Avg R`, `Avg Winner MAE`, `Trades Logged`) + clean `+ Log Trade` button.
  - Slim 1-Screenshot Drag & Drop / `Cmd+V` Paste bar with instant preview.
  - Ultra-clean 1-row-per-day ledger table (`Day/Date`, `P&L`, `R`, `Dir & Size`, `Window`, `AI Grade`).
  - Right-side `Sheet` slide-over drawer displaying trade details, `TradeReplayChart` player, AI Journal Bot critique, and deletion action.
- **System Audit Overhaul (`src/app/performance/page.tsx`):**
  - Minimal 4-stat metric strip (`Directional Bias Hit Rate`, `Retrace Tap Rate`, `Stop-Hunt Precision`, `Liquidity Magnet Rate`).
  - Monospace Factor Attribution leaderboard table sorted by win rate and lift.
  - Collapsible historical prediction archive rows comparing pre-market frozen calls against actual session outcomes.
- **Verification:**
  - `npx impeccable detect src/`: 0 anti-patterns across all 74 files.
  - `npm test`: 12/12 test suites and **71/71 tests passing**.
  - `npm run build`: 14/14 routes compiled cleanly with zero errors.
  - Production server running on `http://localhost:3000` returning HTTP 200 on all pages.

## [2026-11-24] - SMT Chart Dotted Trendlines, Multi-Timezone Engine (ET/CT/PT) & Clutter Purge
- **SMT Dotted Trendline on Chart Canvas (`src/components/chart/OpenPulseChart.tsx` & `src/lib/market/levels.ts`):**
  - **Removed Standalone Card Clutter:** Deleted `SMTIndicatorCard.tsx` and removed its section from the dashboard to focus discretionary traders on the chart.
  - **In-Canvas Dotted Trendline:** Added TradingView Lightweight Charts v5 `LineSeries` with `lineStyle: LineStyle.Dotted` and `lineWidth: 2` connecting the two key swing points on the NQ chart:
    - **Bullish SMT (Emerald `#34d399`):** Connects prior swing low to the swept lower low / higher low, exactly matching institutional SMT diagram conventions.
    - **Bearish SMT (Rose `#f43f5e`):** Connects prior swing high to the swept higher high / lower high.
  - **Swing Point Extraction (`extractNQSwingPoints`):** Automatically extracts the timestamp and price of the anchor swing point and the sweep swing point from intraday bars, passing them via `smtDivergence.nqSwingPoints`.
  - **Series Markers:** Plotted distinct swing point labels on NQ candles: `pt1` (`NQ Prior Low` / `NQ Prior High`) and `pt2` (`BULL SMT (ES Leads)` / `BEAR SMT (ES Leads)`).
- **Multi-Timezone Engine across Chart, Timers & Macro (`src/lib/market/timezone.ts` & `src/context/TimezoneContext.tsx`):**
  - **Supported Zones:** Full support for US East (`America/New_York`, ET), US Central (`America/Chicago`, CT), and US West (`America/Los_Angeles`, PT) with persistent trader selection in `localStorage` (`openpulse_timezone`).
  - **Header Segmented Control:** Added clean `[ ET | CT | PT ]` switcher and aligned top digital clock to display live time in the active zone with timezone code.
  - **Session Clock & Milestones:** `getCMESessionInfo` dynamically computes target trade date banners and open window countdowns reflecting the trader's zone (e.g. `09:30 ET` / `08:30 CT` / `06:30 PT`).
  - **Chart Timescale & Tooltips:** Dynamically configures Lightweight Charts v5 `localization.timeFormatter` and `timeScale.tickMarkFormatter` so the x-axis and hover tooltips update cleanly when switching timezones.
  - **Economic Calendar Alignment:** `EconomicNewsCard.tsx` converts all US release times dynamically to ET, CT, or PT.
  - **Exchange Tick & Summary Strips:** Aligns dashboard tick timestamp and chart bottom summary bar with the selected timezone.
- **UI Streamlining & Clutter Reduction:**
  - Removed Click-to-Size trade planning button, mode banner, and planning HUD card from `OpenPulseChart.tsx`.
  - Removed Settings tab from navigation bar to maintain a streamlined trading terminal interface.
- **Verification & Testing:**
  - Added unit test suite `src/__tests__/timezone.test.ts` (3 tests) verifying timezone configuration, economic calendar conversion, and session clock milestone alignment.
  - Updated `src/__tests__/smt.test.ts` with strict non-null assertions and swing point validation.
  - All 12 unit test suites passing cleanly (**71/71 unit tests passing**).
  - Next.js production build (`npm run build`) compiled all 14 routes with zero TypeScript or Turbopack errors.
  - Verified live production server on `http://localhost:3000` with HTTP 200 response.

## [2026-11-24] - Chart Declutter (No Indicators & Hidden HUD by Default), Forex Factory Calendar Tab & Vitality-Ranked Levels
- **Quiet Chart Canvas by Default (`src/components/chart/OpenPulseChart.tsx`):**
  - **Overwhelming Visuals Purged on Load:** All chart indicator overlay layers (`liquidity`, `retrace`, `vwap`, `zones`, `subSessions`, `volatility`, `gex`, `footprint`, `smt`) now initialize to `false`.
  - **HUD Hidden by Default:** Floating HUD cards (`allHudsHidden: true`, `isGexMinimized: true`, `isOhlcMinimized: true`) are concealed on mount, displaying a clean `"Show HUD"` button in the toolbar.
  - Initial canvas displays pure, pristine candlesticks without line or marker obstruction. Traders can toggle on any specific indicator layer on demand with one click.
  - Bottom chart summary strip now dynamically displays legend pills only for active layers.
- **Dedicated Economic Calendar Tab (`/calendar` & `src/app/calendar/page.tsx`):**
  - **Moved Out of Dashboard:** Removed `EconomicNewsCard` from the main dashboard to keep the daily trading workspace uncluttered.
  - **New Top-Level Tab:** Added `Calendar` tab in `Header.tsx` directly alongside `Brief`, `AI Journal`, and `Audit`.
  - **Forex Factory Alternative for Futures Day Traders:**
    - Dedicated backend endpoint `/api/calendar` pulling verified Forex Factory JSON feed with baseline fallback and 2-hour TTL cache.
    - Top telemetry bar displaying the next high-impact catalyst with live countdown, NY open window alert (`09:15–10:15 ET`), and localized timezone status.
    - Segmented filter controls: `Today Only` | `Upcoming` | `This Week` and `High & Med` | `Red Only` | `All`.
    - Grouped schedule by day with high-contrast impact badges (Red/Orange/Gray), actual vs forecast vs previous values, and expandable cards detailing quantitative market impact on NQ futures.
    - Automatic dimming and strikethrough styling for completed releases.
- **Key Reference Levels Resorted by Vitality & Hit Likelihood (`src/components/KeyLevelsTable.tsx`):**
  - **Quantified Hit Likelihood Algorithm:** Combines mathematical proximity to spot price (`Math.abs(price - spot)`) with institutional structural gravity:
    - Tier 1 (Vital Execution): `Session VWAP` (100), `ONH/ONL` (95), `PDC` (90), `ON Mid` (85).
    - Tier 2 (Structural Confirmation): `HTF 50%/61.8%` (78), `London Extremes` (72), `PDH/PDL` (68).
    - Tier 3 (Tail Boundaries): `Implied Daily Straddle` & `1-SD Move` (30).
  - **Default View:** Defaults to `"Most Vital (Hit Likelihood)"` sorting so the highest-conviction and nearest levels appear immediately at the top (#1, #2, #3...).
  - **Clear Signal Badges:** Categorizes levels into `TAP IMMINENT` (within 8 pts), `HIGH HIT PROB` (72%+), `MODERATE HIT PROB` (48%+), `EXPANSION MAGNET` (30%+), or `OUTER BOUNDARY`.
  - **Plain English Day Trader Directives:** Replaces cryptic technical jargon with direct, actionable trading instructions for each level.
  - **View Toggle:** Seamless toggle between `"Most Vital (Hit Likelihood)"` and `"Price Ladder"` (High to Low).
- **Verification:**
  - `npx impeccable detect src/`: 0 anti-patterns across all 76 source files.
  - `npm test`: 12/12 test suites and **71/71 tests passing**.
  - `npm run build`: 14/14 routes compiled with zero errors.
  - Verified live server on `http://localhost:3000` with HTTP 200 on `/`, `/calendar`, `/journal`, `/performance`, `/api/calendar`.

## [2026-11-24] - AI Quant Prediction Forefront & Playbook Simplification for ICT Day Traders
- **AI Quant Prediction Command Card at the Forefront (`src/components/Dashboard.tsx`):**
  - **Prominent Top Hero Architecture:** Elevated the top section into a high-conviction AI Prediction Hero that immediately answers the trader's core question before they even look at a chart:
    - **Header:** `AI QUANT PREDICTION · NY OPEN WINDOW` with conviction percentage (`82% CONVICTION · HIGH TIER`) and position size multiplier (`SIZE 1.0x`).
    - **3-Box Prediction Grid:**
      1. **The Call:** Direction & Setup (`BUY / LONG CONTINUATION` / `SELL / SHORT CONTINUATION`) with 1-sentence plain-English execution directive.
      2. **Opening Stop Hunt Trap:** Quantified stop-hunt probability and target liquidity pool where smart money will hunt stops on the open bell.
      3. **Trade Cheat Sheet:** Instant execution matrix displaying Entry Retrace at VWAP, Invalidation Stop below sweep wick, and Take-Profit Target #1.
    - **Quant Strat Alignment Strip:** Highlights how all 8 quantitative models (Volatility term structure, VRP, Dealer GEX floor/runner, Cross-Index SMT, Order Flow CVD, 5-Day Impulse Fib) converged to generate the prediction.
- **Playbook in Front of Levels (`src/components/Dashboard.tsx`):**
  - Moved `Playbook` to be the **first and default active tab** in the right workspace panel (`defaultValue="playbook"`).
  - Day traders immediately see the AI's 5 Core Answers right beside the chart canvas, with `Levels` and `Sizer` easily accessible as secondary tabs.
- **Jargon Purged & Simplified for ICT / Discretionary Traders (`src/lib/market/playbook.ts`, `Trader5CoreAnswersCard.tsx`, `levels.ts`):**
  - Replaced confusing academic/quant terminology with natural price action & ICT language:
    - `"Globex equilibrium"` $\rightarrow$ **`Overnight 50% Midpoint (Discount Retrace Zone)`**.
    - `"Two-way wick probe"` $\rightarrow$ **`Opening Chop & Stop Hunt Trap`**.
    - `"Institutional sweep risk"` $\rightarrow$ **`Likely Stop Hunt`**.
    - `"BSL pool above ONH"` $\rightarrow$ **`Buy Stops Above Overnight High (ONH)`**.
    - `"SSL pool below ONL"` $\rightarrow$ **`Sell Stops Below Overnight Low (ONL)`**.
    - `"Range compression two-way liquidity probe"` $\rightarrow$ **`Overnight Midpoint (Opening Chop Trap)`**.
  - Restructured Stop Hunt breakdown into 3 intuitive steps:
    1. `1. The Fakeout (Retail Trap):` Explains who gets trapped on the first 9:30 AM pop/flush.
    2. `2. Reversal Confirmation (MSS):` Clear explanation of Market Structure Shift displacement.
    3. `3. Exactly What You Do:` Strict rule to wait for the fakeout to finish and buy/sell the discount retrace.
- **Verification:**
  - `npx impeccable detect src/`: 0 anti-patterns across all 76 source files.
  - `npm test`: 12/12 test suites and **71/71 tests passing**.
  - `npm run build`: 14/14 routes compiled with 0 errors.
  - Verified live server on `http://localhost:3000` with HTTP 200 response.

## [2026-11-24] - Comprehensive Quantitative Architecture Whitepaper & Deep Research Mandate
- **Whitepaper Generation (`docs/MinBook_Quantitative_Architecture_and_Reasoning_Whitepaper.md` & `.pdf`):**
  - Synthesized MinBook's entire thought process, mathematical models, market microstructure reasoning, level vitality sorting, volatility surface mechanics, dealer gamma translation, order flow footprinting, cross-index SMT divergence, 8-factor scorecard decision engine, and walk-forward self-improvement loop into an exhaustive, publication-grade quantitative research whitepaper.
  - Rendered a multi-page PDF (`docs/MinBook_Quantitative_Architecture_and_Reasoning_Whitepaper.pdf`) using headless Chrome print-to-pdf with print CSS typography and zero code snippets.
  - Formulated 5 targeted research directives for Gemini Deep Research (Synthetic 1m vs CME L2 order book depth, 0DTE options skew & intraday gamma elasticity, non-linear machine learning regime switching, cross-asset flow transmission with ZN/DX, and online Bayesian factor calibration).


## [2026-11-24] - Official Rebrand to MinBook & Public GitHub Preparation
- **Full Rebrand (`OpenPulse` -> `MinBook` / `minbook`):**
  - Updated `package.json` with `"name": "minbook"` and updated description.
  - Updated Next.js metadata in `src/app/layout.tsx` to `MinBook — Quantitative NY Open Futures Decision Engine`.
  - Updated navbar wordmark and active indicators in `src/components/Header.tsx`.
  - Renamed `src/components/chart/OpenPulseChart.tsx` to `MinBookChart.tsx`, with backward-compatible export shim in `OpenPulseChart.tsx`.
  - Updated chart imports across `Dashboard.tsx`, `TradeReplayChart.tsx`, and `chart.test.ts`.
  - Updated storage keys in `TimezoneContext.tsx` (`minbook_timezone`), `ChecklistCard.tsx` (`minbook_checklist_*`), and `journal/page.tsx` (`minbook_planned_trade`) with automatic fallback migration for legacy keys.
  - Updated SQLite database default to `minbook.db` with legacy fallback to `openpulse.db`.
  - Migrated `openpulse_methodology_report.md` to `docs/methodology.md`.
  - Updated `AGENT.md` and `AGENTS.md` to MinBook specifications.
- **Security, Secrets & PII Audit:**
  - Verified 0 secrets, API keys, or private tokens in working tree and git history.
  - Verified `.gitignore` ignores all `.env*` (except `.env.example`), `data/`, `*.db`, `*.sqlite`, and uploads.
  - Cleaned up `.env.example` with clear sections for free/core vs optional capabilities.
- **Documentation:**
  - Replaced `README.md` with structured technical architecture, Mermaid diagrams, quick start, and disclaimers.
  - Created `docs/screenshots/` asset directory.
- **Verification:**
  - `npm test`: 12/12 test suites and **71/71 tests passing**.
  - `npm run build`: 14/14 routes compiled cleanly in Next.js Turbopack.

## [2026-11-24] - Comprehensive Security, Secrets, PII & Hardening Pass
- **Deep Repository & Git History Audit:**
  - Full-depth scan across all 11 commits and working tree files for secrets, private keys, API tokens, passwords, AWS/GitHub credentials.
  - Confirmed 0 secrets, tokens, or credentials ever leaked in code or git history.
  - Confirmed `.gitignore` comprehensively guards all `.env*` (preserving only `.env.example`), `.next/`, `node_modules/`, `data/`, `*.db`, `*.sqlite`, `*.pem`, `*.log`, and `.vercel`.
- **Complete PII & Identity Sanitization:**
  - Purged all hardcoded personal author names (`minsung`, `Minsung (Me)`, `Alex (Friend)`, `Jordan (Friend - Prop)`) across `types/app.ts`, `settings/page.tsx`, `api/journal/route.ts`, `api/checklist/route.ts`, `Dashboard.tsx`, `ChecklistCard.tsx`, and `lib/db/index.ts`.
  - Replaced with standard institutional profiles: `"default"` (`Primary Trader`), `"prop-eval"` (`Prop Evaluation`), and `"conservative"` (`Conservative Account`).
- **Defensive Security Headers Added (`next.config.ts`):**
  - Added HTTP security headers for all routes: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: on`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **API Hardening & Schema Synchronization (`src/app/api/settings/route.ts`):**
  - Added dual support in `/api/settings` for both wrapped `{ profile: data }` and flat `{ ...data }` payloads.
  - Added dual payload response returning both `data: { profiles, current }` and flat `{ profiles, current }` for 100% schema alignment across settings page and dashboard.
- **Environment Documentation (`.env.example`):**
  - Added `CRON_SECRET=` documentation for securing `/api/cron/snapshot-and-grade` against unauthorized public invocation.
- **Dependency Hygiene (`package.json`):**
  - Moved `shadcn` CLI tooling to `devDependencies`.
- **Verification:**
  - `npm test`: 12/12 test suites and **71/71 tests passing**.
  - `npx tsc --noEmit`: 0 TypeScript errors.
  - `npm run build`: 17/17 routes compiled successfully in Next.js Turbopack.

## [2026-11-24] - Supabase Cloud Integration & Vercel Live Production Deployment
- **Supabase Cloud Infrastructure Provisioned:**
  - Project ID: `qpzqftmybortbutxggmv` (`minbook`, region: `us-east-1`).
  - Production Supabase URL: `https://qpzqftmybortbutxggmv.supabase.co`.
  - Modern 2026 Publishable API Key: `sb_publishable_xgl51WKxiNaTXqUsgEBUyQ_CFun5WGO`.
  - Applied migration `0001_init_minbook.sql` and `0002_expand_system_predictions_roles.sql`:
    - Strict Row Level Security (RLS) enabled on all tables: `user_settings`, `journal_trades`, `daily_predictions`, `prediction_grades`, `model_weights_history`.
    - Created private screenshot storage bucket `journal-screenshots` with user-isolated RLS folder policies (`auth.uid() = (storage.foldername(name))[1]`).
    - Verified via Supabase Advisors: 0 security, performance, or RLS warnings.
- **Authentication & Next.js 16 Session Security:**
  - Integrated `@supabase/supabase-js` and `@supabase/ssr`.
  - Created browser client (`src/lib/supabase/client.ts`) and server client (`src/lib/supabase/server.ts`).
  - Created Next.js 16 file convention `src/proxy.ts` (replacing deprecated `middleware.ts`):
    - Refreshes auth sessions via `supabase.auth.getUser()`.
    - Enforces route protection on `/journal`, redirecting unauthenticated users to `/login?redirect=/journal`.
    - Redirects authenticated users from `/login` back to dashboard.
  - Built high-contrast monochrome terminal `/login` page with Email + Password sign-in wrapped in `<Suspense>`.
  - Added quiet user email indicator and Sign Out button to navbar (`src/components/Header.tsx`).
  - Implemented `/auth/signout` server route.
- **Route & Storage Protection:**
  - Hardened `/api/journal/analyze` and `/api/journal/insights` to return `401 Unauthorized` for unauthenticated requests.
  - Updated `/api/journal` and `/api/settings` to synchronize with Supabase Postgres.
  - Implemented base64 screenshot upload to private Supabase Storage (`journal-screenshots/{userId}/{tradeId}.webp`) with short-lived signed URLs (`createSignedUrl`).
  - Dual fallback architecture: app gracefully falls back to local SQLite when Supabase environment variables are absent.
- **Serverless & Polling Optimization (Vercel Free Tier Guardrails):**
  - Added CDN cache headers `Cache-Control: public, s-maxage=60, stale-while-revalidate=120` to `/api/market-data`, `/api/market-data/chart`, and `/api/calendar`.
  - Throttled dashboard polling from 10s to 60s, automatically pausing when tab is hidden (`document.hidden`) and triggering instant refresh on tab focus.
- **Vercel Production Deployment:**
  - Linked to Vercel account `minsung1kims-projects` under project `minbook`.
  - Configured Environment Variables in Vercel for Production and Preview (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `MARKET_DATA_PROVIDER=yahoo`, `CACHE_TTL_SECONDS=60`).
  - Production deployment succeeded and aliased to **`https://minbook-omega.vercel.app`**.
- **Live Production Smoke Test Verification:**
  - `GET /` -> HTTP 200 (PRERENDER)
  - `GET /login` -> HTTP 200 (PRERENDER)
  - `GET /journal` -> HTTP 307 Redirect to `/login?redirect=%2Fjournal`
  - `POST /api/journal/analyze` -> HTTP 401 Unauthorized
  - `GET /api/market-data` -> HTTP 200 with live calculation payload



## [2026-11-24] - MinBook v3.0 Sprint 3: Empirical Grading & Safe Self-Calibration (`feat/v3-core-and-ltf`)
- **1-Minute Path-Dependent Triple-Barrier R-Expectancy Grader (`src/lib/calibration/grader.ts`, `src/lib/calibration/store.ts`):**
  - Replaced binary 0.75x ATR vs 1.00x ATR open-to-high grader with realistic 1-minute path-dependent execution simulation:
    - Isolates 09:30–09:33 ET observation lock bars to establish `orh3m`, `orl3m`, and initial impulse range.
    - Simulates limit entry execution at the predicted 40%–50% retrace zone between 09:34 and 09:48 ET. If price never retraces, logs outcome honestly as `NO_FILL`.
    - Evaluates Barrier 1 (Stop Loss): Invalidation stop hit logs realized $-1.0R$ net of friction.
    - Evaluates Barrier 2 (Take Profit): Scales out 1 contract at TP1, exits runner at TP2 or triggers 1m MSS kill-switch if opposing candle displaces back across entry.
    - Evaluates Barrier 3 (Time Exit): At 10:00 AM ET, liquidates remaining active contracts at the 10:00 AM close price.
    - Deducts exact all-in round-trip commissions ($1.30 MNQ) + 3-tick (0.75 pt / $1.50) opening slippage.
    - Evaluates strictly proper scoring rules: Brier score $(p - y)^2$ and Logarithmic scoring rule $-\sum y \ln(p)$.
  - Updated SQLite schema for `prediction_grades` table with columns: `log_score`, `triple_barrier_outcome`, `realized_net_r`, `net_pnl_dollars`, `fill_price`, `fill_time_et`, `exit_price`, `exit_time_et`.
- **Closed-Form Beta-Binomial Bayesian Shrinkage Optimizer (`src/lib/calibration/optimizer.ts`):**
  - Replaced discrete 21/9 chronological walk-forward optimizer with closed-form conjugate Beta-Binomial Bayesian Shrinkage:
    $$\hat{\theta}_j^{\text{Bayes}} = \frac{k_j^{(\gamma)} + \alpha_0}{n_j^{(\gamma)} + \alpha_0 + \beta_0}, \quad \alpha_0 = 25, \beta_0 = 25, \gamma = 0.99$$
  - Clamps production calibrated weights strictly within $[0.6, 1.5]$ ($w_j^* = \text{clip}(2.0 \times \hat{\theta}_j^{\text{Bayes}}, 0.6, 1.5)$).
  - Enforced strict Sample Size Gate ($N \ge 60$): `EDGE ENHANCER` ($\ge +4\%$) and `NOISE DETRACTOR` ($\le -4\%$) tags remain suppressed (`NEUTRAL`) until effective sample size $N \ge 60$.
- **Bootstrap MAE Stop Calibration (`src/lib/db/index.ts`):**
  - Raised MAE collection gate from 50 total trades to $N \ge 150$ total trades AND $\ge 75$ winning trades.
  - Implemented `computeBootstrapUpperP90`: evaluates 1,000 bootstrap resamples of Winners' P90 MAE and computes the non-parametric upper 90% confidence bound before recommending any stop tightening.
- **UI Enhancements (`src/app/performance/page.tsx`, `src/app/journal/page.tsx`):**
  - Performance audit view displays `Beta-Binomial Bayesian Shrinkage active`, showing triple barrier outcome badges (`HIT_TP1`, `HIT_TP2`, `STOPPED_OUT`, `TIME_EXIT`, `NO_FILL`) and realized net R.
  - Journal view displays an MAE Sample Calibration Banner showing calibration status, trade counts ($N/150$, $N_{\text{wins}}/75$), and upper 90% bootstrap bound.
- **Documentation Reconciliation (`docs/methodology.md`, `docs/MinBook_Quantitative_Architecture_and_Reasoning_Whitepaper.md`):**
  - Updated both documents to v3.0.0 unified configuration (session hours, 4 orthogonal factors, LTF target bounds, PropProfile rules, Triple-Barrier grader, Bayesian shrinkage, and bootstrap MAE calibration).

## [2026-11-24] - Intraday NQ Scalper Calibration & UI Streamlining Overhaul
- **Scalper Stop-Loss & Target Calibration (`src/lib/execution/ltfExecution.ts`, `src/lib/market/playbook.ts`):**
  - Re-calibrated execution engine strictly for CME NQ/MNQ 1-minute intraday scalpers (09:34–09:50 AM ET):
    - **Stop Loss Tightened:** Capped structural invalidation stops strictly to $[10.0, 18.0]$ pts ($\$20–\$36$/MNQ). Anchored to the immediate 1m micro-swing extreme of the trailing 3 bars rather than the 60–150 pt 3-minute opening impulse range.
    - **Reachable Scalp TP1 & TP2:**
      - TP1 (Quick 1:1 Scalp): Capped strictly inside $[10.0, 18.0]$ pts ($+\$20–\$36$/MNQ), measured directly from `entryZone.mid`.
      - TP2 (Scalp Runner Extension): Capped strictly inside $[20.0, 35.0]$ pts ($+\$40–\$70$/MNQ), measured directly from `entryZone.mid`.
    - **Demoted HTF Levels:** Any level with distance $> 35$ pts (or $> 0.75 \times \text{ATR}$) from `entryZone.mid` is demoted into the collapsed `Distant HTF Levels` drawer with badge `Distant HTF Pivot (> 35 pts) — Not a Scalp Target`.
  - Updated `drawsOnLiquidity` and `rrGuidance` in `playbook.ts` to output immediate 1m scalp objectives (+14/-14 pts) and `1.0R–1.8R QUICK SCALP & LOCK (12–25 PTS)`.
- **UI Simplification & De-Cluttering (`src/components/LTFTradeCardView.tsx`):**
  - **Removed Account Types Dropdown:** Purged dropdown popover menu and account selector button. Replaced with a clean, static, high-contrast `MNQ SCALP MODE` badge.
  - **Instant-Read Terminal Grid:** Re-architected trade card into an ultra-clean 4-box parameter grid:
    - `Trade Action`: Bold `BUY / LONG` or `SELL / SHORT`.
    - `Limit Entry Zone`: High-contrast price range and mid benchmark.
    - `Scalp Stop-Loss`: Red bold price with exact points and $\$$/MNQ risk.
    - `Position Sizing`: MNQ contract count, net risk, and net target.
  - **High-Visibility Target Cards:** Highlighting TP1 (scale 50%) and TP2 (runner to BE) with Brownian touch probabilities.
  - **Concise Invalidation Banner:** Sharp 1m MSS kill-switch rule callout.
- **Grader & Quantization Edge Case Hardening (`src/lib/calibration/grader.ts`, `src/lib/market/gex.ts`):**
  - Updated `grader.ts`: Preserves `HIT_TP1` when price hits TP1 before later triggering the runner stop or MSS kill-switch.
  - Hardened `gex.ts`: Locks basis ratio to standard 41.35 when timestamps mismatch $> 60$s and settlement basis is undefined.
  - Hardened `ltfExecution.ts`: Transitions status to `STAND_ASIDE` when contracts quantize to 0.
- **Authentication Gate & How-To-Use Scalper Guide (`src/proxy.ts`, `src/app/login/page.tsx`, `src/components/HowToUseNotice.tsx`):**
  - **Sign In First Architecture (`src/proxy.ts`):** Unauthenticated visitors are now routed directly to `/login` first before accessing the dashboard. Once signed in, they are redirected straight into their account (`/`).
  - **Sign Up / Sign In Dual Mode (`src/app/login/page.tsx`):** Added a clean toggle allowing traders to either sign in with existing credentials or register a new trader account via Supabase Auth.
  - **Simple 3-Step "How to Use" Notice (`src/components/HowToUseNotice.tsx`):** Mounted a high-contrast terminal guide banner on the dashboard explaining the 3 simple scalper steps:
    1. 09:30–09:33 ET: Hands off mouse (wait for 3m range).
    2. 09:34–09:50 ET: Check 1-Min Scalp Card & set limit order inside entry zone with 10–18 pt stop.
    3. Scale 50% at TP1, move stop to Breakeven, hold runner for TP2 (1 trade per day mandate).
  - Added quick "Rules" toggle directly on `LTFTradeCardView.tsx` for immediate at-a-glance reminders.
- **Verification:**
  - Full Vitest suite: 16 test files, 114 tests passing (0 failures).
  - Next.js 16 production build succeeded with 0 errors.
- **1-Minute Path-Dependent Triple-Barrier R-Expectancy Grader (`src/lib/calibration/grader.ts`, `src/lib/calibration/store.ts`):**
  - Replaced binary 0.75x ATR vs 1.00x ATR open-to-high grader with realistic 1-minute path-dependent execution simulation:
    - Isolates 09:30–09:33 ET observation lock bars to establish `orh3m`, `orl3m`, and initial impulse range.
    - Simulates limit entry execution at the predicted 40%–50% retrace zone between 09:34 and 09:48 ET. If price never retraces, logs outcome honestly as `NO_FILL`.
    - Evaluates Barrier 1 (Stop Loss): Invalidation stop hit logs realized $-1.0R$ net of friction.
    - Evaluates Barrier 2 (Take Profit): Scales out 1 contract at TP1, exits runner at TP2 or triggers 1m MSS kill-switch if opposing candle displaces back across entry.
    - Evaluates Barrier 3 (Time Exit): At 10:00 AM ET, liquidates remaining active contracts at the 10:00 AM close price.
    - Deducts exact all-in round-trip commissions ($1.30 MNQ) + 3-tick (0.75 pt / $1.50) opening slippage.
    - Evaluates strictly proper scoring rules: Brier score $(p - y)^2$ and Logarithmic scoring rule $-\sum y \ln(p)$.
  - Updated SQLite schema for `prediction_grades` table with columns: `log_score`, `triple_barrier_outcome`, `realized_net_r`, `net_pnl_dollars`, `fill_price`, `fill_time_et`, `exit_price`, `exit_time_et`.
- **Closed-Form Beta-Binomial Bayesian Shrinkage Optimizer (`src/lib/calibration/optimizer.ts`):**
  - Replaced discrete 21/9 chronological walk-forward optimizer with closed-form conjugate Beta-Binomial Bayesian Shrinkage:
    $$\hat{\theta}_j^{\text{Bayes}} = \frac{k_j^{(\gamma)} + \alpha_0}{n_j^{(\gamma)} + \alpha_0 + \beta_0}, \quad \alpha_0 = 25, \beta_0 = 25, \gamma = 0.99$$
  - Clamps production calibrated weights strictly within $[0.6, 1.5]$ ($w_j^* = \text{clip}(2.0 \times \hat{\theta}_j^{\text{Bayes}}, 0.6, 1.5)$).
  - Enforced strict Sample Size Gate ($N \ge 60$): `EDGE ENHANCER` ($\ge +4\%$) and `NOISE DETRACTOR` ($\le -4\%$) tags remain suppressed (`NEUTRAL`) until effective sample size $N \ge 60$.
- **Bootstrap MAE Stop Calibration (`src/lib/db/index.ts`):**
  - Raised MAE collection gate from 50 total trades to $N \ge 150$ total trades AND $\ge 75$ winning trades.
  - Implemented `computeBootstrapUpperP90`: evaluates 1,000 bootstrap resamples of Winners' P90 MAE and computes the non-parametric upper 90% confidence bound before recommending any stop tightening.
- **UI Enhancements (`src/app/performance/page.tsx`, `src/app/journal/page.tsx`):**
  - Performance audit view displays `Beta-Binomial Bayesian Shrinkage active`, showing triple barrier outcome badges (`HIT_TP1`, `HIT_TP2`, `STOPPED_OUT`, `TIME_EXIT`, `NO_FILL`) and realized net R.
  - Journal view displays an MAE Sample Calibration Banner showing calibration status, trade counts ($N/150$, $N_{\text{wins}}/75$), and upper 90% bootstrap bound.
- **Documentation Reconciliation (`docs/methodology.md`, `docs/MinBook_Quantitative_Architecture_and_Reasoning_Whitepaper.md`):**
  - Updated both documents to v3.0.0 unified configuration (session hours, 4 orthogonal factors, LTF target bounds, PropProfile rules, Triple-Barrier grader, Bayesian shrinkage, and bootstrap MAE calibration).
- **Verification:**
  - Added unit test suite `src/__tests__/sprint3_calibration_and_grader.test.ts` covering:
    - Triple-Barrier limit fill, scale-out, MSS kill-switch, and 10:00 AM vertical exit.
    - Strictly proper Brier and Log scores.
    - Beta-Binomial shrinkage math ($\alpha_0=25, \beta_0=25, \gamma=0.99$), $[0.6, 1.5]$ weight clip, and $N \ge 60$ status tag gate.
    - Bootstrap upper 90% confidence bound and $N \ge 150 / N_{\text{wins}} \ge 75$ gate.
  - Full test suite passed: 15 test files, 103 tests passing (0 failures).
  - Production Next.js 16 build passed with 0 errors.

## [2026-11-24] - System Revamp: Plain-English Quant Bias, Bounce/Target Areas, Screenshot-Only P&L Overlay Journal & Clean Audit
- **Plain-English Quant Bias, Bounce Areas & Target Areas (`src/lib/market/plainEnglishBrief.ts`, `src/components/Dashboard.tsx`, `src/components/KeyLevelsTable.tsx`):**
  - Streamlined `/` to focus directly on three essentials:
    1. **Clear Bias + Quant Facts & Math:** Plain-English verdict (`BULLISH`, `BEARISH`, `CHOP / NEUTRAL`) with honest signal count (`X of 4 Core Quant Signals`) and scannable quant proof cards (`Price vs Fair Value`, `Overnight Positioning`, `NQ vs S&P 500 (SMT)`, `Options Dealer Gamma (GEX)`, `Volatility & Expected Range`, `Bonds & Dollar Macro`, `1m Buying vs Selling Flow`).
    2. **Areas It Could Bounce From:** Deduplicated support/pullback zones (`Session VWAP`, `Overnight 50% Midpoint`, `Yesterday's Close`, `Prior POC/VAL`, `Options Put/Call Wall`, `5-Day 50%/61.8%`) with plain-English explanations and click-to-focus chart integration.
    3. **Areas To Target:** Ranked upside/downside liquidity magnets (`Overnight High/Low`, `Yesterday's High/Low`, `Call/Put Walls`, `Expected Daily Move Straddle/1-SD`).
  - Purged redundant/confusing dashboard clutter (`HowToUseNotice.tsx`, `LTFTradeCardView.tsx`, `Trader5CoreAnswersCard.tsx`, `ChecklistCard.tsx`, `RiskSizingCard.tsx`, and hardcoded `82%` conviction fallbacks).
- **Screenshot-Only P&L Journal (`src/lib/journal/pnlOverlayReader.ts`, `src/app/journal/page.tsx`, `src/app/api/journal/route.ts`, `src/app/api/journal/analyze/route.ts`, `src/lib/journal/store.ts`, `src/lib/db/index.ts`):**
  - Removed the manual `+ Log Trade` button, multi-field trade entry form, `sessionStorage` draft forwarding, and `TradeReplayChart.tsx`.
  - Installed `tesseract.js` and built `pnlOverlayReader.ts`: detects clustered green and red P&L overlay bounding boxes on screenshots, extracts upscaled high-contrast crops, runs OCR (`parsePnlFromText`) with color-overlay sign resolution, and optionally supports Gemini Vision (`GEMINI_API_KEY`) in `/api/journal/analyze` without fabricating fallback results.
  - Removed `seedInitialTrades` from `src/lib/db/index.ts` and fixed `/api/journal` analytics to compute metrics directly from live returned trades (`computeJournalAnalyticsFromTrades`).
- **Clean & True Audit Pipeline (`src/lib/calibration/store.ts`, `grader.ts`, `optimizer.ts`, `src/app/api/calibration/audit/route.ts`, `src/app/performance/page.tsx`, `supabase/migrations/0003_audit_and_screenshot_journal.sql`):**
  - Removed synthetic archive auto-seeding (`seedSampleArchiveIfEmpty`) from `computeCalibrationSummary` and repositories; filtered out pre-launch synthetic seed rows (`isLegacySyntheticSeedPrediction`) so Audit reflects 100% real frozen predictions only.
  - Applied Supabase migration `0003_audit_and_screenshot_journal.sql` adding Triple-Barrier/Log Score columns to `prediction_grades` and screenshot P&L overlay columns to `journal_trades`.
  - Fixed `SupabaseCalibrationRepository.savePrediction` to enforce immutability (never upsert-overwriting) and fixed `saveGrade` to persist all fields and update `daily_predictions.status` to `GRADED_OPEN_WINDOW`.
  - Fixed `mapScorecardToFactorKeys` to capture all 4 active Layer 2 signals (including `openingFlow`), fixed `gradePendingPredictions` to prefer 1m bars and frozen ATR with a post-10:20 ET gate, and fixed `STAND ASIDE / HIGH VOL` grading to verify two-way whipsaws and compressed chop accurately.
- **Verification:**
  - `npx tsc --noEmit`: 0 TypeScript errors.
  - `npm test`: 17/17 test files and **122/122 tests passing** (including `src/__tests__/revamp_features.test.ts`).
  - `npm run build`: all 21 routes compiled cleanly.
  - Live Supabase verification confirmed `2026-11-24` re-graded accurately (`GRADED_OPEN_WINDOW`, `bias_correct: true`, `chop_warning_correct: true`).

## [2026-11-24] - Login-Only Auth & Quant Math Collapsed by Default
- **Login-Only Gate (`src/app/login/page.tsx`):** Removed public sign-up option and toggle; users are provisioned manually via Supabase.
- **Quieter Initial Dashboard (`src/components/Dashboard.tsx`):** Collapsed `showQuantMath` to `false` by default on login so traders see only the bias verdict, chart, bounce areas, and target areas first, with one-click `"Show Quant Math"` on demand.

## [2026-11-24] - Target-First Ordering, Price Ladder Default & Clearer Bias Copy
- **Areas To Target Above Bounce Areas (`src/components/Dashboard.tsx`):** Reordered the right panel so `Areas To Target` appears above `Areas It Could Bounce From`.
- **Price Ladder Default (`src/components/KeyLevelsTable.tsx`):** Changed default `sortMode` to `"LADDER"` in `All Levels`.
- **Direct Plain-English Bias Copy (`src/lib/market/plainEnglishBrief.ts`):** Replaced academic/contradictory risk messaging (`TERM STRUCTURE BACKWARDATION... risk scaled to 0.5x` under `0x`) with direct explanations, `"NO CLEAR EDGE"`, `"STAY FLAT (0x SIZE)"`, and plain signal counts (`"Signals Split (X Bull, Y Bear)"`).

## [2026-11-24] - News Calendar Overhaul, Session Persistence Fix & Audit Reliability
- **Fixed Unexpected Sign-Out Bug (`src/components/Header.tsx`, `src/app/auth/signout/route.ts`):**
  - Root cause: `<Link href="/auth/signout">` triggered Next.js background prefetching against `GET /auth/signout`, which immediately invoked `supabase.auth.signOut()` right after login.
  - Removed the `GET` handler from `/auth/signout` (now `POST`-only) and replaced the navbar `<Link>` with an explicit `POST` sign-out button handler.
- **News Calendar (`src/app/calendar/page.tsx`, `src/components/Header.tsx`):**
  - Renamed `Calendar` / `Economic Calendar` to `News Calendar`.
  - Set default view filter to `This Week` (`"ALL"`), and minimized days whose events have all passed (`PASSED` collapsible header cards).
- **Audit Reliability & Automation (`vercel.json`, `src/lib/market/service.ts`, `src/app/api/cron/snapshot-and-grade/route.ts`, `src/app/performance/page.tsx`):**
  - Added `vercel.json` weekday cron (`25 14 * * 1-5`) targeting `/api/cron/snapshot-and-grade`.
  - Expanded pre-market immutable freeze window to full `PRE_MARKET_LOCK` (`08:30–09:29 ET`) + `NY_OPEN_WINDOW` (`09:30–09:59 ET`), and added explicit API error display in `/performance`.

## [2026-11-24] - Futures Day-Trading Gameplan Section
- **Added 3-Column Futures Gameplan (`src/lib/market/plainEnglishBrief.ts`, `src/components/Dashboard.tsx`):**
  - **Wait for Stop Hunt?**: Live guidance on whether to wait for an overnight high/low liquidity sweep before entering.
  - **Stop Loss Placement**: Recommends `AT THE WICK (+2–3 pts)` vs `GIVE EXTRA ROOM (+5–8 pts past wick)` based on VRP, term structure, GEX, and 15m ATR.
  - **Key Futures Notes Today**: Concise reminders for timing, red-folder news proximity, take-profit style (positive vs negative gamma), and risk sizing.
- **Minimizable Gameplan & Realistic 15m Swing ATR (`src/components/Dashboard.tsx`, `src/lib/market/plainEnglishBrief.ts`):** Added persistent Minimize/Show toggle for the Futures Gameplan strip and switched 15m swing display to `atr15mIntraday` so outlier opening-bar spikes don't overstate 15m range.
