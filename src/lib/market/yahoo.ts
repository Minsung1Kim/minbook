import { MarketDataProvider, MacroDataResult, ChartInterval } from "./provider";
import {
  OHLCVBar,
  MarketQuote,
  EconomicEvent,
  DataStatus,
  VolatilitySurface,
  MacroRegimeState
} from "@/types/market";
import { getUSEconomicEvents } from "./economicCalendar";
import {
  computeGarmanKlassVol,
  computeYangZhangVol,
  computePearsonCorrelation,
  computeIntradayRealizedVol5m,
  computeDimensionlessVRP
} from "./math";
import YahooFinance from "yahoo-finance2";

// Initialize yahoo-finance2 client
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

export function aggregate1hTo4hBars(bars: OHLCVBar[]): OHLCVBar[] {
  if (bars.length === 0) return [];
  const sorted = [...bars].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const buckets = new Map<string, OHLCVBar>();
  const orderedKeys: string[] = [];

  for (const bar of sorted) {
    const dt = new Date(bar.timestamp);
    if (Number.isNaN(dt.getTime())) continue;

    // Anchor 4H candles to CME Globex open (18:00 ET): 18-21, 22-01, 02-05, 06-09, 10-13, 14-17
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      hour12: false,
    }).formatToParts(dt);

    const year = parseInt(parts.find((p) => p.type === "year")?.value || "1970", 10);
    const month = parseInt(parts.find((p) => p.type === "month")?.value || "1", 10);
    const day = parseInt(parts.find((p) => p.type === "day")?.value || "1", 10);
    const rawHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const hourET = rawHour === 24 ? 0 : rawHour;

    // Shift date forward by 1 day if hour >= 18 so 18:00-01:59 share the same CME trade day key
    const anchorDate = new Date(Date.UTC(year, month - 1, day));
    if (hourET >= 18) {
      anchorDate.setUTCDate(anchorDate.getUTCDate() + 1);
    }
    const dayKey = anchorDate.toISOString().slice(0, 10);
    const slot = Math.floor(((hourET + 6) % 24) / 4);
    const bucketKey = `${dayKey}_${slot}`;

    const existing = buckets.get(bucketKey);
    if (!existing) {
      orderedKeys.push(bucketKey);
      buckets.set(bucketKey, {
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 0,
      });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume ?? 0;
    }
  }

  return orderedKeys.map((k) => buckets.get(k)!);
}

export class YahooFinanceProvider implements MarketDataProvider {
  readonly name = "Yahoo Finance (CME Globex)";
  private quoteCache = new Map<string, CacheEntry<MarketQuote>>();
  private chartCache = new Map<string, CacheEntry<OHLCVBar[]>>();
  private macroCache: CacheEntry<MacroDataResult> | null = null;
  private lastKnownGoodQuote: Map<string, MarketQuote> = new Map();

  isConfigured(): boolean {
    return true;
  }

  clearCache(): void {
    this.quoteCache.clear();
    this.chartCache.clear();
    this.macroCache = null;
  }

  private mapSymbol(symbol: string): string {
    const s = symbol.toUpperCase().trim();
    if (s === "NQ" || s === "NQ=F") return "NQ=F";
    if (s === "MNQ" || s === "MNQ=F") return "MNQ=F";
    if (s === "ES" || s === "ES=F") return "ES=F";
    if (s === "QQQ") return "QQQ";
    if (s === "NDX" || s === "^NDX") return "^NDX";
    return s;
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const yfSymbol = this.mapSymbol(symbol);
    const cacheKey = `quote_${yfSymbol}`;
    const cached = this.quoteCache.get(cacheKey);

    // 15-second cache to prevent 429 rate-limiting while allowing rapid updates
    if (cached && Date.now() - cached.cachedAt < 15000) {
      return cached.data;
    }

    try {
      const q = await yf.quote(yfSymbol);
      if (!q || q.regularMarketPrice === undefined) {
        throw new Error(`Invalid quote payload for ${yfSymbol}`);
      }

      const price = q.regularMarketPrice;
      const previousClose = q.regularMarketPreviousClose ?? q.chartPreviousClose ?? price;
      const change = q.regularMarketChange ?? (price - previousClose);
      const changePercent = q.regularMarketChangePercent ?? (previousClose > 0 ? (change / previousClose) * 100 : 0);

      const high = q.regularMarketDayHigh ?? price;
      const low = q.regularMarketDayLow ?? price;
      const open = q.regularMarketDayOpen ?? price;
      const volume = q.regularMarketVolume ?? 0;

      // Extract exchange delay reported directly by Yahoo / CME (typically 10-15 mins on free feed)
      const isFutures = yfSymbol.endsWith("=F");
      const delayMins = isFutures ? (q.exchangeDataDelayedBy ?? 10) : 0;
      const exchangeTime = q.regularMarketTime ? new Date(q.regularMarketTime).toISOString() : new Date().toISOString();
      const stalenessSeconds = q.regularMarketTime
        ? Math.max(0, Math.round((Date.now() - new Date(q.regularMarketTime).getTime()) / 1000))
        : isFutures ? 600 : 10;

      // Label accurately: CME free feeds are delayed by exchange rules; equities (QQQ) during RTH are closer to real-time
      const status: DataStatus = isFutures ? "DELAYED" : stalenessSeconds < 180 ? "LIVE" : "DELAYED";

      const quote: MarketQuote = {
        symbol: yfSymbol,
        displaySymbol: symbol.toUpperCase().startsWith("MNQ") ? "MNQ" : yfSymbol === "QQQ" ? "QQQ" : "NQ",
        price: Math.round(price * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        open: Math.round(open * 100) / 100,
        previousClose: Math.round(previousClose * 100) / 100,
        volume,
        timestamp: exchangeTime,
        source: isFutures ? `CME Globex (${delayMins}m delayed feed)` : "Nasdaq Real-Time / BATS (QQQ)",
        status,
        stalenessSeconds
      };

      this.quoteCache.set(cacheKey, { data: quote, cachedAt: Date.now() });
      this.lastKnownGoodQuote.set(yfSymbol, quote);
      return quote;
    } catch (err: any) {
      console.warn(`Yahoo quote error for ${yfSymbol}:`, err?.message || err);
      const lastKnown = this.lastKnownGoodQuote.get(yfSymbol);
      if (lastKnown) {
        return {
          ...lastKnown,
          source: `${lastKnown.source} (cached)`
        };
      }
      throw err;
    }
  }

  async getDailyBars(symbol: string, days: number = 30): Promise<OHLCVBar[]> {
    const yfSymbol = this.mapSymbol(symbol);
    const cacheKey = `daily_${yfSymbol}_${days}`;
    const cached = this.chartCache.get(cacheKey);

    if (cached && Date.now() - cached.cachedAt < 60000) {
      return cached.data;
    }

    try {
      const period1 = new Date(Date.now() - (days + 15) * 24 * 3600 * 1000);
      const chart = await yf.chart(yfSymbol, {
        period1,
        interval: "1d"
      });

      const bars: OHLCVBar[] = (chart.quotes || [])
        .filter(
          (q): q is typeof q & { open: number; high: number; low: number; close: number } =>
            typeof q.open === "number" &&
            typeof q.high === "number" &&
            typeof q.low === "number" &&
            typeof q.close === "number" &&
            !isNaN(q.close)
        )
        .map((q) => ({
          timestamp: new Date(q.date).toISOString(),
          open: Math.round(q.open * 100) / 100,
          high: Math.round(q.high * 100) / 100,
          low: Math.round(q.low * 100) / 100,
          close: Math.round(q.close * 100) / 100,
          volume: q.volume ?? 0
        }));

      this.chartCache.set(cacheKey, { data: bars, cachedAt: Date.now() });
      return bars;
    } catch (err: any) {
      console.warn(`Yahoo getDailyBars error for ${yfSymbol}:`, err?.message || err);
      if (yfSymbol !== "QQQ") {
        try {
          return await this.getDailyBars("QQQ", days);
        } catch {}
      }
      throw err;
    }
  }

  async getIntradayBars(symbol: string, interval: ChartInterval = "15m"): Promise<OHLCVBar[]> {
    const yfSymbol = this.mapSymbol(symbol);
    const cacheKey = `intraday_${yfSymbol}_${interval}`;
    const cached = this.chartCache.get(cacheKey);

    const ttlMs = interval === "1h" || interval === "4h" ? 60000 : 20000;
    if (cached && Date.now() - cached.cachedAt < ttlMs) {
      return cached.data;
    }

    try {
      const lookbackDays =
        interval === "1m"
          ? 2
          : interval === "5m"
          ? 4
          : interval === "1h"
          ? 30
          : interval === "4h"
          ? 45
          : 5;
      const yfInterval = interval === "4h" ? "1h" : interval;
      const period1 = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000);
      let rawBars: OHLCVBar[] = await fetchYahooChartBars(
        yfSymbol,
        period1,
        yfInterval as "1m" | "5m" | "15m" | "1h"
      );

      // If CME futures intraday chart stalls (common on holidays/extended gaps) while the quote feed is ahead,
      // bridge missing bars using time-aligned QQQ (for NQ/MNQ) or SPY (for ES) extended-hours bars.
      const proxySymbol = getFuturesProxySymbol(yfSymbol);
      if (proxySymbol) {
        try {
          const futQuote = await this.getQuote(yfSymbol);
          const futQuoteMs = new Date(futQuote.timestamp).getTime();
          const lastBarMs =
            rawBars.length > 0 ? new Date(rawBars[rawBars.length - 1].timestamp).getTime() : 0;
          const gapMs = futQuoteMs - lastBarMs;

          if (
            Number.isFinite(futQuote.price) &&
            futQuote.price > 0 &&
            Number.isFinite(futQuoteMs) &&
            (rawBars.length === 0 || gapMs > 30 * 60 * 1000)
          ) {
            const proxyPeriod1 =
              lastBarMs > 0
                ? new Date(Math.max(period1.getTime(), lastBarMs - 2 * 3600 * 1000))
                : period1;

            const [proxyBars, proxy1mBars, proxyQuote] = await Promise.all([
              fetchYahooChartBars(
                proxySymbol,
                proxyPeriod1,
                yfInterval as "1m" | "5m" | "15m" | "1h"
              ),
              yfInterval !== "1m"
                ? fetchYahooChartBars(
                    proxySymbol,
                    new Date(Math.min(Date.now(), futQuoteMs) - 6 * 3600 * 1000),
                    "1m"
                  ).catch(() => [])
                : Promise.resolve([] as OHLCVBar[]),
              this.getQuote(proxySymbol).catch(() => null)
            ]);

            const proxyAnchor =
              findTimeAlignedProxyPrice(proxy1mBars.length > 0 ? proxy1mBars : proxyBars, futQuoteMs) ??
              findTimeAlignedProxyPrice(proxyBars, futQuoteMs) ??
              (proxyQuote && Math.abs(new Date(proxyQuote.timestamp).getTime() - futQuoteMs) < 10 * 60 * 1000
                ? proxyQuote.price
                : null);

            if (proxyAnchor && proxyAnchor > 0 && proxyBars.length > 0) {
              const bridged = translateProxyBarsToFutures({
                futuresBars: rawBars,
                proxyBars,
                futuresSpot: futQuote.price,
                proxyAnchorPrice: proxyAnchor,
                maxTimestampMs: futQuoteMs,
                intervalSec:
                  yfInterval === "1m" ? 60 : yfInterval === "5m" ? 300 : yfInterval === "1h" ? 3600 : 900
              });
              if (bridged.bridgedCount > 0) {
                rawBars = bridged.bars;
              }
            }
          }
        } catch (proxyErr: unknown) {
          const msg = proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
          console.warn(`Futures proxy bridge skipped for ${yfSymbol}:`, msg);
        }
      }

      const bars = interval === "4h" ? aggregate1hTo4hBars(rawBars) : rawBars;

      this.chartCache.set(cacheKey, { data: bars, cachedAt: Date.now() });
      return bars;
    } catch (err: any) {
      console.warn(`Yahoo getIntradayBars error for ${yfSymbol}:`, err?.message || err);
      throw err;
    }
  }

  async getMacroData(): Promise<MacroDataResult> {
    if (this.macroCache && Date.now() - this.macroCache.cachedAt < 30000) {
      return this.macroCache.data;
    }

    // Default fallbacks
    let vxnPrice = 24.5;
    let volqPrice: number | undefined = undefined;
    let vixPrice = 21.5;
    let vix3mPrice = 22.8;
    let vix9dPrice = 20.8;
    let vix1dPrice = 20.0;
    let vvixPrice = 96.0;

    let znPrice = 110.25;
    let znChange = 0.05;
    let znPercentChange = 0.05;
    let rateSource: MacroRegimeState["rateSource"] = "CME_ZN_FUTURES_23H";

    let us10yPrice = 4.45;
    let us10yChange = 0.02;
    let dxyPrice = 104.2;
    let dxyChange = 0.15;

    // Fetch Volatility Surface Quotes & 23h ZN in parallel
    try {
      const [qVxn, qVolq, qVix, qVix3m, qVix9d, qVix1d, qVvix, qZn, qTnx, qDxy] = await Promise.allSettled([
        yf.quote("^VXN"),
        yf.quote("^VOLQ"),
        yf.quote("^VIX"),
        yf.quote("^VIX3M"),
        yf.quote("^VIX9D"),
        yf.quote("^VIX1D"),
        yf.quote("^VVIX"),
        yf.quote("ZN=F"),
        yf.quote("^TNX"),
        yf.quote("DX-Y.NYB")
      ]);

      if (qVxn.status === "fulfilled" && qVxn.value?.regularMarketPrice) vxnPrice = qVxn.value.regularMarketPrice;
      if (qVolq.status === "fulfilled" && qVolq.value?.regularMarketPrice) volqPrice = qVolq.value.regularMarketPrice;
      if (qVix.status === "fulfilled" && qVix.value?.regularMarketPrice) vixPrice = qVix.value.regularMarketPrice;
      if (qVix3m.status === "fulfilled" && qVix3m.value?.regularMarketPrice) vix3mPrice = qVix3m.value.regularMarketPrice;
      if (qVix9d.status === "fulfilled" && qVix9d.value?.regularMarketPrice) vix9dPrice = qVix9d.value.regularMarketPrice;
      if (qVix1d.status === "fulfilled" && qVix1d.value?.regularMarketPrice) vix1dPrice = qVix1d.value.regularMarketPrice;
      if (qVvix.status === "fulfilled" && qVvix.value?.regularMarketPrice) vvixPrice = qVvix.value.regularMarketPrice;
      if (qZn.status === "fulfilled" && qZn.value?.regularMarketPrice) {
        znPrice = qZn.value.regularMarketPrice;
        znChange = qZn.value.regularMarketChange ?? 0;
        znPercentChange = qZn.value.regularMarketChangePercent ?? 0;
        rateSource = "CME_ZN_FUTURES_23H";
      }
      if (qTnx.status === "fulfilled" && qTnx.value?.regularMarketPrice) {
        us10yPrice = qTnx.value.regularMarketPrice;
        us10yChange = qTnx.value.regularMarketChange ?? 0;
      }
      if (qDxy.status === "fulfilled" && qDxy.value?.regularMarketPrice) {
        dxyPrice = qDxy.value.regularMarketPrice;
        dxyChange = qDxy.value.regularMarketChange ?? 0;
      }
    } catch (e) {
      console.warn("Volatility surface quote fetch partial error:", e);
    }

    // Fetch QQQ live proxy quote
    let qqqProxyQuote: MarketQuote | undefined;
    try {
      qqqProxyQuote = await this.getQuote("QQQ");
    } catch {}

    // Fetch ES=F quote and bars for Cross-Index SMT Divergence
    let esData: MacroDataResult["esData"] | undefined;
    try {
      const [esQuote, esDaily, esIntraday] = await Promise.all([
        this.getQuote("ES=F"),
        this.getDailyBars("ES=F", 5),
        this.getIntradayBars("ES=F", "15m")
      ]);
      esData = {
        quote: esQuote,
        dailyBars: esDaily,
        intradayBars: esIntraday
      };
    } catch (e) {
      console.warn("ES=F SMT data fetch error:", e);
    }

    // Fetch 65 daily bars of NQ=F and ^TNX, plus 5m intraday bars for 5m RV
    let dailyNqBars: OHLCVBar[] = [];
    let dailyTnxBars: OHLCVBar[] = [];
    let intraday5mBars: OHLCVBar[] = [];
    try {
      [dailyNqBars, dailyTnxBars, intraday5mBars] = await Promise.all([
        this.getDailyBars("NQ=F", 65),
        this.getDailyBars("^TNX", 65),
        this.getIntradayBars("NQ=F", "5m").catch(() => [])
      ]);
    } catch (e) {
      console.warn("Daily history fetch for realized vol / correlation error:", e);
    }

    // Realized Volatility Estimators (Yang-Zhang, Garman-Klass, and 5-minute Intraday)
    const recent20NqBars = dailyNqBars.slice(-20);
    const recent10NqBars = dailyNqBars.slice(-10);
    const realizedVolYZ20d = computeYangZhangVol(recent20NqBars);
    const realizedVolYZ10d = computeYangZhangVol(recent10NqBars);
    const realizedVolGK = computeGarmanKlassVol(recent20NqBars);
    const realizedVol5m = computeIntradayRealizedVol5m(intraday5mBars);

    // Dimensionless Variance Risk Premium (VRP Ratio = IV / RV_5m)
    const effectiveIv = volqPrice || vxnPrice;
    const vrpResult = computeDimensionlessVRP(effectiveIv, realizedVol5m > 0 ? realizedVol5m : realizedVolYZ20d);
    const vrpRatio = vrpResult.vrpRatio;
    const isNegativeVrp = vrpResult.isNegativeVrp;
    const vrp = Math.round((effectiveIv - realizedVolYZ20d) * 100) / 100; // legacy difference

    // Term Structure & Vol-of-Vol Triggers
    const termRatio = Math.round((vixPrice / (vix3mPrice > 0 ? vix3mPrice : 22)) * 100) / 100;
    const termStructureRegime =
      termRatio > 1.0 ? "BACKWARDATION (STRESS)" : termRatio >= 0.95 ? "ELEVATED" : "CONTANGO (NORMAL)";

    const shortTermShockRatio = Math.round((vix9dPrice / (vixPrice > 0 ? vixPrice : 20)) * 100) / 100;
    const isShortTermShock = shortTermShockRatio > 1.15;

    const vvixRegime =
      vvixPrice >= 110
        ? "HIGH TAIL / SHARP REVERSAL RISK (>=110)"
        : vvixPrice >= 100
        ? "CAUTION (100-110)"
        : "NORMAL (<100)";

    const volatilitySurface: VolatilitySurface = {
      vxn: Math.round(vxnPrice * 100) / 100,
      volq: volqPrice ? Math.round(volqPrice * 100) / 100 : undefined,
      vix: Math.round(vixPrice * 100) / 100,
      vix3m: Math.round(vix3mPrice * 100) / 100,
      vix9d: Math.round(vix9dPrice * 100) / 100,
      vix1d: Math.round(vix1dPrice * 100) / 100,
      vvix: Math.round(vvixPrice * 100) / 100,
      termRatio,
      termStructureRegime,
      shortTermShockRatio,
      isShortTermShock,
      vvixRegime,
      realizedVolYZ20d,
      realizedVolYZ10d,
      realizedVolGK,
      realizedVol5m,
      vrp,
      vrpRatio,
      isNegativeVrp
    };

    // Rolling 60-day Pearson Correlation between NQ and TNX
    const nqCloses = dailyNqBars.map((b) => b.close);
    const tnxCloses = dailyTnxBars.map((b) => b.close);
    const stockBondCorrelation60d = computePearsonCorrelation(nqCloses, tnxCloses);

    let macroCorrelationRegime: MacroRegimeState["macroCorrelationRegime"] = "DECOUPLED / NEUTRAL";
    if (stockBondCorrelation60d < -0.2) {
      macroCorrelationRegime = "INFLATION / RATE-SENSITIVE";
    } else if (stockBondCorrelation60d > 0.2) {
      macroCorrelationRegime = "GROWTH-SCARE";
    }

    // Macro Headwind / Tailwind scoring driven by 23h CME ZN Futures pre-market
    const tnxBpsChange = Math.round(us10yChange * 100 * 10) / 10;
    const dxyPercentChange = dxyPrice > 0 ? Math.round((dxyChange / dxyPrice) * 10000) / 100 : 0;

    let macroHeadwindScore = 0;
    if (macroCorrelationRegime === "INFLATION / RATE-SENSITIVE") {
      // In rate-sensitive regime, rising ZN (falling yields) is tailwind (+1); falling ZN (rising yields) is headwind (-1)
      if (znPercentChange > 0.15) macroHeadwindScore += 1;
      else if (znPercentChange < -0.15) macroHeadwindScore -= 1;
      else if (tnxBpsChange > 3) macroHeadwindScore -= 1;
      else if (tnxBpsChange < -3) macroHeadwindScore += 1;
    } else if (macroCorrelationRegime === "GROWTH-SCARE") {
      if (znPercentChange > 0.2) macroHeadwindScore -= 1; // Flight to safety on growth fear
      else if (znPercentChange < -0.2) macroHeadwindScore += 1;
      else if (tnxBpsChange < -3) macroHeadwindScore -= 1;
      else if (tnxBpsChange > 3) macroHeadwindScore += 1;
    }

    if (dxyPercentChange > 0.3) macroHeadwindScore -= 1;
    else if (dxyPercentChange < -0.3) macroHeadwindScore += 1;

    let macroSummary = `60d NQ-Rate correlation is ${stockBondCorrelation60d.toFixed(2)} (${macroCorrelationRegime}). 23h ZN: ${znPrice} (${znPercentChange >= 0 ? "+" : ""}${znPercentChange.toFixed(2)}%).`;
    if (macroCorrelationRegime === "INFLATION / RATE-SENSITIVE") {
      macroSummary += tnxBpsChange > 0 ? " Rising yields act as equity headwinds." : " Falling yields offer equity tailwinds.";
    }

    const macroRegime: MacroRegimeState = {
      stockBondCorrelation60d,
      macroCorrelationRegime,
      tnxPrice: Math.round(us10yPrice * 1000) / 1000,
      tnxBpsChange,
      znPrice: Math.round(znPrice * 1000) / 1000,
      znChange: Math.round(znChange * 1000) / 1000,
      znPercentChange: Math.round(znPercentChange * 100) / 100,
      rateSource,
      dxyPrice: Math.round(dxyPrice * 100) / 100,
      dxyPercentChange,
      macroHeadwindScore,
      macroSummary
    };

    const macro: MacroDataResult = {
      vix: {
        symbol: "^VIX",
        name: "CBOE Volatility Index",
        value: Math.round(vixPrice * 100) / 100,
        change: Math.round((vixPrice - 20) * 100) / 100,
        status: "LIVE",
        source: "CBOE (^VIX)",
        regime: termStructureRegime,
        note: `VIX at ${vixPrice.toFixed(2)} • VIX/VIX3M: ${termRatio}`
      },
      us10y: {
        symbol: "^TNX",
        name: "10-Year US Treasury Yield",
        value: Math.round(us10yPrice * 1000) / 1000,
        change: Math.round(us10yChange * 1000) / 1000,
        status: "LIVE",
        source: "Treasury (^TNX)",
        regime: macroCorrelationRegime,
        note: `10Y at ${us10yPrice.toFixed(3)}% (${tnxBpsChange >= 0 ? "+" : ""}${tnxBpsChange} bps)`
      },
      dxy: {
        symbol: "DX-Y.NYB",
        name: "US Dollar Index",
        value: Math.round(dxyPrice * 100) / 100,
        change: Math.round(dxyChange * 100) / 100,
        status: "LIVE",
        source: "ICE (DX-Y.NYB)",
        regime: dxyPercentChange > 0.2 ? "DOLLAR SURGE" : dxyPercentChange < -0.2 ? "DOLLAR SOFT" : "STABLE",
        note: `DXY at ${dxyPrice.toFixed(2)} (${dxyPercentChange >= 0 ? "+" : ""}${dxyPercentChange}%)`
      },
      volatilitySurface,
      macroRegime,
      qqqProxyQuote,
      esData,
      megaCaps: [
        { symbol: "AAPL", name: "Apple", price: 349.08, changePercent: 0.92 },
        { symbol: "NVDA", name: "NVIDIA", price: 165.05, changePercent: 1.48 },
        { symbol: "MSFT", name: "Microsoft", price: 472.10, changePercent: 0.65 },
        { symbol: "AMZN", name: "Amazon", price: 231.40, changePercent: 1.15 },
        { symbol: "META", name: "Meta", price: 692.30, changePercent: 1.34 },
        { symbol: "GOOGL", name: "Alphabet", price: 204.50, changePercent: 0.42 }
      ],
      dealerGammaTilt: {
        regime: isNegativeVrp || termRatio > 1.0 ? "NEGATIVE GAMMA (HIGH ACCELERATION / VOL DISLOCATION)" : "POSITIVE GAMMA (STICKY/CHOPPY)",
        source: "DERIVED_HEURISTIC",
        note: isNegativeVrp
          ? "RV > IV (Negative VRP): Realized volatility exceeds pricing; stop runs are frequent."
          : "Implied volatility maintains premium over realized."
      }
    };

    this.macroCache = { data: macro, cachedAt: Date.now() };
    return macro;
  }

  async getEconomicEvents(): Promise<EconomicEvent[]> {
    return getUSEconomicEvents();
  }
}

export async function fetchYahooChartBars(
  symbol: string,
  period1: Date,
  interval: "1m" | "5m" | "15m" | "1h",
  includePrePost: boolean = true
): Promise<OHLCVBar[]> {
  type ChartOpts = NonNullable<Parameters<typeof yf.chart>[1]>;
  const opts = { period1, interval, includePrePost } as ChartOpts;
  const chart = await yf.chart(symbol, opts);
  const quotes = (chart as { quotes?: Parameters<typeof mapYahooQuotesToBars>[0] })?.quotes || [];
  return mapYahooQuotesToBars(quotes);
}

export function getFuturesProxySymbol(yfSymbol: string): "QQQ" | "SPY" | null {
  if (yfSymbol === "NQ=F" || yfSymbol === "MNQ=F") return "QQQ";
  if (yfSymbol === "ES=F") return "SPY";
  return null;
}

export function mapYahooQuotesToBars(
  quotes: Array<{
    date: Date | string | number;
    open?: number | null;
    high?: number | null;
    low?: number | null;
    close?: number | null;
    volume?: number | null;
  }>
): OHLCVBar[] {
  return (quotes || [])
    .filter(
      (q): q is typeof q & { open: number; high: number; low: number; close: number } =>
        typeof q.open === "number" &&
        typeof q.high === "number" &&
        typeof q.low === "number" &&
        typeof q.close === "number" &&
        !isNaN(q.close)
    )
    .map((q) => ({
      timestamp: new Date(q.date).toISOString(),
      open: Math.round(q.open * 100) / 100,
      high: Math.round(q.high * 100) / 100,
      low: Math.round(q.low * 100) / 100,
      close: Math.round(q.close * 100) / 100,
      volume: q.volume ?? 0
    }));
}

/**
 * Clamps isolated extended-hours odd-lot bad-tick wicks (e.g. a single pre-market print
 * > 0.6% away from candle body that neither adjacent candle corroborates).
 */
export function sanitizeProxyWickOutliers(bars: OHLCVBar[]): OHLCVBar[] {
  if (bars.length < 2) return bars.map((b) => ({ ...b }));

  return bars.map((bar, idx) => {
    const prev = idx > 0 ? bars[idx - 1] : null;
    const next = idx < bars.length - 1 ? bars[idx + 1] : null;
    const bodyLow = Math.min(bar.open, bar.close);
    const bodyHigh = Math.max(bar.open, bar.close);
    if (bodyLow <= 0 || bodyHigh <= 0) return { ...bar };

    let nextLow = bar.low;
    let nextHigh = bar.high;

    const downExcursion = bodyLow - bar.low;
    if (downExcursion / bodyLow > 0.006) {
      const threshold = bodyLow - downExcursion * 0.45;
      const prevClean = !prev || prev.low > threshold;
      const nextClean = !next || next.low > threshold;
      if (prevClean && nextClean) {
        const anchorFloor = Math.min(
          bodyLow,
          prev ? prev.low : bodyLow,
          next ? next.low : bodyLow
        );
        nextLow = Math.max(anchorFloor, Math.round(bodyLow * 0.9975 * 100) / 100);
        nextLow = Math.min(bodyLow, nextLow);
      }
    }

    const upExcursion = bar.high - bodyHigh;
    if (upExcursion / bodyHigh > 0.006) {
      const threshold = bodyHigh + upExcursion * 0.45;
      const prevClean = !prev || prev.high < threshold;
      const nextClean = !next || next.high < threshold;
      if (prevClean && nextClean) {
        const anchorCeil = Math.max(
          bodyHigh,
          prev ? prev.high : bodyHigh,
          next ? next.high : bodyHigh
        );
        nextHigh = Math.min(anchorCeil, Math.round(bodyHigh * 1.0025 * 100) / 100);
        nextHigh = Math.max(bodyHigh, nextHigh);
      }
    }

    return {
      ...bar,
      low: nextLow,
      high: nextHigh
    };
  });
}

export function findTimeAlignedProxyPrice(
  proxyBars: OHLCVBar[],
  targetMs: number,
  maxDeltaMs: number = 30 * 60 * 1000
): number | null {
  if (!Number.isFinite(targetMs) || proxyBars.length === 0) return null;

  let bestCausalBar: OHLCVBar | null = null;
  let bestCausalDiff = Infinity;
  let bestAnyBar: OHLCVBar | null = null;
  let bestAnyDiff = Infinity;

  for (const bar of proxyBars) {
    const ms = new Date(bar.timestamp).getTime();
    if (!Number.isFinite(ms)) continue;
    const diff = Math.abs(targetMs - ms);
    if (diff > maxDeltaMs) continue;

    if (ms <= targetMs && diff < bestCausalDiff) {
      bestCausalDiff = diff;
      bestCausalBar = bar;
    }
    if (diff < bestAnyDiff) {
      bestAnyDiff = diff;
      bestAnyBar = bar;
    }
  }

  return (bestCausalBar ?? bestAnyBar)?.close ?? null;
}

export interface TranslateProxyBarsInput {
  futuresBars: OHLCVBar[];
  proxyBars: OHLCVBar[];
  futuresSpot: number;
  proxyAnchorPrice: number;
  maxTimestampMs?: number;
  intervalSec?: number;
}

/**
 * Translates ETF proxy bars (QQQ -> NQ=F/MNQ=F, SPY -> ES=F) after the latest
 * available futures bar using time-aligned basis ratio scaling, aligning the final
 * in-progress candle cleanly with the live/delayed futures quote price.
 */
export function translateProxyBarsToFutures({
  futuresBars,
  proxyBars,
  futuresSpot,
  proxyAnchorPrice,
  maxTimestampMs,
  intervalSec = 900
}: TranslateProxyBarsInput): { bars: OHLCVBar[]; bridgedCount: number; ratio: number } {
  if (!Number.isFinite(futuresSpot) || futuresSpot <= 0 || !Number.isFinite(proxyAnchorPrice) || proxyAnchorPrice <= 0) {
    return { bars: futuresBars, bridgedCount: 0, ratio: 0 };
  }

  const ratio = futuresSpot / proxyAnchorPrice;
  const lastFuturesBarMs =
    futuresBars.length > 0 ? new Date(futuresBars[futuresBars.length - 1].timestamp).getTime() : 0;

  const cleanedProxy = sanitizeProxyWickOutliers(proxyBars);
  const translated: OHLCVBar[] = [];

  for (const p of cleanedProxy) {
    const pMs = new Date(p.timestamp).getTime();
    if (!Number.isFinite(pMs)) continue;
    if (lastFuturesBarMs > 0 && pMs <= lastFuturesBarMs) continue;
    if (maxTimestampMs !== undefined && pMs > maxTimestampMs) continue;

    const open = Math.round(p.open * ratio * 100) / 100;
    const high = Math.round(p.high * ratio * 100) / 100;
    const low = Math.round(p.low * ratio * 100) / 100;
    const close = Math.round(p.close * ratio * 100) / 100;
    const range = Math.max(0.25, high - low);
    // Extended-hours proxy bars often report 0 volume; preserve non-zero VWAP/footprint weighting
    const volume = p.volume > 0 ? p.volume : Math.max(10, Math.round(range * 50));

    translated.push({
      timestamp: p.timestamp,
      open,
      high,
      low,
      close,
      volume
    });
  }

  if (translated.length === 0) {
    return { bars: futuresBars, bridgedCount: 0, ratio };
  }

  // Align the closing candle to the current futures quote price when maxTimestampMs falls in/near the tail bar
  if (maxTimestampMs !== undefined) {
    const tail = translated[translated.length - 1];
    const tailMs = new Date(tail.timestamp).getTime();
    if (maxTimestampMs - tailMs <= Math.max(intervalSec * 1000, 15 * 60 * 1000)) {
      const alignedClose = Math.round(futuresSpot * 100) / 100;
      translated[translated.length - 1] = {
        ...tail,
        close: alignedClose,
        high: Math.max(tail.high, alignedClose),
        low: Math.min(tail.low, alignedClose)
      };
    }
  }

  return {
    bars: [...futuresBars, ...translated],
    bridgedCount: translated.length,
    ratio
  };
}
