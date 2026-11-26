# AGENT.md - MinBook Architecture & Operational Guide

## Overview
**MinBook** is a multi-user 24/5 quantitative futures bias, key-levels, interactive charting, screenshot P&L journaling, AI scalping co-pilot, and self-audit terminal for **CME Nasdaq-100 (`NQ` / `MNQ`)** across **Asia**, **London**, and **New York** sessions.

## Core Principles
- **Two-Layer Separation (Risk vs. Direction):** Non-directional regime/volatility risk gates (`Layer 1`) scale sizing (`1.0x`, `0.5x`, `0.0x`) and cap targets independently from the 4 orthogonal directional signals (`Layer 2`).
- **Plain English First, Math On Demand:** `/` leads with clear bias (`BULLISH`, `BEARISH`, `NO CLEAR EDGE`), 1H/4H/Day horizon outlooks, a 3-column Futures Gameplan, the interactive candlestick chart, **Areas To Target**, and **Areas It Could Bounce From**. The 7 quantitative proof cards stay collapsed behind `Show Quant Math` (`showQuantMath: false` by default).
- **Multi-User Neutrality:** No hardcoded personal daily loss caps or mandatory "1 trade per day" rules in `/chat` or shared market briefs; risk math scales dynamically per account mode (`INTRADAY_UNREALIZED`, `EOD_TRAILING`, `CASH_LIVE`), per-contract tick value (`NQ $20/pt`, `MNQ $2/pt`), or `/settings`.
- **Zero Synthetic Truth & Strict Data Honesty:** No fabricated audit rows or synthetic journal seeds. Every quote, level, and chart snapshot carries its `source`, exchange `timestamp`, and staleness badge (`FRESH`, `DELAYED`, `STALE`, `SAMPLE`).
- **Plain-English Risk Copy:** Describe sudden two-sided stop sweeps in plain English rather than jargon like "whipsaw".

---

## Tech Stack
- **Framework:** Next.js `16.4.6` (App Router, Turbopack, `src/proxy.ts`) + React `19.3.0` + TypeScript `5`.
- **Styling & UI:** Tailwind CSS v4 (`@tailwindcss/turbopack`), shadcn/ui + `@base-ui/react`, `lucide-react`, dark terminal palette (`#09090b` canvas, `#111113` surface, `border-zinc-800/80` hairline borders, Geist Mono `tabular-nums` for prices, deltas, and R-multiples).
- **Charting:** TradingView Lightweight Charts v5 (`lightweight-charts@^5.3.0`) with custom `ISeriesPrimitive` canvas layers (`src/components/chart/primitives.ts`).
- **AI & Vision:** Vercel AI SDK v7 (`ai`, `@ai-sdk/react`, `@ai-sdk/google` using `gemini-2.5-flash-lite` primary with `gemini-2.5-flash` 429 fallback) + `tesseract.js` client/server OCR.
- **Database & Auth:** Supabase (`@supabase/ssr`, `@supabase/supabase-js`) Postgres + Auth + private Storage, with automatic Node 24 native `node:sqlite` (`data/minbook.db`) fallback when Supabase env vars are omitted.
- **Testing:** Vitest v5 (`vitest.config.mts`).

---

## Quantitative & Market Data Architecture (`src/lib/market/`)

### 1. Data Ingestion & Freshness (`provider.ts`, `yahoo.ts`, `polygon.ts`, `fallback.ts`, `service.ts`)
- Primary free feed via `yahoo-finance2` (`NQ=F`, `MNQ=F`, `ES=F`, `ZN=F`, `DX-Y.NYB` / `DX=F`, `QQQ`, `^VXN`, `^VIX`, `^VIX3M`, `^VIX9D`, `^VIX1D`, `^VVIX`, `^TNX`) with optional Polygon adapter (`MARKET_DATA_PROVIDER`).
- `/api/market-data`, `/api/market-data/chart`, and `/api/calendar` enforce `export const dynamic = "force-dynamic"` and `Cache-Control: no-store` so live dashboard refreshes (`30s` auto-sync paused when `document.hidden`) never receive stale CDN-cached bias.
- Displays live exchange delay warnings when `exchangeDataDelayedBy > 0` during RTH, alongside `QQQ` live equity proxy direction/VWAP context.

### 2. 24/5 CME Session Clock & Multi-Timezone Engine (`sessionClock.ts`, `timezone.ts`, `src/context/TimezoneContext.tsx`)
- Trade date rolls on CME Futures hours (`17:00–18:00 ET` break/rollover) rather than calendar midnight, with DST-safe UTC epoch conversions in `America/New_York`.
- Tracks live 24/5 sessions: `ASIA` (18:00–02:59 ET), `LONDON` (03:00–08:29 ET), `NY_PREMARKET` (08:30–09:29 ET), `NY_AM` (09:30–11:59 ET), `NY_LUNCH` (12:00–13:29 ET), `NY_PM` (13:30–15:59 ET), `POST_CLOSE` (16:00–16:59 ET), `CME_BREAK` (17:00–17:59 ET), and `WEEKEND` (Fri 17:00 – Sun 17:59 ET).
- Includes 2024–2028 CME full-closure holidays and half-days plus `getUpcomingCalendarSchedule` (5-day ET lookahead).
- Synchronized `[ ET | CT | PT ]` timezone switcher persisted in `localStorage`, updating header clocks, session countdowns, chart x-axis/crosshair formatting, and news calendar times.

### 3. Session Levels, Market Profile & SMT (`levels.ts`)
- **Deterministic Prior-Day Slicing:** Matches completed daily bars strictly before `targetTradeDate` (`barDate < targetTradeDate`) so evening Globex bars never corrupt `PDH`, `PDL`, `PDC`, or `pdMid`.
- **Globex & Sub-Sessions:** Slices overnight bars `[18:00 ET, 09:30 ET)` with an Early-Globex guard (`< 2` bars -> `INITIALIZING`, 50% `BALANCED` inventory), plus `Asia High/Low`, `London High/Low`, and active NY RTH `Day High/Low`.
- **Value Area & VWAP:** Computes prior-day RTH Market Profile (`VAH`, `POC`, `VAL`) and separate Globex/Prior-RTH/RTH VWAP anchors with `TWAP FALLBACK` when volume is unavailable.
- **Causal Replay Slicing:** `computeSessionLevels` accepts `nowInput?: Date` for zero-lookahead historical reconstruction.
- **Cross-Index SMT Divergence:** Compares `NQ=F` vs `ES=F` swing highs and lows across sessions to detect Bullish/Bearish SMT non-confirmation.

### 4. Volatility Surface, Expected Move & Math (`math.ts`, `regime.ts`)
- **Realized Volatility:** Annualized Garman-Klass and drift/jump-adjusted Yang-Zhang (`10d` & `20d`) estimators.
- **Variance Risk Premium & Vol Surface:** `VRP Ratio = VXN / RealizedVol_YZ_20d`, `Term Ratio = VIX / VIX3M` (Backwardation `> 1.0` vs Contango), `Short-Term Shock = VIX9D / VIX` (`> 1.15`), `^VVIX`, and 60-day rolling Pearson correlation between `NQ` and `^TNX`.
- **Expected Move (`252`-day scaling) & Diurnal Clock:**
  - Daily 1-SD Move = `PDC * (IV / 100) / sqrt(252)`; Expected Straddle = `ExpectedMove1SD * sqrt(2 / pi)` (`~0.7979x`, labeled honestly as `~57.5%` Normal coverage).
  - `computeDiurnalExpectedMove` models the 390-minute RTH diurnal volatility clock (`v(u) = 1 + 3*exp(-u/0.05) + 1.2*exp(-(1-u)/0.04)`) for Open vs Lunch vs PM stretch.
- **HTF Fibonacci Engine:** Timestamp-ordered 5-day impulse (`0.382`, `0.500`, `0.618`, `0.705` OTE).

### 5. Delayed Dealer Gamma (GEX) & 1m Flow Proxy (`gex.ts`, `footprint.ts`)
- **GEX (`gex.ts`):** Pulls delayed Cboe `_NDX.json` / `QQQ.json` option chains (15-min cache) with `yahoo-finance2` fallback + server-side Black-Scholes Gamma. Translates `gammaFlipNq`, `callWallNq`, and `putWallNq` into `NQ=F` points via live basis ratio. Labeled `DELAYED OI-BASED GEX ESTIMATE (NOT LIVE DEALER INVENTORY)`.
- **1m Flow Proxy (`footprint.ts`):** Ingests delayed `1m` `NQ=F` bars (15s cache, `forceRefresh` per symbol), computes Close Location Value (`CLV`), candle delta, 2.5-pt POC bins, Globex & RTH CVD, `ABS BUY`/`ABS SELL`, `IMP+`/`IMP-`, and `CVD DIV` markers. Labeled `Free 1m-Derived Intrabar Delta Proxy (Delayed — Not CME L2 Tick Flow)`.

### 6. Two-Layer Decision Engine & Plain-English Brief (`riskGates.ts`, `directionalScore.ts`, `plainEnglishBrief.ts`, `playbook.ts`, `replay.ts`)
- **Layer 1 Risk Gates (`riskGates.ts`):** Evaluates overnight inventory reversal vetoes (`>=70%` below ON Mid / `<=30%` above ON Mid), `VRP Ratio < 1.0`, term backwardation (`VIX/VIX3M > 1.0`), `VIX9D/VIX > 1.15`, `VVIX >= 110`, GEX pinning/dispersion, and **Tier-1 Red-folder-only** US news proximity. Outputs `sizeMultiplier` (`1.0x`, `0.5x`, `0.0x`) and `targetCapMultipleR`.
- **Layer 2 Directional Score (`directionalScore.ts`):** Combines at most 4 orthogonal signals (`compositeLocation`, `smtBreadth`, `macroImpulse`, `openingFlow`), baseline `1.0` weights.
- **Plain-English Brief (`plainEnglishBrief.ts`):** Produces `BULLISH` / `BEARISH` / `NO CLEAR EDGE`, 3-column Futures Gameplan (Wait for Stop Hunt?, Stop Loss Placement `AT THE WICK (+2–3 pts)` vs `GIVE EXTRA ROOM (+5–8 pts)`, Key Futures Notes), `horizonPredictions` (`1H`, `4H`, `DAY`) supporting direct pump/dump calls on runaway/stretched momentum and enforcing `>= 5` pt separation for pullback targets, deduplicated **Areas To Target** & **Areas It Could Bounce From**, and 7 collapsed Quant Math proof cards.
- **12H Hour-by-Hour Replay (`replay.ts`):** `build12HourReplayFrames` builds causal hourly checkpoints across the past 12 active trading hours directly from intraday bars (`Reveal After` chart toggle + `REPLAY` marker).

---

## Interactive Charting & Drawings (`src/components/chart/MinBookChart.tsx`, `primitives.ts`)
- **Lightweight Charts v5 Compliance:** Dynamically imported `'use client'` component (`ssr: false`); uses `chart.addSeries(CandlestickSeries, ...)`, `chart.addSeries(LineSeries, ...)`, `createSeriesMarkers(...)`, and `CrosshairMode.Normal`.
- **Timeframes:** `5m`, `15m`, `1h` (30d), and `4h` (45d `1h` bars aggregated via `aggregate1hTo4hBars` anchored to `18:00 ET`).
- **Overlays (Quiet by Default):** `liquidity`, `retrace`, `vwap`, `zones`, `subSessions`, `volatility`, `gex`, `footprint`, `smt`, plus floating HUDs initialize off by default and toggle on demand from the toolbar; includes SMT dotted trendlines (`LineStyle.Dotted`).
- **Manipulable Drawing Tools:** `UserDrawingsPrimitive` with bar-index (`logical`) coordinate drag/resize (`applyDrawingDragLogical`, `hitTestScreenBoxes`) so drawings stay aligned across CME daily breaks (`17:00–18:00 ET`) and weekends:
  - `Line`: `0.25`-tick snapped horizontal line with native price-axis tag and inline exact-price edit.
  - `Square`: Click-drag or two-corner rectangle with `NW`/`NE`/`SW`/`SE` + `N`/`S`/`E`/`W` resize handles synced across timeframes and right-hand projection whitespace.
  - `Type`: Anchored text annotation with inline edit.
  - Supports select/drag/resize, 4 colors (`CYAN`, `EMERALD`, `ROSE`, `AMBER`), `Undo`, `Clear`, `Delete`/`Backspace`, and `localStorage` persistence per instrument (`NQ`/`MNQ`).

---

## Risk, Execution & Screenshot P&L Journal
- **Execution & Drawdown Policy (`src/lib/execution/ltfExecution.ts`, `src/lib/risk/sizing.ts`, `src/lib/risk/propProfile.ts`):**
  - Absorbing double-barrier Markov solver (`computeDoubleBarrierHitProbability`: `P(hit TP before -SL)`).
  - Volatility-scaled stop bounds (`computeVolatilityScaledStopRange`: `clip(0.35 * atr5mDiurnal, 0.0004 * spot, 0.0012 * spot)`) and fixed-risk-unit MNQ sizing.
  - Account drawdown exit policy (`computeDrawdownExitPolicy`) tailored to `INTRADAY_UNREALIZED`, `EOD_TRAILING`, or `CASH_LIVE`.
- **Screenshot-Only P&L Journal (`/journal`, `src/lib/journal/pnlOverlayReader.ts`, `src/lib/journal/store.ts`, `src/lib/db/index.ts`):**
  - Upload, drag-and-drop, or `Cmd+V` paste broker/chart screenshots. Pixel clustering detects green/red P&L overlays and extracts realized P&L via `Tesseract.js` OCR (`parsePnlFromText`) with optional Gemini Vision fallback in `/api/journal/analyze`.
  - Stored in Supabase `journal_trades` + private `journal-screenshots` bucket (signed URLs) with local SQLite fallback.
  - Bootstrap upper P90 MAE stop calibration (`computeBootstrapUpperP90`, 1,000 resamples) remains strictly gated until `N >= 150` total trades AND `>= 75` winning trades.

---

## Multimodal NQ/MNQ Strat & Scalping Co-Pilot (`/chat`)
- **4-Step Sequential Backend Pipeline (`src/lib/chat/scalp-pipeline.ts`, `screenshot-quant.ts`, `journal-ingest.ts`, `build-market-context.ts`, `strat-reference.ts`, `src/app/api/chat/route.ts`):**
  1. `extract_chart_state(image)` — extracts live price, instrument, entry/SL/TP/zones, and timeframe from chart screenshots.
  2. `compute_scalp_verdict` (`runMinBookQuantAnalysis` tool) — deterministic R:R, break-even win rate, double-barrier odds, live screenshot price re-anchoring (`feedDeltaPts`), `> 90s` stale backend feed guard, pending limit setup evaluation (`PENDING_LIMIT_ORDER` vs chased market entry), and Break-Even / Partials vs Full TP `tradeManagement`.
  3. `query_personal_journal` — queries the user's `journal_trades` (including imported Google Slides PDF / CSV / JSON trades via `/api/chat/journal-import`) with Bayesian shrinkage (`n < 10`) and tilt warnings (`>= 2` consecutive losses).
  4. `render_scalper_card` — streams responses grounded strictly in deterministic quant outputs.
- **Modes & Resilience:**
  - `Auto` (default: `LIVE_SCALP` 09:20–16:00 ET with 5-line card for screenshots/explicit setups, while `isConversationalAssistantQuery` routes normal text/planning/calendar questions to full conversational replies), `Quick Scalp`, and `Deep Dive`.
  - Injects `getUpcomingCalendarSchedule` + live `economicCalendar` events into chat context for holiday/half-day/news awareness.
  - Primary model `gemini-2.5-flash-lite` -> automatic fallback to `gemini-2.5-flash` on `429` -> deterministic TypeScript responder (`buildDeterministicAssistantReply`) if quotas are exhausted.
- **On-Site Encrypted API Keys & Private Storage:**
  - Per-user Gemini keys validated against Google AI Studio and encrypted with AES-256-GCM (`key-crypto.ts`, `key-store.ts`, `MINBOOK_KEY_SECRET`, `/api/chat/key`) into `user_ai_keys` (or SQLite fallback), with key redaction in error formatting.
  - Thread & message persistence (`chat_threads`, `chat_messages`) + private `chart-screenshots` Supabase bucket with `isAllowedChatImageUrl` SSRF protection and automatic signed-URL refresh.

---

## Self-Audit, 1m Triple-Barrier Grader & Bayesian Calibration (`/performance`)
- **Repository & Immutability (`src/lib/calibration/store.ts`):** `ICalibrationRepository` backed by Supabase (`daily_predictions`, `prediction_grades`, `model_weights_history`) or SQLite. Zero synthetic seed data; legacy synthetic rows are excluded.
- **Pre-Market Freeze & 1m Triple-Barrier Grader (`grader.ts`):**
  - Freezes immutable `daily_predictions` snapshots during `08:30–10:00 ET` (`PRE_MARKET_LOCK` + `NY_OPEN_WINDOW`).
  - Evaluates actual 1-minute NQ execution bars after `10:20 ET`: `HIT_TP1`, `HIT_TP2`, `STOPPED_OUT`, `TIME_EXIT` (10:00 ET), `NO_FILL`, plus `STAND ASIDE / HIGH VOL` chop/two-way-sweep verification, deducting round-trip commissions (`$1.30` MNQ) and 3-tick (`0.75 pt` / `$1.50`) opening slippage.
  - Computes strictly proper Brier Score and Logarithmic Score (`log_score`).
- **Closed-Form Beta-Binomial Bayesian Shrinkage (`optimizer.ts`):**
  - Prior $\alpha_0 = 25, \beta_0 = 25$ (50% prior mean, pseudo-sample 50), forgetting factor $\gamma = 0.99$, weights clamped to `[0.6, 1.5]`.
  - Calibration gate locks model weights at `1.0x` until `N >= 30` real graded sessions; `EDGE ENHANCER` / `NOISE DETRACTOR` status tags remain `NEUTRAL` until `N >= 60`.
- **Automated Weekday Cron (`vercel.json`):** `25 14 * * 1-5` UTC targeting `/api/cron/snapshot-and-grade` (protected by `CRON_SECRET`).

---

## News Calendar (`/calendar`)
- Pulls USD Red (High) and Orange (Medium) releases from Forex Factory delayed JSON via `/api/calendar` (`force-dynamic`, `no-store`).
- Defaults to `This Week` (`"ALL"`) with past days collapsed into `PASSED` drawers, multi-timezone display (`ET`/`CT`/`PT`), and mechanistic NQ impact notes.
- Only Tier-1 **Red-folder** releases trigger Layer 1 Risk Gate vetoes or stand-aside warnings; Orange releases surface in `imminentMedium` as minor spread-noise notes.

---

## Routes, API Surface & Persistence

### App Pages (`src/app/`)
- `/` (`page.tsx`) — Main 24/5 dashboard (Bias Hero, 1H/4H/Day Horizon Outlooks, 12H Hourly Replay, 3-column Futures Gameplan, Chart + Drawing Tools, Target/Bounce Areas, Price Ladder, collapsed Quant Math).
- `/chat` (`chat/page.tsx`) — Multimodal NQ/MNQ Strat & Scalping Co-Pilot workspace.
- `/journal` (`journal/page.tsx`) — Screenshot-only P&L journal + OCR + MAE sample calibration banner.
- `/performance` (`performance/page.tsx`) — Verified audit ledger, 4-factor track record, pending grader & Bayesian weights.
- `/calendar` (`calendar/page.tsx`) — Week-default US economic news calendar.
- `/settings` (`settings/page.tsx`) — Account risk defaults (`NQ`/`MNQ`), guardrails, and feed status.
- `/login` (`login/page.tsx`) — Invite-only Supabase email/password sign-in.

### API Routes (`src/app/api/` & `src/app/auth/`)
- Market & News (`force-dynamic`, `no-store`): `/api/market-data`, `/api/market-data/chart`, `/api/calendar`.
- Chat & Co-Pilot: `/api/chat`, `/api/chat/context`, `/api/chat/upload`, `/api/chat/threads`, `/api/chat/threads/[id]`, `/api/chat/key`, `/api/chat/journal-import`.
- Journal: `/api/journal`, `/api/journal/analyze`, `/api/journal/insights`.
- Calibration & Cron: `/api/calibration/audit`, `/api/calibration/freeze`, `/api/calibration/grade`, `/api/calibration/weights`, `/api/cron/snapshot-and-grade`.
- Account & Auth: `/api/settings`, `/api/checklist`, `/auth/signout` (`POST`-only to prevent Next.js `<Link>` prefetch sign-outs).

### Auth Proxy & Database Migrations
- **SSR Auth Proxy (`src/proxy.ts`):** Refreshes Supabase SSR sessions and redirects unauthenticated requests to `/login` for all routes except `/login`, `/auth/*`, `/api/market-data/*`, `/api/calendar/*`, and `/api/cron/*`. Bypassed automatically for local offline mode if `NEXT_PUBLIC_SUPABASE_URL` is unset.
- **Supabase Migrations (`supabase/migrations/`):**
  - `0001_init_minbook.sql` — `user_settings`, `journal_trades`, `daily_predictions`, `prediction_grades`, `model_weights_history`, `journal-screenshots` bucket + RLS.
  - `0002_expand_system_predictions_roles.sql` — Prediction/audit role policies.
  - `0003_audit_and_screenshot_journal.sql` — Triple-Barrier/Log Score columns + screenshot P&L overlay columns.
  - `0004_strat_ai_chat.sql` — `chat_threads`, `chat_messages`, `chart-screenshots` bucket + RLS.
  - `0005_user_ai_keys.sql` — `user_ai_keys` encrypted per-user Gemini keys + RLS.
  - `0006_journal_trades_scalp_fields.sql` — Scalp setup/import columns on `journal_trades`.

---

## Testing & Verification
- **Unit & Integration Test Suite (`src/__tests__/`):** **20 test files / 150 passing tests** via Vitest covering CME session clock & holidays/half-days, prior-day/Globex level invariants, Layer 1 & Layer 2 scoring, volatility estimators & diurnal expected move, GEX Black-Scholes & basis translation, 1m footprint/CLV/CVD divergence, SMT divergence, chart timestamp sanitization & drawing drag physics (`4h` aggregation), 12H causal replay & horizon outlooks, 1m Triple-Barrier grading & Beta-Binomial Bayesian shrinkage, double-barrier Markov odds, screenshot quant tool & `/chat` 4-step pipeline / AES-256-GCM keys, and adversarial edge cases.
- **Verification Commands:**
  - `npm test` (`vitest run`)
  - `npx tsc --noEmit`
  - `npm run build` (`next build`)
