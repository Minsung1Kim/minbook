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
