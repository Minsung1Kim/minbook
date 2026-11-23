import { OHLCVBar, KeyLevel, SessionMetrics, SMTDivergence } from "@/types/market";
import { computeHTFFibonacci, computeExpectedMove } from "./math";

export interface SMTInputData {
  quote?: { price: number };
  dailyBars?: OHLCVBar[];
  intradayBars?: OHLCVBar[];
}

export function computeSessionLevels(
  currentPrice: number,
  dailyBars: OHLCVBar[],
  intradayBars: OHLCVBar[],
  ivPct: number = 24.0,
  esData?: SMTInputData
): { sessionMetrics: SessionMetrics; keyLevels: KeyLevel[] } {
  // 1. Calculate Daily ATR(14) and Prior Day levels
  let pdh = currentPrice + 60;
  let pdl = currentPrice - 60;
  let pdc = currentPrice - 15;
  let atr14Daily = 160;

  if (dailyBars.length >= 2) {
    const priorDay = dailyBars[dailyBars.length - 2];
    pdh = priorDay.high;
    pdl = priorDay.low;
    pdc = priorDay.close;

    // Calculate ATR 14
    const trs: number[] = [];
    for (let i = 1; i < dailyBars.length; i++) {
      const prevClose = dailyBars[i - 1].close;
      const b = dailyBars[i];
      const tr = Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
      trs.push(tr);
    }
    const recentTrs = trs.slice(-14);
    if (recentTrs.length > 0) {
      atr14Daily = Math.round((recentTrs.reduce((a, b) => a + b, 0) / recentTrs.length) * 10) / 10;
    }
  }

  const pdMid = Math.round(((pdh + pdl) / 2) * 100) / 100;

  // 2. Compute 15-minute ATR
  const intradayTrs: number[] = [];
  for (let i = 1; i < intradayBars.length; i++) {
    const prevC = intradayBars[i - 1].close;
    const b = intradayBars[i];
    const tr = Math.max(b.high - b.low, Math.abs(b.high - prevC), Math.abs(b.low - prevC));
    intradayTrs.push(tr);
  }
  const recentIntradayTrs = intradayTrs.slice(-16);
  const atr15mIntraday = recentIntradayTrs.length > 0
    ? Math.round((recentIntradayTrs.reduce((a, b) => a + b, 0) / recentIntradayTrs.length) * 10) / 10
    : 24.5;

  // 3. Parse Intraday bars for Globex ([18:00, 09:30) ET), London ([03:00, 09:00) ET), Asia, and VWAPs
  let onh = currentPrice + 35;
  let onl = currentPrice - 40;
  let londonHigh = currentPrice + 25;
  let londonLow = currentPrice - 30;
  let asiaHigh = currentPrice + 10;
  let asiaLow = currentPrice - 20;

  let globexVwapSumPV = 0;
  let globexVwapSumV = 0;
  let globexTwapSum = 0;
  let globexBarCount = 0;

  let rthVwapSumPV = 0;
  let rthVwapSumV = 0;
  let rthTwapSum = 0;
  let rthBarCount = 0;

  let priorRthVwapSumPV = 0;
  let priorRthVwapSumV = 0;

  let abovePdcBars = 0;
  let totalOvernightBars = 0;

  let hasRealVolume = false;

  if (intradayBars.length > 0) {
    const globexHighs: number[] = [];
    const globexLows: number[] = [];
    const lonHighs: number[] = [];
    const lonLows: number[] = [];
    const asiaHighs: number[] = [];
    const asiaLows: number[] = [];

    // Analyze the last ~48 bars (12 hours of 15m bars covering entire Globex session)
    const recentBars = intradayBars.slice(-48);

    for (const b of recentBars) {
      const dt = new Date(b.timestamp);
      const hourStr = dt.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false });
      const minStr = dt.toLocaleString("en-US", { timeZone: "America/New_York", minute: "numeric" });
      const hourET = parseInt(hourStr, 10);
      const minET = parseInt(minStr, 10);

      const typPrice = (b.high + b.low + b.close) / 3;
      const vol = typeof b.volume === "number" && b.volume > 0 ? b.volume : 0;
      if (vol > 10) hasRealVolume = true;

      // Globex window strictly [18:00, 09:30) ET
      const isGlobex = hourET >= 18 || hourET < 9 || (hourET === 9 && minET < 30);
      const isRTH = (hourET === 9 && minET >= 30) || (hourET >= 10 && hourET < 16);

      if (isGlobex) {
        globexHighs.push(b.high);
        globexLows.push(b.low);
        totalOvernightBars++;
        if (b.close >= pdc) {
          abovePdcBars++;
        }

        globexVwapSumPV += typPrice * vol;
        globexVwapSumV += vol;
        globexTwapSum += typPrice;
        globexBarCount++;
      }

      if (isRTH) {
        rthVwapSumPV += typPrice * vol;
        rthVwapSumV += vol;
        rthTwapSum += typPrice;
        rthBarCount++;
      }

      // London session: approx 03:00 - 09:00 ET
      if (hourET >= 3 && hourET < 9) {
        lonHighs.push(b.high);
        lonLows.push(b.low);
      }

      // Asia session: approx 18:00 - 03:00 ET
      if (hourET >= 18 || hourET < 3) {
        asiaHighs.push(b.high);
        asiaLows.push(b.low);
      }
    }

    if (globexHighs.length > 0) onh = Math.max(...globexHighs);
    if (globexLows.length > 0) onl = Math.min(...globexLows);
    if (lonHighs.length > 0) {
      londonHigh = Math.max(...lonHighs);
      londonLow = Math.min(...lonLows);
    }
    if (asiaHighs.length > 0) {
      asiaHigh = Math.max(...asiaHighs);
      asiaLow = Math.min(...asiaLows);
    }
  }

  const onMid = Math.round(((onh + onl) / 2) * 100) / 100;

  // VWAP Anchors with volume integrity check
  const vwapCalculationMode: SessionMetrics["vwapCalculationMode"] = hasRealVolume ? "VOLUME_WEIGHTED" : "TWAP_FALLBACK";

  const globexVwap =
    hasRealVolume && globexVwapSumV > 0
      ? Math.round((globexVwapSumPV / globexVwapSumV) * 100) / 100
      : globexBarCount > 0
      ? Math.round((globexTwapSum / globexBarCount) * 100) / 100
      : onMid;

  const rthSessionVwap =
    hasRealVolume && rthVwapSumV > 0
      ? Math.round((rthVwapSumPV / rthVwapSumV) * 100) / 100
      : rthBarCount > 0
      ? Math.round((rthTwapSum / rthBarCount) * 100) / 100
      : globexVwap;

  const priorDayRthVwap = Math.round(((pdh + pdl + pdc) / 3) * 100) / 100;
  const sessionVwap = rthBarCount > 0 ? rthSessionVwap : globexVwap;

  // 4. Higher-Timeframe (HTF) Fibonacci Retracement & Impulse Direction
  const htfFib = computeHTFFibonacci(dailyBars);

  // 5. Implied Expected Move Bands (Rule of 16 + Straddle Proxy)
  const expectedMove = computeExpectedMove(pdc, ivPct);
  const overnightRange = Math.round((onh - onl) * 100) / 100;
  const safeStraddle = expectedMove.expectedMoveStraddle > 0 ? expectedMove.expectedMoveStraddle : 80;
  const overnightRangeConsumedPercent =
    Math.round((overnightRange / (2 * safeStraddle)) * 1000) / 10;

  // 6. Standardized Overnight Inventory (% of Globex bars closing above PDC)
  const inventoryPercent =
    totalOvernightBars > 0 ? Math.round((abovePdcBars / totalOvernightBars) * 100) : 50;

  let overnightInventory: SessionMetrics["overnightInventory"] = "BALANCED";
  if (inventoryPercent >= 70) overnightInventory = "BULLISH_IMBALANCE";
  else if (inventoryPercent <= 30) overnightInventory = "BEARISH_IMBALANCE";

  // Opening location relative to Globex range
  const openingGap = Math.round((currentPrice - pdc) * 100) / 100;
  let openingLocation: SessionMetrics["openingLocation"] = "AROUND_EQUILIBRIUM";
  if (currentPrice > onh) openingLocation = "ABOVE_ONH";
  else if (currentPrice < onl) openingLocation = "BELOW_ONL";
  else if (currentPrice > onMid + 10) openingLocation = "INSIDE_UPPER_GLOBEX";
  else if (currentPrice < onMid - 10) openingLocation = "INSIDE_LOWER_GLOBEX";

  // 7. Cross-Index SMT Divergence (NQ vs ES)
  let smtDivergence: SMTDivergence | undefined;
  if (esData && esData.intradayBars && esData.intradayBars.length > 0) {
    const esBars = esData.intradayBars.slice(-48);
    const esHighs = esBars.map((b) => b.high);
    const esLows = esBars.map((b) => b.low);
    const esOnh = esHighs.length > 0 ? Math.max(...esHighs) : 0;
    const esOnl = esLows.length > 0 ? Math.min(...esLows) : 0;
    const esPrice = esData.quote?.price || (esBars.length > 0 ? esBars[esBars.length - 1].close : 0);

    const nqSweptHigh = currentPrice > onh;
    const nqSweptLow = currentPrice < onl;
    const esSweptHigh = esPrice > esOnh;
    const esSweptLow = esPrice < esOnl;

    if (nqSweptLow && !esSweptLow && esPrice > 0) {
      smtDivergence = {
        hasDivergence: true,
        divergenceType: "BULLISH_SMT (NQ SWEPT LOW, ES HELD)",
        nqHigh: onh,
        nqLow: onl,
        esHigh: esOnh,
        esLow: esOnl,
        notes: "NQ swept Globex low while ES held above its low. Classic smart-money accumulation divergence."
      };
    } else if (!nqSweptLow && esSweptLow) {
      smtDivergence = {
        hasDivergence: true,
        divergenceType: "BULLISH_SMT (ES SWEPT LOW, NQ HELD)",
        nqHigh: onh,
        nqLow: onl,
        esHigh: esOnh,
        esLow: esOnl,
        notes: "ES flushed below its overnight low while NQ held higher. Indicates relative tech leadership."
      };
    } else if (nqSweptHigh && !esSweptHigh && esPrice > 0) {
      smtDivergence = {
        hasDivergence: true,
        divergenceType: "BEARISH_SMT (NQ SWEPT HIGH, ES HELD)",
        nqHigh: onh,
        nqLow: onl,
        esHigh: esOnh,
        esLow: esOnl,
        notes: "NQ swept overnight high while ES failed to make a new high. Warning of liquidity sweep trap."
      };
    } else if (!nqSweptHigh && esSweptHigh) {
      smtDivergence = {
        hasDivergence: true,
        divergenceType: "BEARISH_SMT (ES SWEPT HIGH, NQ HELD)",
        nqHigh: onh,
        nqLow: onl,
        esHigh: esOnh,
        esLow: esOnl,
        notes: "ES pushed to new high while NQ lagged. Warns of selective distribution."
      };
    } else {
      smtDivergence = {
        hasDivergence: false,
        divergenceType: "NONE (SYNCED)",
        nqHigh: onh,
        nqLow: onl,
        esHigh: esOnh,
        esLow: esOnl,
        notes: "NQ and ES are moving in sync with no cross-index divergence."
      };
    }
  }

  const sessionMetrics: SessionMetrics = {
    pdh: Math.round(pdh * 100) / 100,
    pdl: Math.round(pdl * 100) / 100,
    pdc: Math.round(pdc * 100) / 100,
    pdMid,
    onh: Math.round(onh * 100) / 100,
    onl: Math.round(onl * 100) / 100,
    onMid,
    londonHigh: Math.round(londonHigh * 100) / 100,
    londonLow: Math.round(londonLow * 100) / 100,
    asiaHigh: Math.round(asiaHigh * 100) / 100,
    asiaLow: Math.round(asiaLow * 100) / 100,
    sessionVwap,
    globexVwap,
    priorDayRthVwap,
    rthSessionVwap,
    vwapCalculationMode,
    htf50Retrace: htfFib.fib500,
    htf618Retrace: htfFib.fib618,
    htf705Retrace: htfFib.fib705,
    htfImpulseDirection: htfFib.impulseDirection,
    htfImpulseHigh: htfFib.swingHigh,
    htfImpulseLow: htfFib.swingLow,
    expectedMove1SD: expectedMove.expectedMove1SD,
    expectedMoveStraddle: expectedMove.expectedMoveStraddle,
    upper1SD: expectedMove.upper1SD,
    lower1SD: expectedMove.lower1SD,
    upperStraddle: expectedMove.upperStraddle,
    lowerStraddle: expectedMove.lowerStraddle,
    overnightRangeConsumedPercent,
    atr14Daily,
    atr15mIntraday,
    overnightRange,
    overnightInventory,
    inventoryPercent,
    openingGap,
    openingLocation,
    smtDivergence
  };

  // Compile Key Levels list
  const rawLevels: Array<Omit<KeyLevel, "distancePoints" | "distancePercent">> = [
    {
      id: "lvl-upper-1sd",
      name: "Daily Implied Upper 1-SD Move",
      shortName: "Upper 1-SD",
      price: expectedMove.upper1SD,
      role: "EXPECTED MOVE",
      timeframe: "VOLATILITY",
      note: `Rule of 16 Implied Move (+${expectedMove.expectedMove1SD.toFixed(1)} pts) based on ${ivPct.toFixed(1)}% IV.`
    },
    {
      id: "lvl-upper-straddle",
      name: "Daily Implied Upper Straddle Band",
      shortName: "Upper Straddle",
      price: expectedMove.upperStraddle,
      role: "EXPECTED MOVE",
      timeframe: "VOLATILITY",
      note: `Expected straddle range (+${expectedMove.expectedMoveStraddle.toFixed(1)} pts). Standard intraday expansion limit.`
    },
    {
      id: "lvl-pdh",
      name: "Prior Day High",
      shortName: "PDH",
      price: sessionMetrics.pdh,
      role: "LIQUIDITY POOL",
      timeframe: "DAILY",
      note: "Resting buy stops above yesterday's peak. Primary expansion target for bullish continuation."
    },
    {
      id: "lvl-onh",
      name: "Overnight (Globex) High",
      shortName: "ONH",
      price: sessionMetrics.onh,
      role: "LIQUIDITY POOL",
      timeframe: "GLOBEX",
      note: "Overnight liquidity pool. 9:30 AM open often sweeps or tests this on initial impulse."
    },
    {
      id: "lvl-lon-h",
      name: "London Session High",
      shortName: "Lon High",
      price: sessionMetrics.londonHigh || sessionMetrics.onh,
      role: "RETRACE ZONE",
      timeframe: "INTRADAY",
      note: "European liquidity pivot (03:00-09:00 ET). Acts as initial resistance or breakout support."
    },
    {
      id: "lvl-vwap-rth",
      name: `Session VWAP (${vwapCalculationMode === "TWAP_FALLBACK" ? "TWAP Fallback" : "Anchored 09:30"})`,
      shortName: "Session VWAP",
      price: sessionMetrics.sessionVwap,
      role: "EQUILIBRIUM",
      timeframe: "INTRADAY",
      note: "Primary institutional fair-value benchmark for 9:34–9:48 AM continuation entries."
    },
    {
      id: "lvl-vwap-globex",
      name: `Globex VWAP (${vwapCalculationMode === "TWAP_FALLBACK" ? "TWAP" : "Anchored 18:00"})`,
      shortName: "Globex VWAP",
      price: sessionMetrics.globexVwap,
      role: "EQUILIBRIUM",
      timeframe: "GLOBEX",
      note: "Overnight institutional benchmark. Crucial support/resistance anchor during pre-market and open."
    },
    {
      id: "lvl-on-mid",
      name: "Overnight Midpoint (50% Equilibrium)",
      shortName: "ON Mid",
      price: sessionMetrics.onMid,
      role: "RETRACE ZONE",
      timeframe: "GLOBEX",
      note: "Globex 50% equilibrium. Ideal discount zone for bullish continuation retrace."
    },
    {
      id: "lvl-pdc",
      name: "Prior Day Settlement Close",
      shortName: "PDC",
      price: sessionMetrics.pdc,
      role: "MAGNET",
      timeframe: "DAILY",
      note: "Prior day close. Inventory line-in-the-sand; buyers holding above indicates net long inventory."
    },
    {
      id: "lvl-pd-mid",
      name: "Prior Day Midpoint",
      shortName: "PD Mid",
      price: sessionMetrics.pdMid,
      role: "EQUILIBRIUM",
      timeframe: "DAILY",
      note: "Full day 50% equilibrium level from previous regular trading session."
    },
    {
      id: "lvl-htf-50",
      name: `HTF ${htfFib.impulseDirection} 50% Equilibrium`,
      shortName: "HTF 50%",
      price: sessionMetrics.htf50Retrace,
      role: "RETRACE ZONE",
      timeframe: "HTF",
      note: `Trailing 5-day ${htfFib.impulseDirection.toLowerCase()} impulse equilibrium (${htfFib.swingLow} to ${htfFib.swingHigh}).`
    },
    {
      id: "lvl-htf-618",
      name: `HTF ${htfFib.impulseDirection} 61.8% Golden Pocket`,
      shortName: "HTF 61.8%",
      price: sessionMetrics.htf618Retrace,
      role: "RETRACE ZONE",
      timeframe: "HTF",
      note: "Deep structural Fibonacci level. Acceptance beyond this signals structural trend exhaustion."
    },
    {
      id: "lvl-htf-705",
      name: `HTF ${htfFib.impulseDirection} 70.5% OTE Zone`,
      shortName: "HTF 70.5% OTE",
      price: sessionMetrics.htf705Retrace,
      role: "RETRACE ZONE",
      timeframe: "HTF",
      note: "Optimal Trade Entry (OTE) deep retracement zone."
    },
    {
      id: "lvl-lon-l",
      name: "London Session Low",
      shortName: "Lon Low",
      price: sessionMetrics.londonLow || sessionMetrics.onl,
      role: "LIQUIDITY POOL",
      timeframe: "INTRADAY",
      note: "European session baseline. Breached by opening retrace often turns into a fakeout sweep."
    },
    {
      id: "lvl-onl",
      name: "Overnight (Globex) Low",
      shortName: "ONL",
      price: sessionMetrics.onl,
      role: "LIQUIDITY POOL",
      timeframe: "GLOBEX",
      note: "Globex session floor. Sell stops pooled below; crucial invalidation for long continuation."
    },
    {
      id: "lvl-pdl",
      name: "Prior Day Low",
      shortName: "PDL",
      price: sessionMetrics.pdl,
      role: "LIQUIDITY POOL",
      timeframe: "DAILY",
      note: "Major daily structural floor. Key target for bear continuation or spring rejection."
    },
    {
      id: "lvl-lower-straddle",
      name: "Daily Implied Lower Straddle Band",
      shortName: "Lower Straddle",
      price: expectedMove.lowerStraddle,
      role: "EXPECTED MOVE",
      timeframe: "VOLATILITY",
      note: `Expected straddle downside limit (-${expectedMove.expectedMoveStraddle.toFixed(1)} pts). Key mean-reversion level.`
    },
    {
      id: "lvl-lower-1sd",
      name: "Daily Implied Lower 1-SD Move",
      shortName: "Lower 1-SD",
      price: expectedMove.lower1SD,
      role: "EXPECTED MOVE",
      timeframe: "VOLATILITY",
      note: `Rule of 16 Implied Move (-${expectedMove.expectedMove1SD.toFixed(1)} pts). Extreme standard deviation support.`
    }
  ];

  // Enrich with distance points and percentage from current price
  const keyLevels: KeyLevel[] = rawLevels
    .map((lvl) => {
      const distPts = Math.round((lvl.price - currentPrice) * 100) / 100;
      const distPct = Math.round(((lvl.price - currentPrice) / currentPrice) * 10000) / 100;
      return {
        ...lvl,
        distancePoints: distPts,
        distancePercent: distPct
      };
    })
    .sort((a, b) => b.price - a.price); // Ordered descending by price

  return { sessionMetrics, keyLevels };
}
