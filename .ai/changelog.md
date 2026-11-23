# OpenPulse Changelog

All notable changes and architectural decisions are logged here.

## [2026-11-23] Initial Architecture & Scaffolding
- Initialized Next.js 16 (App Router) project with TypeScript and Tailwind CSS v4.
- Installed `lucide-react` for high-contrast financial terminal iconography.
- Tested Node 24 native `node:sqlite` (`DatabaseSync`), confirming fast zero-dependency local SQLite persistence.
- Created `AGENT.md` and `.ai/changelog.md` tracking architecture, operational principles, and development progress.
- Outlined pluggable `MarketDataProvider` interface supporting Yahoo Finance, Polygon.io, and SeedFallback with honest data status badging.

## [2026-11-23] Database & Persistence Layer (`src/lib/db/index.ts`)
- Configured Node 24 native SQLite database at `data/openpulse.db`.
- Created relational schema:
  - `profiles`: Multi-user / friend profiles with custom risk budget ($200–$300), target ($500–$600), instrument, and prop drawdown guardrails.
  - `trades`: Trade logs with Maximum Adverse Excursion (MAE in R) and Maximum Favorable Excursion (MFE in R).
  - `daily_briefs`: Snapshots of computed session metrics and key levels.
  - `checklists`: Pre-market and NY open 9:30–10:00 AM checklist states.
- Seeded initial profiles (Minsung, Alex, Jordan) and historical baseline trades demonstrating MAE/MFE statistical patterns.

## [2026-11-23] Real Market Data & Key Levels Engine (`src/lib/market/`)
- Built `MarketDataProvider` interface:
  - `YahooFinanceProvider`: Public live/delayed chart & quote feed for `NQ=F`, `MNQ=F`, `QQQ`, `^NDX`, `^VIX`, `^TNX`, `DX-Y.NYB`, and Tech Mega-Caps (`AAPL`, `NVDA`, `MSFT`, `AMZN`, `META`, `GOOGL`).
  - `PolygonProvider`: Configured via `POLYGON_API_KEY` in `.env.local` for Polygon equities and indices.
  - `SeedFallbackProvider`: Realistic structured session fallback mode with explicit `SAMPLE` badge if remote APIs rate limit or internet is offline.
  - `CachedMarketDataService`: In-memory server cache with configurable TTL (default 60s) to prevent burning API rate limits.
- Developed `levels.ts`:
  - Computes Prior Day High (PDH), Prior Day Low (PDL), Prior Day Close (PDC), Prior Day Midpoint (PD Mid).
  - Computes Overnight (Globex) Session High (ONH), Overnight Low (ONL), Overnight Midpoint.
  - Computes London session High/Low (03:00–08:30 ET) and Asia session High/Low (18:00–02:00 ET).
  - Computes Session Volume Weighted Average Price (VWAP) and HTF 50% & 61.8% Golden Pocket Retrace Zones.
  - Calculates point and percentage distance from current price.
- Developed `regime.ts`:
  - Plain-English bias engine synthesizing overnight inventory imbalance, VWAP acceptance, London reaction, and chop risk.
  - Generates actionable retrace entry zone (e.g. 9:34–9:50 AM ET window).
- Developed `risk.ts`:
  - Volatility-adjusted stop-loss risk & position sizing engine.
  - Converts dollar risk budget ($200–$300) into NQ points ($20/pt) and MNQ points ($2/pt).
  - Flags stop-clipping vulnerability if 15-min ATR > max allowable stop on 1 NQ contract, with explicit downscaling advice to MNQ for wider breathing room.

## [2026-11-23] API Route Handlers
- Created `/api/market-data`: Returns quote, session metrics, key levels, bias, stop risk, macro data, and provider status.
- Created `/api/briefs`: Manages daily snapshots and shareable briefs.
- Created `/api/journal`: Manages trade logs and computes empirical MAE/MFE analytics (distribution of adverse drawdown on winning continuations, profit factor, expectancy).
- Created `/api/settings`: Manages trader profiles and risk guardrails.
- Created `/api/checklist`: Syncs 9:30 AM execution checklist state.

## [2026-11-23] Frontend Terminal UI Components & Pages
- Developed dark terminal UI with high-contrast palette (`#090d16` background, cyan/emerald accents, rose risk alerts).
- `Header.tsx`: Real-time ET clock with glowing pulse during active NY Open Retrace Window (9:30–10:00 AM ET), live/delayed provider badges, instrument switcher, profile selector.
- `MacroRegimeStrip.tsx`: Live NQ ticker, VIX regime pill, 10Y Yield, DXY, Tech Mega-Caps breadth, and economic news alerts.
- `BiasCard.tsx`: High-contrast bias status banner, plain-English executive summary, structural drivers, ideal 9:34–9:50 AM retrace zone.
- `StopRiskCard.tsx`: Interactive risk budget ($200–$300) and target ($500–$600) sliders, stop clipping warning, position sizing matrix.
- `KeyLevelsTable.tsx`: Full key levels table with distance, role badges (`LIQUIDITY POOL`, `RETRACE ZONE`, `EQUILIBRIUM`, `MAGNET`, `INVALIDATION`), and one-click copy for TradingView, NinjaTrader 8, and Tradovate.
- `ChecklistCard.tsx`: Interactive 7-point 9:30–10:00 AM execution discipline checklist with progress bar.
- `/briefs/page.tsx`: Shared morning briefs, friends room tabs (Minsung, Alex, Jordan), and one-click Discord/Telegram markdown trade memo generator.
- `/journal/page.tsx`: 30-second post-trade logger with MAE (drawdown heat) and MFE (peak profit), empirical MAE analytics engine, and trade log table.
- `/settings/page.tsx`: Risk guardrails, prop drawdown limits, friend profiles, and market data API configuration instructions.

## Verification & Status
- `npx tsc --noEmit` passed with 0 errors.
- `npm run build` compiled all static and dynamic pages with 0 errors.
- Verified live HTTP 200 OK responses on `/`, `/briefs`, `/journal`, `/settings`.
- Verified `/api/market-data`, `/api/journal`, `/api/settings`, `/api/checklist`, `/api/briefs`.
- Verified honest fallback and staleness indicators (`SAMPLE`, `DELAYED`, `DERIVED`, `LIVE`).
