# OpenPulse ⚡

> **Pre-Market & NY Open Bias, Key-Levels, and Stop-Risk Briefing Web App for NQ Futures Traders**

Designed specifically for traders executing **1 trade per day on NQ / MNQ**, looking for **higher-timeframe (HTF) continuation** and entering on a **retrace between 9:30 AM and 10:00 AM ET (NY open)**, risking **$200–$300** to make **$500–$600** (~2R–3R).

---

## Key Features

1. **9:30 AM Open Briefing Dashboard (`/`)**:
   - **Real-Time ET Clock & Open Window Pulse**: Digital Eastern Time clock with an animated glow indicator during the critical **9:30 AM – 10:00 AM ET NY Open Retrace Window**.
   - **Bias & Continuation Confirmation**: Synthesizes HTF trend, overnight inventory imbalance (% volume above/below PDC), London session reactions, and VWAP acceptance into a clear plain-English verdict (`CONTINUATION FAVORED (BULLISH)`, `CONTINUATION FAVORED (BEARISH)`, `CAUTION / CHOP RISK`, or `STAND ASIDE / HIGH VOL`).
   - **Stop-Out & Volatility Risk Engine**: Evaluates whether current 15-minute ATR noise threatens to prematurely clip a standard $200–$300 stop on 1 NQ contract, and recommends precision MNQ scaling alternatives.
   - **Key Reference Levels Table**: Prior Day High/Low/Close/Mid, Overnight High/Low/Mid, London High/Low, Session VWAP, and HTF 50% & 61.8% Golden Pocket Retrace Zones with distance in points and one-click export for TradingView, NinjaTrader 8, and Tradovate.
   - **9:30–10:00 AM Execution Checklist**: 7-point interactive gate enforcing the 1 trade/day discipline (e.g. waiting for the initial 1–3 min opening drive to form rather than chasing tick 1).

2. **Friends & Shared Daily Briefs (`/briefs`)**:
   - Shareable daily snapshots with custom room links for friends (e.g., Minsung, Alex, Jordan).
   - **One-Click Discord / Telegram Trade Memo Generator**: Copies a clean formatted markdown summary ready to paste into group chats before the bell.

3. **Post-Trade MAE / MFE Journal (`/journal`)**:
   - 30-second post-trade logger recording **Maximum Adverse Excursion (MAE in R)** and **Maximum Favorable Excursion (MFE in R)**.
   - **Empirical Drawdown Analytics Engine**: Answers the critical question: *"How much adverse heat do winning continuation trades experience before reaching target?"* (e.g., discovering that 80%+ of winning continuation trades suffer less than 0.5R MAE, providing empirical justification to cut trades that stall deep in the red).

4. **Settings & Prop Guardrails (`/settings`)**:
   - Personal and friend profile budgets, prop firm drawdown alerts, and market data API key settings.

---

## Tech Stack & Data Integrity

- **Frontend:** Next.js 16+ (App Router), TypeScript, Tailwind CSS v4, Lucide Icons.
- **Backend:** Next.js Route Handlers with in-memory TTL caching to protect third-party rate limits.
- **Persistence:** Node 24 native SQLite (`node:sqlite`) database (`data/openpulse.db`) with zero external native compilation friction.
- **Honest Market Data Integration:**
  - Pluggable `MarketDataProvider` architecture supporting **Yahoo Finance** (free out-of-the-box), **Polygon.io** (via API key), and **Seed Fallback Mode**.
  - Transparent staleness and source badges on every print: `LIVE`, `DELAYED`, `DERIVED`, `MANUAL INPUT`, `SAMPLE`.

---

## Quickstart

### 1. Installation & Local Dev
```bash
# Install dependencies
npm install

# Start local development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Market Data Configuration (.env.local)
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Settings available:
- `MARKET_DATA_PROVIDER=yahoo`: Default free market data for `NQ=F`, `^VIX`, `^TNX`, `DX-Y.NYB`, and mega-caps.
- `POLYGON_API_KEY=your_key`: (Optional) Add your Polygon.io key for dedicated real-time or delayed aggregate feeds.
- `CACHE_TTL_SECONDS=60`: Server cache duration (prevents API rate limit burns).
- `DATABASE_PATH=./data/openpulse.db`: SQLite database location.

---

## Architecture & Repo Hygiene

- `AGENT.md`: Operational architecture, domain model, and trading rules.
- `.ai/changelog.md`: Detailed changelog of every architectural step and verification milestone.
