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
