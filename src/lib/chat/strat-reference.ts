import fs from "node:fs";
import path from "node:path";

export const STRAT_CORE_PLAYBOOK = `## THE STRAT (ROB SMITH) CORE METHODOLOGY FOR NQ / MNQ FUTURES

### 1. Universal Candle Scenarios (Bar-by-Bar Price Action)
Every completed candlestick is strictly classified into one of three scenarios relative to the immediately preceding candle:
- **Scenario 1 (Inside Bar — Consolidation / Equilibrium):** Current High <= Prior High AND Current Low >= Prior Low. Price is coiling inside the prior bar's range; energy is building for range expansion.
- **Scenario 2 (Directional Bar):** Breaks only ONE side of the prior bar.
  - **2U (Two Up):** Current High > Prior High AND Current Low >= Prior Low (directional bullish expansion).
  - **2D (Two Down):** Current Low < Prior Low AND Current High <= Prior High (directional bearish expansion).
- **Scenario 3 (Outside Bar — Broadening Formation / Range Expansion):** Current High > Prior High AND Current Low < Prior Low. Price took out both sides of the prior candle, expanding range and creating a broadening formation on lower timeframes.

### 2. Actionable Strat Combos & Triggers
A setup triggers when price breaks the high or low of the trigger candle in alignment with higher-timeframe continuity:
- **2-1-2 Reversal (High-Probability Trend Turn):**
  - *Bullish 2D-1-2U:* Down bar (2D) -> Inside consolidation bar (1) -> Break above the 1-bar high (2U). Invalidation: below the 1-bar low (tight) or 2D low (structural).
  - *Bearish 2U-1-2D:* Up bar (2U) -> Inside consolidation bar (1) -> Break below the 1-bar low (2D). Invalidation: above the 1-bar high (tight) or 2U high (structural).
- **2-1-2 Continuation (Trend Expansion):**
  - *Bullish 2U-1-2U* or *Bearish 2D-1-2D:* Brief inside-bar pause followed by break in the original trend direction.
- **3-1-2 Reversal / Continuation:**
  - Outside bar (3) sweeps both sides -> Inside bar (1) absorbs volatility -> Break of the 1-bar triggers expansion (2U or 2D). Often marks institutional liquidity sweeps into key levels (ONH/ONL/PDH/PDL).
- **1-2-2 RevStrat (Failed Breakout Trap):**
  - Inside bar (1) -> False break out one side (2D or 2U) that fails to follow through -> Reverses hard through the opposite side of the 2-bar (2U or 2D) targeting the 1-bar's opposite extreme and beyond.
- **3-2-2 / 2-2 Reversal:**
  - Failed directional move (e.g., 2U into resistance fails and next bar breaks below prior bar's low for 2D). Hammer (long lower wick) and Shooter (long upper wick) candles act as prime 2-2 reversal triggers when backed by FTFC.
- **Broadening Formations & Pivot Machine Guns (PMG):**
  - Sequence of higher highs and lower lows (expanding megaphone) — price naturally seeks the opposing trendline/magnitude target once an extreme rejects.
  - **PMG (Pivot Machine Gun):** 5+ consecutive higher lows (bearish PMG fuel) or lower highs (bullish PMG fuel) stacking resting stops for a fast momentum sweep.

### 3. Full Timeframe Continuity (FTFC)
- **Definition:** Compare current price against the **Open** of each timeframe in the stack: **Monthly (M), Weekly (W), Daily (D), 4H / 60m, 15m, 5m, 1m**.
- **Green Continuity (Bullish FTFC):** Price > Open across the higher timeframes (e.g., M/W/D/60m all green). Favor 2U continuations and bullish 2-1-2 / 3-1-2 reversals; avoid fighting full green FTFC with counter-trend shorts unless at a major HTF broadening extreme.
- **Red Continuity (Bearish FTFC):** Price < Open across M/W/D/60m. Favor 2D continuations and bearish 2-1-2 / 3-1-2 reversals.
- **Conflicted Timeframes (Mixed FTFC):** E.g., Daily green vs 60m/15m red -> signals range/chop or an intraday pullback inside a higher-timeframe impulse. Wait for lower-timeframe reversal (e.g., 5m/15m 2-1-2) to flip back in line with HTF continuity at a MinBook structural level (VWAP, ON Mid, PDC, Prior POC/VAL/VAH).

### 4. Trade Management & Magnitude Rules
- **Targets (Magnitude):** In The Strat, the primary target of a reversal is the high/low of the preceding bar(s) creating the broadening magnitude (e.g., the 2-bar extreme or prior swing pivot / MinBook liquidity magnet like ONH/ONL/PDH/PDL).
- **Hard Invalidation:** Placed strictly beyond the opposite side of the trigger candle (or inside bar) — if price violates the opposite side of a 2-1-2 trigger, the setup thesis is dead (become a 3-bar outside bar instead of clean continuation).
- **MinBook Synergy:** Always align Strat triggers with MinBook's 09:30–09:33 ET observation lock, 09:34–09:50 ET execution window, Layer 1 Volatility/GEX risk gates, and honest live/delayed feed status.`;

let cachedRepoDocs: string | null = null;

export function loadRepoResearchDocs(): string {
  if (cachedRepoDocs !== null) {
    return cachedRepoDocs;
  }

  const sections: string[] = [];

  const appendDoc = (fullPath: string, label: string, title: string, maxChars: number) => {
    try {
      if (!fs.existsSync(fullPath)) return;
      const raw = fs
        .readFileSync(fullPath, "utf8")
        .split("\n")
        .filter(
          (line) =>
            !line.includes("1 Trade Per Day") &&
            !line.includes("$200–$300") &&
            !line.includes("Apex_Intraday") &&
            !line.includes("TPT_PRO_Intraday") &&
            !line.includes("MFFU_Rapid_Intraday")
        )
        .join("\n")
        .trim();
      if (!raw) return;
      const excerpt = raw.length > maxChars ? `${raw.slice(0, maxChars)}\n...[truncated]` : raw;
      sections.push(`### ${title} (${label})\n${excerpt}`);
    } catch {
      // Ignore unreadable doc files gracefully
    }
  };

  appendDoc(
    path.join(process.cwd(), "docs", "methodology.md"),
    "docs/methodology.md",
    "MinBook v3.0 Quantitative Methodology",
    4500
  );

  cachedRepoDocs = sections.join("\n\n");
  return cachedRepoDocs;
}
