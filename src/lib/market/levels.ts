import { OHLCVBar, KeyLevel, SessionMetrics } from "@/types/market";

interface ExtractedSessions {
  pdh: number;
  pdl: number;
  pdc: number;
  pdMid: number;
  onh: number;
  onl: number;
  onMid: number;
  londonHigh: number;
  londonLow: number;
  asiaHigh: number;
  asiaLow: number;
  sessionVwap: number;
  htfSwingHigh: number;
  htfSwingLow: number;
  inventoryPercent: number; // e.g. +70% above PDC
  overnightInventory: "BULLISH_IMBALANCE" | "BEARISH_IMBALANCE" | "BALANCED";
  atr14Daily: number;
  atr15mIntraday: number;
}

export function computeSessionLevels(
  currentPrice: number,
  dailyBars: OHLCVBar[],
  intradayBars: OHLCVBar[]
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

  // 2. Parse Intraday bars for Globex (Overnight), London, Asia, and VWAP
  let onh = currentPrice + 35;
  let onl = currentPrice - 40;
  let londonHigh = currentPrice + 25;
  let londonLow = currentPrice - 30;
  let asiaHigh = currentPrice + 10;
  let asiaLow = currentPrice - 20;

  let vwapSumPV = 0;
  let vwapSumV = 0;
  let abovePdcBars = 0;
  let totalOvernightBars = 0;

  // Calculate 15-minute ATR
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

  if (intradayBars.length > 0) {
    const globexHighs: number[] = [];
    const globexLows: number[] = [];
    const lonHighs: number[] = [];
    const lonLows: number[] = [];
    const asiaHighs: number[] = [];
    const asiaLows: number[] = [];

    // Analyze bars
    // CME Globex session begins 18:00 ET. We evaluate the most recent ~30-40 bars (last 10-15 hours)
    const recentBars = intradayBars.slice(-40);

    for (const b of recentBars) {
      const dt = new Date(b.timestamp);
      // Format hour in ET
      const hourStr = dt.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false });
      const hourET = parseInt(hourStr, 10);

      // Volume-weighted price calculation
      const typPrice = (b.high + b.low + b.close) / 3;
      const vol = b.volume > 0 ? b.volume : 100;
      vwapSumPV += typPrice * vol;
      vwapSumV += vol;

      // Globex overnight encompasses roughly 18:00 to 09:30 ET
      globexHighs.push(b.high);
      globexLows.push(b.low);
      totalOvernightBars++;
      if (b.close >= pdc) {
        abovePdcBars++;
      }

      // London session: approx 03:00 - 08:30 ET
      if (hourET >= 3 && hourET < 9) {
        lonHighs.push(b.high);
        lonLows.push(b.low);
      }

      // Asia session: approx 18:00 - 02:00 ET
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
  const sessionVwap = vwapSumV > 0
    ? Math.round((vwapSumPV / vwapSumV) * 100) / 100
    : Math.round(((onh + onl + currentPrice) / 3) * 100) / 100;

  // HTF 3-day swing calculation
  const htfLookback = dailyBars.slice(-5);
  const htfHighs = htfLookback.map((b) => b.high);
  const htfLows = htfLookback.map((b) => b.low);
  const htfImpulseHigh = htfHighs.length > 0 ? Math.max(...htfHighs, onh) : onh + 80;
  const htfImpulseLow = htfLows.length > 0 ? Math.min(...htfLows, onl) : onl - 80;

  const htfRange = htfImpulseHigh - htfImpulseLow;
  const htf50Retrace = Math.round((htfImpulseLow + htfRange * 0.5) * 100) / 100;
  const htf618Retrace = Math.round((htfImpulseHigh - htfRange * 0.382) * 100) / 100; // 61.8% pullback from high

  // Overnight Inventory Imbalance
  const inventoryRatio = totalOvernightBars > 0 ? abovePdcBars / totalOvernightBars : 0.5;
  const inventoryPercent = Math.round((inventoryRatio - 0.5) * 200); // -100% to +100%
  let overnightInventory: "BULLISH_IMBALANCE" | "BEARISH_IMBALANCE" | "BALANCED" = "BALANCED";
  if (inventoryPercent >= 40) overnightInventory = "BULLISH_IMBALANCE";
  else if (inventoryPercent <= -40) overnightInventory = "BEARISH_IMBALANCE";

  // Opening location relative to Globex range
  const openingGap = Math.round((currentPrice - pdc) * 100) / 100;
  let openingLocation: SessionMetrics["openingLocation"] = "AROUND_EQUILIBRIUM";
  if (currentPrice > onh) openingLocation = "ABOVE_ONH";
  else if (currentPrice < onl) openingLocation = "BELOW_ONL";
  else if (currentPrice > onMid + 10) openingLocation = "INSIDE_UPPER_GLOBEX";
  else if (currentPrice < onMid - 10) openingLocation = "INSIDE_LOWER_GLOBEX";

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
    htf50Retrace,
    htf618Retrace,
    htfImpulseHigh: Math.round(htfImpulseHigh * 100) / 100,
    htfImpulseLow: Math.round(htfImpulseLow * 100) / 100,
    atr14Daily,
    atr15mIntraday,
    overnightRange: Math.round((onh - onl) * 100) / 100,
    overnightInventory,
    inventoryPercent,
    openingGap,
    openingLocation
  };

  // Compile Key Levels list
  const rawLevels: Array<Omit<KeyLevel, "distancePoints" | "distancePercent">> = [
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
      note: "Overnight liquidity pool. 9:30 AM open often sweeps or breaks this on initial drive."
    },
    {
      id: "lvl-lon-h",
      name: "London Session High",
      shortName: "Lon High",
      price: sessionMetrics.londonHigh || sessionMetrics.onh,
      role: "RETRACE ZONE",
      timeframe: "INTRADAY",
      note: "European liquidity pivot (03:00-08:30 ET). Often acts as initial resistance or breakout support."
    },
    {
      id: "lvl-vwap",
      name: "Session Anchored VWAP",
      shortName: "VWAP",
      price: sessionMetrics.sessionVwap,
      role: "EQUILIBRIUM",
      timeframe: "INTRADAY",
      note: "Institutional volume weighted average. Primary retrace entry anchor for 9:30-10:00 AM window."
    },
    {
      id: "lvl-on-mid",
      name: "Overnight Midpoint",
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
      name: "HTF Impulse 50% Retracement",
      shortName: "50% Retrace",
      price: sessionMetrics.htf50Retrace,
      role: "RETRACE ZONE",
      timeframe: "HTF",
      note: "Higher-timeframe swing leg equilibrium. Deep discount continuation zone."
    },
    {
      id: "lvl-htf-618",
      name: "HTF 61.8% Golden Pocket",
      shortName: "61.8% Retrace",
      price: sessionMetrics.htf618Retrace,
      role: "RETRACE ZONE",
      timeframe: "HTF",
      note: "Deep Fibonacci structural zone. Invalidation risk elevates if price accepts below this."
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
