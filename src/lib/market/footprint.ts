import { OHLCVBar, CandleFootprintData, FootprintSummary, KeyLevel, SessionMetrics } from "@/types/market";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// 15-second in-memory cache for 1m bars
interface M1Cache {
  bars: OHLCVBar[];
  cachedAt: number;
}
let cached1m: M1Cache | null = null;
const M1_CACHE_TTL_MS = 15 * 1000;

/**
 * Computes Close Location Value (CLV) in [-1, +1]:
 * CLV = ((Close - Low) - (High - Close)) / (High - Low)
 * If range is zero, returns directional sign(Close - Open)
 */
export function computeCLV(high: number, low: number, close: number, open: number): number {
  const range = high - low;
  if (range <= 0.0001) {
    if (close > open) return 1.0;
    if (close < open) return -1.0;
    return 0.0;
  }
  const clv = ((close - low) - (high - close)) / range;
  return Math.max(-1.0, Math.min(1.0, Math.round(clv * 1000) / 1000));
}

/**
 * Aggregates constituent 1m sub-bars into a parent candle's footprint metrics:
 * - candleNetDelta
 * - totalVolume
 * - deltaRatio
 * - candlePocPrice (bucketed into 2.5 pt price bins)
 */
export function computeIntrabarDelta(
  m1Bars: OHLCVBar[],
  parentHigh: number,
  parentLow: number
): {
  netDelta: number;
  totalVolume: number;
  deltaRatio: number;
  pocPrice: number;
} {
  if (m1Bars.length === 0) {
    return {
      netDelta: 0,
      totalVolume: 0,
      deltaRatio: 0,
      pocPrice: Math.round(((parentHigh + parentLow) / 2) * 4) / 4
    };
  }

  let netDelta = 0;
  let totalVolume = 0;
  const priceBinMap = new Map<number, number>(); // 2.5 pt bins

  for (const b of m1Bars) {
    const clv = computeCLV(b.high, b.low, b.close, b.open);
    const range = Math.max(0.25, b.high - b.low);
    // Use volume if present; otherwise use tick-range proxy
    const vol = typeof b.volume === "number" && b.volume > 0 ? b.volume : Math.max(10, Math.round(range * 50));

    const delta = vol * clv;
    netDelta += delta;
    totalVolume += vol;

    // Bucket into 2.5 pt price bin based on typical price
    const typPrice = (b.high + b.low + b.close) / 3;
    const bin = Math.round(typPrice / 2.5) * 2.5;
    priceBinMap.set(bin, (priceBinMap.get(bin) || 0) + vol);
  }

  let pocPrice = Math.round(((parentHigh + parentLow) / 2) * 4) / 4;
  let maxBinVol = 0;
  for (const [bin, v] of priceBinMap) {
    if (v > maxBinVol) {
      maxBinVol = v;
      pocPrice = bin;
    }
  }

  const deltaRatio = totalVolume > 0 ? Math.max(-1, Math.min(1, netDelta / totalVolume)) : 0;

  return {
    netDelta: Math.round(netDelta),
    totalVolume: Math.round(totalVolume),
    deltaRatio: Math.round(deltaRatio * 1000) / 1000,
    pocPrice
  };
}

/**
 * Fetch trailing 1m bars for NQ=F via yahoo-finance2
 */
export async function fetch1mBars(symbol: string = "NQ=F"): Promise<OHLCVBar[]> {
  const now = Date.now();
  if (cached1m && now - cached1m.cachedAt < M1_CACHE_TTL_MS) {
    return cached1m.bars;
  }

  try {
    const period1 = new Date(Date.now() - 48 * 60 * 60 * 1000); // 2 days back
    const chartRes = await yf.chart(symbol, { period1, interval: "1m" });
    const quotes = chartRes.quotes || [];

    const bars: OHLCVBar[] = quotes
      .map((q) => {
        if (
          typeof q.open !== "number" ||
          typeof q.high !== "number" ||
          typeof q.low !== "number" ||
          typeof q.close !== "number" ||
          isNaN(q.close)
        ) {
          return null;
        }
        return {
          timestamp: new Date(q.date).toISOString(),
          open: Math.round(q.open * 100) / 100,
          high: Math.round(q.high * 100) / 100,
          low: Math.round(q.low * 100) / 100,
          close: Math.round(q.close * 100) / 100,
          volume: q.volume ?? 0
        };
      })
      .filter((b): b is OHLCVBar => b !== null);

    if (bars.length > 0) {
      cached1m = { bars, cachedAt: now };
      return bars;
    }
  } catch (err: any) {
    console.warn("Could not fetch 1m bars for NQ=F:", err?.message || err);
  }

  return [];
}

/**
 * Groups 1m bars into parent candles (5m or 15m) and detects Volume-Weighted Wick Rejection (VWWR) signals:
 * 1. Volume-Weighted Wick Rejection (VWWR BUY / VWWR SELL)
 * 2. Aggressive Sweep / Initiative (IMP+ / IMP-)
 * 3. CVD Divergence (CVD DIV) - strictly disabled unless native CME aggressor side is present.
 */
export function buildFootprintSummary(
  parentBars: OHLCVBar[],
  m1Bars: OHLCVBar[],
  timeframeSec: number = 900, // 900 for 15m, 300 for 5m
  keyLevels?: KeyLevel[],
  sessionMetrics?: SessionMetrics,
  hasNativeAggressorSide: boolean = false
): FootprintSummary {
  if (parentBars.length === 0) {
    return {
      bars: [],
      sessionCvd: 0,
      rthCvd: 0,
      disclaimer: "Free 1m-Derived Volume-Weighted Wick Rejection (Delayed — Not CME L2 Tick Flow)",
      hasNativeAggressorSide,
      lastUpdated: new Date().toISOString()
    };
  }

  // Map 1m bars into buckets based on timestamp
  const m1BucketMap = new Map<number, OHLCVBar[]>();
  for (const b of m1Bars) {
    const tsSec = Math.floor(new Date(b.timestamp).getTime() / 1000);
    const bucketTime = Math.floor(tsSec / timeframeSec) * timeframeSec;
    const arr = m1BucketMap.get(bucketTime) || [];
    arr.push(b);
    m1BucketMap.set(bucketTime, arr);
  }

  // Build footprint data per parent candle
  const footprintBars: CandleFootprintData[] = [];
  let runningSessionCvd = 0;
  let runningRthCvd = 0;

  // Track key reference prices for absorption proximity check (within 0.5x 15m ATR)
  const atrThreshold = (sessionMetrics?.atr15mIntraday || 24.5) * 0.5;
  const proximityLevels: number[] = [];
  if (sessionMetrics) {
    proximityLevels.push(sessionMetrics.sessionVwap, sessionMetrics.onh, sessionMetrics.onl, sessionMetrics.pdh, sessionMetrics.pdl, sessionMetrics.pdMid, sessionMetrics.pdc);
  }
  if (keyLevels) {
    keyLevels.forEach((k) => proximityLevels.push(k.price));
  }

  for (let i = 0; i < parentBars.length; i++) {
    const parent = parentBars[i];
    const parentTimeSec = Math.floor(new Date(parent.timestamp).getTime() / 1000);
    const bucketTime = Math.floor(parentTimeSec / timeframeSec) * timeframeSec;
    const constituentM1 = m1BucketMap.get(bucketTime) || [];

    const { netDelta, totalVolume, deltaRatio, pocPrice } = computeIntrabarDelta(
      constituentM1,
      parent.high,
      parent.low
    );

    // Identify session resets
    const dt = new Date(parentTimeSec * 1000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "numeric",
      hour12: false
    }).formatToParts(dt);
    const hourET = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const minuteET = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

    // Reset Globex CVD at 18:00 ET
    if (hourET === 18 && minuteET < Math.floor(timeframeSec / 60)) {
      runningSessionCvd = netDelta;
    } else {
      runningSessionCvd += netDelta;
    }

    // Reset RTH CVD at 09:30 ET
    if (hourET === 9 && minuteET >= 30 && minuteET < 30 + Math.floor(timeframeSec / 60)) {
      runningRthCvd = netDelta;
    } else if ((hourET === 9 && minuteET >= 30) || (hourET >= 10 && hourET < 16)) {
      runningRthCvd += netDelta;
    }

    footprintBars.push({
      timeSec: parentTimeSec,
      candleNetDelta: netDelta,
      totalVolume,
      deltaRatio,
      cvd: runningSessionCvd,
      candlePocPrice: pocPrice
    });
  }

  // ---------------------------------------------------------------------------
  // Automated Marker Detection
  // ---------------------------------------------------------------------------
  for (let i = 0; i < footprintBars.length; i++) {
    const fBar = footprintBars[i];
    const parent = parentBars[i];
    if (!parent) continue;

    // Rolling 20-bar average volume
    const lookbackStart = Math.max(0, i - 20);
    const lookbackBars = footprintBars.slice(lookbackStart, i);
    const avgVol20 =
      lookbackBars.length > 0
        ? lookbackBars.reduce((sum, b) => sum + b.totalVolume, 0) / lookbackBars.length
        : fBar.totalVolume;

    const candleRange = parent.high - parent.low;
    const bodySize = Math.abs(parent.close - parent.open);
    const bodyRatio = candleRange > 0 ? bodySize / candleRange : 1;
    const lowerWick = Math.min(parent.open, parent.close) - parent.low;
    const upperWick = parent.high - Math.max(parent.open, parent.close);
    const lowerWickRatio = candleRange > 0 ? lowerWick / candleRange : 0;
    const upperWickRatio = candleRange > 0 ? upperWick / candleRange : 0;

    // Proximity to key level
    const isNearKeyLevel = proximityLevels.some(
      (lvl) => Math.abs(parent.low - lvl) <= atrThreshold || Math.abs(parent.high - lvl) <= atrThreshold
    );

    // 1. Volume-Weighted Wick Rejection (VWWR BUY / VWWR SELL)
    // High volume (>= 1.8x avg) + small body/wick rejection (bodyRatio <= 0.35) near key level
    if (fBar.totalVolume >= 1.8 * avgVol20 && bodyRatio <= 0.35 && isNearKeyLevel) {
      if (lowerWickRatio >= 0.4) {
        fBar.signal = "VWWR_BUY";
        fBar.signalLabel = "VWWR BUY";
        fBar.signalColor = "#22d3ee"; // Cyan
      } else if (upperWickRatio >= 0.4) {
        fBar.signal = "VWWR_SELL";
        fBar.signalLabel = "VWWR SELL";
        fBar.signalColor = "#f43f5e"; // Rose
      }
    }

    // 2. Aggressive Sweep / Initiative (IMP+ / IMP-)
    // Volume >= 1.5x avg AND |deltaRatio| >= 0.65
    if (!fBar.signal && fBar.totalVolume >= 1.5 * avgVol20 && Math.abs(fBar.deltaRatio) >= 0.65) {
      if (fBar.deltaRatio > 0 && parent.close > parent.open) {
        fBar.signal = "IMP_BUY";
        fBar.signalLabel = "IMP+";
        fBar.signalColor = "#10b981"; // Emerald
      } else if (fBar.deltaRatio < 0 && parent.close < parent.open) {
        fBar.signal = "IMP_SELL";
        fBar.signalLabel = "IMP-";
        fBar.signalColor = "#f43f5e"; // Rose
      }
    }

    // 3. CVD Divergence (CVD DIV) - strictly requires native CME aggressor side data
    // Bar-derived delta proxies must NOT emit synthetic divergence signals.
    if (!fBar.signal && i >= 6 && hasNativeAggressorSide) {
      const windowStart = Math.max(0, i - 10);
      const prevParents = parentBars.slice(windowStart, i);
      const prevFootprints = footprintBars.slice(windowStart, i);

      const maxPrevHigh = Math.max(...prevParents.map((p) => p.high));
      const minPrevLow = Math.min(...prevParents.map((p) => p.low));
      const maxPrevCvd = Math.max(...prevFootprints.map((p) => p.cvd));
      const minPrevCvd = Math.min(...prevFootprints.map((p) => p.cvd));

      // Bearish CVD Divergence: Price higher high, CVD lower high
      if (parent.high > maxPrevHigh + 2 && fBar.cvd < maxPrevCvd - 50) {
        fBar.signal = "CVD_DIV_BEAR";
        fBar.signalLabel = "CVD DIV ▼";
        fBar.signalColor = "#fb923c"; // Orange
      }
      // Bullish CVD Divergence: Price lower low, CVD higher low
      else if (parent.low < minPrevLow - 2 && fBar.cvd > minPrevCvd + 50) {
        fBar.signal = "CVD_DIV_BULL";
        fBar.signalLabel = "CVD DIV ▲";
        fBar.signalColor = "#a855f7"; // Purple
      }
    }
  }

  return {
    bars: footprintBars,
    sessionCvd: runningSessionCvd,
    rthCvd: runningRthCvd,
    disclaimer: "Free 1m-Derived Volume-Weighted Wick Rejection (Delayed — Not CME L2 Tick Flow)",
    hasNativeAggressorSide,
    lastUpdated: new Date().toISOString()
  };
}
