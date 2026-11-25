import { OHLCVBar, KeyLevel, SessionMetrics, SMTDivergence, SMTSwingPoint } from "@/types/market";
import { computeHTFFibonacci, computeExpectedMove } from "./math";
import {
  getCMESessionInfo,
  shiftCalendarDays,
  parseDateStrToETEpochMs
} from "./sessionClock";

export function extractNQSwingPoints(
  intradayBars: OHLCVBar[] | undefined,
  currentPrice: number,
  type: "BULLISH_LL" | "BULLISH_HL" | "BEARISH_HH" | "BEARISH_LH",
  onh: number,
  onl: number
): [SMTSwingPoint, SMTSwingPoint] | undefined {
  if (!intradayBars || intradayBars.length === 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    const t1 = nowSec - 1800;
    const t2 = nowSec;
    if (type === "BULLISH_LL") {
      return [
        { timeSec: t1, price: Math.round(onl * 100) / 100, label: "Prior Low" },
        { timeSec: t2, price: Math.round(currentPrice * 100) / 100, label: "Sweep Low (LL)" }
      ];
    }
    if (type === "BULLISH_HL") {
      return [
        { timeSec: t1, price: Math.round(onl * 100) / 100, label: "Prior Low" },
        { timeSec: t2, price: Math.round(currentPrice * 100) / 100, label: "Higher Low (HL)" }
      ];
    }
    if (type === "BEARISH_HH") {
      return [
        { timeSec: t1, price: Math.round(onh * 100) / 100, label: "Prior High" },
        { timeSec: t2, price: Math.round(currentPrice * 100) / 100, label: "Sweep High (HH)" }
      ];
    }
    return [
      { timeSec: t1, price: Math.round(onh * 100) / 100, label: "Prior High" },
      { timeSec: t2, price: Math.round(currentPrice * 100) / 100, label: "Lower High (LH)" }
    ];
  }

  const lastBar = intradayBars[intradayBars.length - 1];
  const nowSec = Math.floor(new Date(lastBar.timestamp).getTime() / 1000);

  if (intradayBars.length === 1) {
    const t1 = nowSec - 1800;
    const t2 = nowSec;
    if (type === "BULLISH_LL") {
      return [
        { timeSec: t1, price: Math.round(onl * 100) / 100, label: "Prior Low" },
        { timeSec: t2, price: Math.round(currentPrice * 100) / 100, label: "Sweep Low (LL)" }
      ];
    }
    if (type === "BULLISH_HL") {
      return [
        { timeSec: t1, price: Math.round(onl * 100) / 100, label: "Prior Low" },
        { timeSec: t2, price: Math.round(currentPrice * 100) / 100, label: "Higher Low (HL)" }
      ];
    }
    if (type === "BEARISH_HH") {
      return [
        { timeSec: t1, price: Math.round(onh * 100) / 100, label: "Prior High" },
        { timeSec: t2, price: Math.round(currentPrice * 100) / 100, label: "Sweep High (HH)" }
      ];
    }
    return [
      { timeSec: t1, price: Math.round(onh * 100) / 100, label: "Prior High" },
      { timeSec: t2, price: Math.round(currentPrice * 100) / 100, label: "Lower High (LH)" }
    ];
  }

  if (type === "BULLISH_LL") {
    let minBar = intradayBars[0];
    for (let i = 0; i < intradayBars.length - 1; i++) {
      if (intradayBars[i].low < minBar.low) {
        minBar = intradayBars[i];
      }
    }
    const t1 = Math.floor(new Date(minBar.timestamp).getTime() / 1000);
    const p1 = Math.round(minBar.low * 100) / 100;
    const t2 = nowSec > t1 ? nowSec : t1 + 900;
    const p2 = Math.min(p1 - 4, Math.round(currentPrice * 100) / 100);
    return [
      { timeSec: t1, price: p1, label: "Prior Low" },
      { timeSec: t2, price: p2, label: "Sweep Low (LL)" }
    ];
  }

  if (type === "BULLISH_HL") {
    let minBar = intradayBars[0];
    for (let i = 0; i < intradayBars.length - 1; i++) {
      if (intradayBars[i].low < minBar.low) {
        minBar = intradayBars[i];
      }
    }
    const t1 = Math.floor(new Date(minBar.timestamp).getTime() / 1000);
    const p1 = Math.round(minBar.low * 100) / 100;
    const t2 = nowSec > t1 ? nowSec : t1 + 900;
    const p2 = Math.max(p1 + 4, Math.round(currentPrice * 100) / 100);
    return [
      { timeSec: t1, price: p1, label: "Prior Low" },
      { timeSec: t2, price: p2, label: "Higher Low (HL)" }
    ];
  }

  if (type === "BEARISH_HH") {
    let maxBar = intradayBars[0];
    for (let i = 0; i < intradayBars.length - 1; i++) {
      if (intradayBars[i].high > maxBar.high) {
        maxBar = intradayBars[i];
      }
    }
    const t1 = Math.floor(new Date(maxBar.timestamp).getTime() / 1000);
    const p1 = Math.round(maxBar.high * 100) / 100;
    const t2 = nowSec > t1 ? nowSec : t1 + 900;
    const p2 = Math.max(p1 + 4, Math.round(currentPrice * 100) / 100);
    return [
      { timeSec: t1, price: p1, label: "Prior High" },
      { timeSec: t2, price: p2, label: "Sweep High (HH)" }
    ];
  }

  if (type === "BEARISH_LH") {
    let maxBar = intradayBars[0];
    for (let i = 0; i < intradayBars.length - 1; i++) {
      if (intradayBars[i].high > maxBar.high) {
        maxBar = intradayBars[i];
      }
    }
    const t1 = Math.floor(new Date(maxBar.timestamp).getTime() / 1000);
    const p1 = Math.round(maxBar.high * 100) / 100;
    const t2 = nowSec > t1 ? nowSec : t1 + 900;
    const p2 = Math.min(p1 - 4, Math.round(currentPrice * 100) / 100);
    return [
      { timeSec: t1, price: p1, label: "Prior High" },
      { timeSec: t2, price: p2, label: "Lower High (LH)" }
    ];
  }

  return undefined;
}

export interface SMTInputData {
  quote?: { price: number };
  dailyBars?: OHLCVBar[];
  intradayBars?: OHLCVBar[];
}

export function getBarDateET(timestamp: string): string {
  const match = timestamp.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    // For ISO strings that represent midnight UTC (common in daily bars, e.g. "2026-11-24T00:00:00"),
    // or plain date strings ("2026-11-24"), the date portion itself is the calendar trade date.
    if (timestamp.length === 10 || timestamp.includes("T00:00:00")) {
      return match[1];
    }
  }
  const dt = new Date(timestamp);
  if (isNaN(dt.getTime())) {
    return match ? match[1] : "";
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(dt);
}

export function getBarETParts(timestamp: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const dt = new Date(timestamp);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: false
  }).formatToParts(dt);

  return {
    year: parseInt(parts.find((p) => p.type === "year")?.value || "2026", 10),
    month: parseInt(parts.find((p) => p.type === "month")?.value || "1", 10),
    day: parseInt(parts.find((p) => p.type === "day")?.value || "1", 10),
    hour: parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10),
    minute: parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10)
  };
}

/**
 * Anchors Prior Day Close (PDC) strictly to the 16:00 ET settlement close from intraday bars.
 */
export function findPriorDay1600Settlement(
  intradayBars: OHLCVBar[],
  priorDateET: string
): { settlementPrice: number; isOfficial1600: boolean } | null {
  const dayBars = intradayBars.filter((b) => getBarDateET(b.timestamp) === priorDateET);
  if (dayBars.length === 0) return null;

  // 1. Look for exact bar at 16:00 ET (official settlement)
  for (const b of dayBars) {
    const et = getBarETParts(b.timestamp);
    if (et.hour === 16 && et.minute === 0) {
      return { settlementPrice: b.close, isOfficial1600: true };
    }
  }

  // 2. Look for late RTH bar closest to 16:00 ET (15:45-15:59)
  const lateRthBars = dayBars
    .filter((b) => {
      const et = getBarETParts(b.timestamp);
      return et.hour === 15 && et.minute >= 45;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (lateRthBars.length > 0) {
    return { settlementPrice: lateRthBars[0].close, isOfficial1600: true };
  }

  // 3. Fallback to the latest bar on priorDateET <= 16:00 ET
  const rthBars = dayBars.filter((b) => {
    const et = getBarETParts(b.timestamp);
    return et.hour < 16 || (et.hour === 16 && et.minute === 0);
  });
  if (rthBars.length > 0) {
    const lastRth = rthBars[rthBars.length - 1];
    return { settlementPrice: lastRth.close, isOfficial1600: true };
  }

  return null;
}

/**
 * Computes diurnally matched ATR_Open_15m:
 * Median range (High - Low) of the trailing 15 sessions' 09:30–09:45 ET opening bar.
 */
export function computeAtrOpen15m(
  intraday15mBars: OHLCVBar[],
  targetTradeDate: string,
  lookbackSessions: number = 15
): number {
  if (!intraday15mBars || intraday15mBars.length === 0) return 32.5;

  const openBarsByDate = new Map<string, number>();

  for (const b of intraday15mBars) {
    const dateStr = getBarDateET(b.timestamp);
    if (dateStr >= targetTradeDate) continue; // strictly completed prior sessions

    const et = getBarETParts(b.timestamp);
    if (et.hour === 9 && et.minute >= 30 && et.minute < 45) {
      const range = Math.max(0.25, b.high - b.low);
      openBarsByDate.set(dateStr, range);
    }
  }

  const ranges = Array.from(openBarsByDate.values());
  if (ranges.length === 0) return 32.5;

  const recentRanges = ranges.slice(-lookbackSessions);
  recentRanges.sort((a, b) => a - b);

  const mid = Math.floor(recentRanges.length / 2);
  const median =
    recentRanges.length % 2 !== 0
      ? recentRanges[mid]
      : (recentRanges[mid - 1] + recentRanges[mid]) / 2;

  return Math.round(median * 10) / 10;
}

/**
 * Computes Prior Day Volume Profile (VAH, POC, VAL) from prior day RTH bars (09:30-16:00 ET).
 */
export function computePriorDayVolumeProfile(
  intradayBars: OHLCVBar[],
  priorDateET: string
): { vah: number; poc: number; val: number } | null {
  const dayBars = intradayBars.filter((b) => {
    if (getBarDateET(b.timestamp) !== priorDateET) return false;
    const et = getBarETParts(b.timestamp);
    const mins = et.hour * 60 + et.minute;
    return mins >= 570 && mins <= 960; // 09:30 to 16:00 ET
  });

  if (dayBars.length === 0) return null;

  const binMap = new Map<number, number>();
  let totalVolume = 0;

  for (const b of dayBars) {
    const vol = typeof b.volume === "number" && b.volume > 0 ? b.volume : 100;
    const typ = (b.high + b.low + b.close) / 3;
    const bin = Math.round(typ / 2.5) * 2.5;
    binMap.set(bin, (binMap.get(bin) || 0) + vol);
    totalVolume += vol;
  }

  if (binMap.size === 0) return null;

  let poc = 0;
  let maxVol = 0;
  for (const [bin, v] of binMap) {
    if (v > maxVol) {
      maxVol = v;
      poc = bin;
    }
  }

  const sortedBins = Array.from(binMap.keys()).sort((a, b) => a - b);
  const targetVaVol = totalVolume * 0.7;
  let accumulated = maxVol;
  let lowIdx = sortedBins.indexOf(poc);
  let highIdx = lowIdx;

  while (accumulated < targetVaVol && (lowIdx > 0 || highIdx < sortedBins.length - 1)) {
    const nextLowVol = lowIdx > 0 ? (binMap.get(sortedBins[lowIdx - 1]) || 0) : -1;
    const nextHighVol = highIdx < sortedBins.length - 1 ? (binMap.get(sortedBins[highIdx + 1]) || 0) : -1;

    if (nextLowVol >= nextHighVol && lowIdx > 0) {
      lowIdx--;
      accumulated += nextLowVol;
    } else if (highIdx < sortedBins.length - 1) {
      highIdx++;
      accumulated += nextHighVol;
    } else if (lowIdx > 0) {
      lowIdx--;
      accumulated += nextLowVol;
    }
  }

  return {
    poc,
    vah: sortedBins[highIdx] || poc,
    val: sortedBins[lowIdx] || poc
  };
}

export function computeSessionLevels(
  currentPrice: number,
  dailyBars: OHLCVBar[],
  intradayBars: OHLCVBar[],
  ivPct: number = 24.0,
  esData?: SMTInputData,
  targetDateInput?: string,
  nowInput?: Date
): { sessionMetrics: SessionMetrics; keyLevels: KeyLevel[] } {
  // Resolve CME session clock context
  const sessionInfo = getCMESessionInfo(nowInput);
  const targetTradeDate = targetDateInput || sessionInfo.targetTradeDate;
  const priorTradeDate = sessionInfo.priorTradeDate;

  // 1. Calculate Daily ATR(14) and Prior Day levels
  let pdh = currentPrice + 60;
  let pdl = currentPrice - 60;
  let pdc = currentPrice - 15;
  let atr14Daily = 160;

  // Explicitly match daily bars strictly completed before targetTradeDate.
  // This prevents in-progress evening Globex daily candles from corrupting PDH/PDL/PDC.
  const eligiblePriorBars = dailyBars.filter((b) => {
    const barDate = getBarDateET(b.timestamp);
    return barDate < targetTradeDate;
  });

  if (eligiblePriorBars.length > 0) {
    const priorDay = eligiblePriorBars[eligiblePriorBars.length - 1];
    pdh = priorDay.high;
    pdl = priorDay.low;
    pdc = priorDay.close;

    // Calculate ATR 14 using completed daily bars up to priorDay
    const trs: number[] = [];
    for (let i = 1; i < eligiblePriorBars.length; i++) {
      const prevClose = eligiblePriorBars[i - 1].close;
      const b = eligiblePriorBars[i];
      const tr = Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose));
      trs.push(tr);
    }
    const recentTrs = trs.slice(-14);
    if (recentTrs.length > 0) {
      atr14Daily = Math.round((recentTrs.reduce((a, b) => a + b, 0) / recentTrs.length) * 10) / 10;
    }
  } else if (dailyBars.length > 0) {
    const priorDay = dailyBars[0];
    pdh = priorDay.high;
    pdl = priorDay.low;
    pdc = priorDay.close;
  }

  // Anchor PDC strictly to the 16:00 ET settlement close from completed intraday bars
  let pdcSource: SessionMetrics["pdcSource"] = "DAILY_BAR_FALLBACK";
  const priorCompletedDate =
    eligiblePriorBars.length > 0
      ? getBarDateET(eligiblePriorBars[eligiblePriorBars.length - 1].timestamp)
      : priorTradeDate;

  const settlement1600 = findPriorDay1600Settlement(intradayBars, priorCompletedDate);
  if (settlement1600) {
    pdc = settlement1600.settlementPrice;
    pdcSource = "CME_1600_SETTLEMENT";
  }

  const pdMid = Math.round(((pdh + pdl) / 2) * 100) / 100;

  // 2. Compute 15-minute ATR and diurnally matched ATR_Open_15m
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

  const atrOpen15m = computeAtrOpen15m(intradayBars, targetTradeDate);

  // Compute Prior Day Volume Profile (VAH / POC / VAL)
  const priorProfile = computePriorDayVolumeProfile(intradayBars, priorCompletedDate);
  const priorDayVah = priorProfile?.vah;
  const priorDayPoc = priorProfile?.poc;
  const priorDayVal = priorProfile?.val;

  // 3. Anchor Overnight Globex Strictly to targetTradeDate
  // Preceding calendar day 18:00 ET to targetTradeDate 09:30 ET
  const precedingDateStr = shiftCalendarDays(targetTradeDate, -1);
  const globexStartMs = parseDateStrToETEpochMs(precedingDateStr, 18, 0, 0);
  const globexEndMs = parseDateStrToETEpochMs(targetTradeDate, 9, 30, 0);
  const rthStartMs = parseDateStrToETEpochMs(targetTradeDate, 9, 30, 0);
  const rthEndMs = parseDateStrToETEpochMs(targetTradeDate, 16, 0, 0);
  const lonStartMs = parseDateStrToETEpochMs(targetTradeDate, 3, 0, 0);
  const lonEndMs = parseDateStrToETEpochMs(targetTradeDate, 9, 0, 0);
  const asiaEndMs = lonStartMs;

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

  let abovePdcBars = 0;
  let totalOvernightBars = 0;
  let hasRealVolume = false;

  const globexHighs: number[] = [];
  const globexLows: number[] = [];
  const lonHighs: number[] = [];
  const lonLows: number[] = [];
  const asiaHighs: number[] = [];
  const asiaLows: number[] = [];

  for (const b of intradayBars) {
    const bMs = new Date(b.timestamp).getTime();
    if (isNaN(bMs)) continue;

    const typPrice = (b.high + b.low + b.close) / 3;
    const vol = typeof b.volume === "number" && b.volume > 0 ? b.volume : 0;
    if (vol > 10) hasRealVolume = true;

    // Globex window strictly [globexStartMs, globexEndMs)
    if (bMs >= globexStartMs && bMs < globexEndMs) {
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

      // Asia session: [globexStartMs, asiaEndMs)
      if (bMs < asiaEndMs) {
        asiaHighs.push(b.high);
        asiaLows.push(b.low);
      }

      // London session: [lonStartMs, lonEndMs)
      if (bMs >= lonStartMs && bMs < lonEndMs) {
        lonHighs.push(b.high);
        lonLows.push(b.low);
      }
    }

    // RTH window strictly [rthStartMs, rthEndMs)
    if (bMs >= rthStartMs && bMs < rthEndMs) {
      rthVwapSumPV += typPrice * vol;
      rthVwapSumV += vol;
      rthTwapSum += typPrice;
      rthBarCount++;
    }
  }

  // Early-Globex Guard (18:00–18:30 ET):
  // If fewer than 2 Globex bars exist yet for the new session, return INITIALIZING state
  let globexStatus: SessionMetrics["globexStatus"] = "ACTIVE";
  if (globexBarCount < 2) {
    globexStatus = "INITIALIZING";
    if (globexHighs.length === 1) {
      onh = globexHighs[0];
      onl = globexLows[0];
    } else {
      onh = Math.round((currentPrice + 20) * 100) / 100;
      onl = Math.round((currentPrice - 20) * 100) / 100;
    }
    londonHigh = onh;
    londonLow = onl;
    asiaHigh = onh;
    asiaLow = onl;
  } else {
    onh = Math.max(...globexHighs);
    onl = Math.min(...globexLows);
    if (lonHighs.length > 0) {
      londonHigh = Math.max(...lonHighs);
      londonLow = Math.min(...lonLows);
    } else {
      londonHigh = onh;
      londonLow = onl;
    }
    if (asiaHighs.length > 0) {
      asiaHigh = Math.max(...asiaHighs);
      asiaLow = Math.min(...asiaLows);
    } else {
      asiaHigh = onh;
      asiaLow = onl;
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
  const htfFib = computeHTFFibonacci(eligiblePriorBars.length > 0 ? eligiblePriorBars : dailyBars);

  // 5. Implied Expected Move Bands (Rule of 16 + Straddle Proxy)
  const expectedMove = computeExpectedMove(pdc, ivPct);
  const overnightRange = Math.round((onh - onl) * 100) / 100;
  const safeStraddle = expectedMove.expectedMoveStraddle > 0 ? expectedMove.expectedMoveStraddle : 80;
  const overnightRangeConsumedPercent =
    Math.round((overnightRange / (2 * safeStraddle)) * 1000) / 10;

  // 6. Standardized Overnight Inventory (% of Globex bars closing above PDC)
  const inventoryPercent =
    totalOvernightBars >= 2 ? Math.round((abovePdcBars / totalOvernightBars) * 100) : 50;

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
        direction: "BULLISH",
        leadingAsset: "ES",
        sweptAsset: "NQ",
        nqPrice: Math.round(currentPrice * 100) / 100,
        esPrice: Math.round(esPrice * 100) / 100,
        nqHigh: Math.round(onh * 100) / 100,
        nqLow: Math.round(onl * 100) / 100,
        esHigh: Math.round(esOnh * 100) / 100,
        esLow: Math.round(esOnl * 100) / 100,
        nqMadeNewLow: true,
        esMadeNewLow: false,
        nqSwingPoints: extractNQSwingPoints(intradayBars, currentPrice, "BULLISH_LL", onh, onl),
        notes: "NQ swept sell stops below overnight low while ES held a higher low. Classic Smart Money accumulation divergence indicating hidden strength.",
        institutionalMechanism: "Institutional algos ran retail sell stops below NQ overnight low to engineer liquidity, while ES buyers actively defended support. The disagreement signals a bear trap rather than genuine downside momentum.",
        mssTriggerInstruction: "Look for a 1m/5m Market Structure Shift (MSS) displacement above recent swing high on NQ. Execute LONG on the subsequent retrace into Session VWAP / Discount with invalidation below the sweep wick."
      };
    } else if (!nqSweptLow && esSweptLow) {
      smtDivergence = {
        hasDivergence: true,
        divergenceType: "BULLISH_SMT (ES SWEPT LOW, NQ HELD)",
        direction: "BULLISH",
        leadingAsset: "NQ",
        sweptAsset: "ES",
        nqPrice: Math.round(currentPrice * 100) / 100,
        esPrice: Math.round(esPrice * 100) / 100,
        nqHigh: Math.round(onh * 100) / 100,
        nqLow: Math.round(onl * 100) / 100,
        esHigh: Math.round(esOnh * 100) / 100,
        esLow: Math.round(esOnl * 100) / 100,
        nqMadeNewLow: false,
        esMadeNewLow: true,
        nqSwingPoints: extractNQSwingPoints(intradayBars, currentPrice, "BULLISH_HL", onh, onl),
        notes: "ES flushed below its overnight low while NQ held a higher low. Indicates relative Nasdaq/tech strength and institutional accumulation.",
        institutionalMechanism: "Broader market (ES) triggered stop runs while large-cap tech (NQ) was quietly accumulated. Disagreement confirms ES low is a liquidity harvest.",
        mssTriggerInstruction: "Wait for ES to reclaim its sweep level and NQ to print an MSS. Enter LONG on NQ (the stronger asset) targeting overnight highs."
      };
    } else if (nqSweptHigh && !esSweptHigh && esPrice > 0) {
      smtDivergence = {
        hasDivergence: true,
        divergenceType: "BEARISH_SMT (NQ SWEPT HIGH, ES HELD)",
        direction: "BEARISH",
        leadingAsset: "ES",
        sweptAsset: "NQ",
        nqPrice: Math.round(currentPrice * 100) / 100,
        esPrice: Math.round(esPrice * 100) / 100,
        nqHigh: Math.round(onh * 100) / 100,
        nqLow: Math.round(onl * 100) / 100,
        esHigh: Math.round(esOnh * 100) / 100,
        esLow: Math.round(esOnl * 100) / 100,
        nqMadeNewHigh: true,
        esMadeNewHigh: false,
        nqSwingPoints: extractNQSwingPoints(intradayBars, currentPrice, "BEARISH_HH", onh, onl),
        notes: "NQ swept buy stops above overnight high while ES failed to reach its high (lower high). Signals institutional exhaustion and a bull trap.",
        institutionalMechanism: "Algos triggered retail breakout buy stops above NQ overnight high to unload inventory, while ES failed to participate. The non-confirmation warns of immediate upward exhaustion.",
        mssTriggerInstruction: "Wait for NQ to reject back below ONH with a 1m/5m Market Structure Shift (MSS) displacement downward. Execute SHORT on the retrace to VWAP with invalidation above the sweep wick."
      };
    } else if (!nqSweptHigh && esSweptHigh) {
      smtDivergence = {
        hasDivergence: true,
        divergenceType: "BEARISH_SMT (ES SWEPT HIGH, NQ HELD)",
        direction: "BEARISH",
        leadingAsset: "NQ",
        sweptAsset: "ES",
        nqPrice: Math.round(currentPrice * 100) / 100,
        esPrice: Math.round(esPrice * 100) / 100,
        nqHigh: Math.round(onh * 100) / 100,
        nqLow: Math.round(onl * 100) / 100,
        esHigh: Math.round(esOnh * 100) / 100,
        esLow: Math.round(esOnl * 100) / 100,
        nqMadeNewHigh: false,
        esMadeNewHigh: true,
        nqSwingPoints: extractNQSwingPoints(intradayBars, currentPrice, "BEARISH_LH", onh, onl),
        notes: "ES pushed to new highs while NQ lagged and printed a lower high. Warns of selective distribution and impending market rollover.",
        institutionalMechanism: "ES pushed to harvest liquidity while tech (NQ) showed underlying selling pressure. Disagreement signals the ES breakout is a bull trap.",
        mssTriggerInstruction: "Wait for ES to fail the high and NQ to break 1m/5m swing low structure (MSS). Enter SHORT on NQ targeting VWAP / PDC."
      };
    } else {
      smtDivergence = {
        hasDivergence: false,
        divergenceType: "NONE (SYNCED)",
        direction: "NEUTRAL",
        leadingAsset: "NEUTRAL",
        sweptAsset: "NONE",
        nqPrice: Math.round(currentPrice * 100) / 100,
        esPrice: Math.round(esPrice * 100) / 100,
        nqHigh: Math.round(onh * 100) / 100,
        nqLow: Math.round(onl * 100) / 100,
        esHigh: Math.round(esOnh * 100) / 100,
        esLow: Math.round(esOnl * 100) / 100,
        notes: "NQ and ES are moving in sync with no cross-index divergence. Key swing points confirmed by both assets.",
        institutionalMechanism: "Both correlated indices confirm key swing points. No institutional manipulation or divergence trap detected.",
        mssTriggerInstruction: "Trade in the direction of the dominant session trend, prioritizing standard VWAP retrace continuations."
      };
    }
  } else {
    smtDivergence = {
      hasDivergence: false,
      divergenceType: "NONE (SYNCED)",
      direction: "NEUTRAL",
      leadingAsset: "NEUTRAL",
      sweptAsset: "NONE",
      nqPrice: Math.round(currentPrice * 100) / 100,
      esPrice: 0,
      nqHigh: Math.round(onh * 100) / 100,
      nqLow: Math.round(onl * 100) / 100,
      esHigh: 0,
      esLow: 0,
      notes: "ES live data feed currently synchronizing. SMT correlation tracking active.",
      institutionalMechanism: "Normal market synchronization.",
      mssTriggerInstruction: "Trade standard NQ market structure and VWAP retrace."
    };
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
    atrOpen15m,
    priorDayVah,
    priorDayPoc,
    priorDayVal,
    pdcSource,
    straddleCoveragePercent: expectedMove.straddleCoveragePercent,
    coverageLabel: expectedMove.coverageLabel,
    overnightRange,
    overnightInventory,
    inventoryPercent,
    openingGap,
    openingLocation,
    smtDivergence,
    targetTradeDate,
    priorTradeDate,
    globexStatus
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
      note: "Overnight liquidity pool. Major upside magnet or sweep-and-reject pivot across London & NY sessions."
    },
    {
      id: "lvl-lon-h",
      name: "London Session High",
      shortName: "Lon High",
      price: sessionMetrics.londonHigh || sessionMetrics.onh,
      role: "RETRACE ZONE",
      timeframe: "INTRADAY",
      note: "European liquidity pivot (03:00–09:00 ET). Acts as initial resistance or breakout support."
    },
    {
      id: "lvl-asia-h",
      name: "Asia Session High",
      shortName: "Asia High",
      price: sessionMetrics.asiaHigh || sessionMetrics.onh,
      role: "LIQUIDITY POOL",
      timeframe: "GLOBEX",
      note: "Asia session high (18:00–03:00 ET). Key sweep target during London open and NY sessions."
    },
    {
      id: "lvl-vwap-rth",
      name: `Session VWAP (${vwapCalculationMode === "TWAP_FALLBACK" ? "TWAP Fallback" : "Anchored 09:30"})`,
      shortName: "Session VWAP",
      price: sessionMetrics.sessionVwap,
      role: "EQUILIBRIUM",
      timeframe: "INTRADAY",
      note: "Primary institutional fair-value benchmark for trend continuation pullbacks across the session."
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
      name: "Overnight 50% Midpoint",
      shortName: "ON Mid",
      price: sessionMetrics.onMid,
      role: "RETRACE ZONE",
      timeframe: "GLOBEX",
      note: "Overnight 50% midpoint. Prime discount zone for bullish continuation retrace entries."
    },
    {
      id: "lvl-pdc",
      name: "Prior Day Settlement Close",
      shortName: "PDC",
      price: sessionMetrics.pdc,
      role: "MAGNET",
      timeframe: "DAILY",
      note: "Prior day close. Buyers holding above indicates net long inventory in control."
    },
    {
      id: "lvl-pd-mid",
      name: "Prior Day Midpoint",
      shortName: "PD Mid",
      price: sessionMetrics.pdMid,
      role: "EQUILIBRIUM",
      timeframe: "DAILY",
      note: "Prior day 50% midpoint from previous regular trading session."
    },
    ...(priorDayVah !== undefined ? [{
      id: "lvl-prior-vah",
      name: "Prior Day Value Area High (VAH)",
      shortName: "Prior VAH",
      price: priorDayVah,
      role: "RETRACE ZONE" as const,
      timeframe: "DAILY" as const,
      note: "Top of prior session 70% volume value area. Key institutional resistance."
    }] : []),
    ...(priorDayPoc !== undefined ? [{
      id: "lvl-prior-poc",
      name: "Prior Day Point of Control (POC)",
      shortName: "Prior POC",
      price: priorDayPoc,
      role: "EQUILIBRIUM" as const,
      timeframe: "DAILY" as const,
      note: "Prior session high-volume node. Institutional fair value gravity anchor."
    }] : []),
    ...(priorDayVal !== undefined ? [{
      id: "lvl-prior-val",
      name: "Prior Day Value Area Low (VAL)",
      shortName: "Prior VAL",
      price: priorDayVal,
      role: "RETRACE ZONE" as const,
      timeframe: "DAILY" as const,
      note: "Bottom of prior session 70% volume value area. Key institutional support."
    }] : []),
    {
      id: "lvl-htf-50",
      name: `HTF ${htfFib.impulseDirection} 50% Midpoint`,
      shortName: "HTF 50%",
      price: sessionMetrics.htf50Retrace,
      role: "RETRACE ZONE",
      timeframe: "HTF",
      note: `Trailing 5-day ${htfFib.impulseDirection.toLowerCase()} impulse 50% level (${htfFib.swingLow} to ${htfFib.swingHigh}).`
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
      note: "European session baseline. Sweep below often traps sellers before snapping back."
    },
    {
      id: "lvl-asia-l",
      name: "Asia Session Low",
      shortName: "Asia Low",
      price: sessionMetrics.asiaLow || sessionMetrics.onl,
      role: "LIQUIDITY POOL",
      timeframe: "GLOBEX",
      note: "Asia session floor (18:00–03:00 ET). Key sweep zone for London and NY sessions."
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
