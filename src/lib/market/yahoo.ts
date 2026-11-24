import { MarketDataProvider, MacroDataResult } from "./provider";
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

export class YahooFinanceProvider implements MarketDataProvider {
  readonly name = "Yahoo Finance (CME Globex)";
  private quoteCache = new Map<string, CacheEntry<MarketQuote>>();
  private chartCache = new Map<string, CacheEntry<OHLCVBar[]>>();
  private macroCache: CacheEntry<MacroDataResult> | null = null;
  private lastKnownGoodQuote: Map<string, MarketQuote> = new Map();

  isConfigured(): boolean {
    return true;
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

  async getIntradayBars(symbol: string, interval: "1m" | "5m" | "15m" = "15m"): Promise<OHLCVBar[]> {
    const yfSymbol = this.mapSymbol(symbol);
    const cacheKey = `intraday_${yfSymbol}_${interval}`;
    const cached = this.chartCache.get(cacheKey);

    if (cached && Date.now() - cached.cachedAt < 20000) {
      return cached.data;
    }

    try {
      const period1 = new Date(Date.now() - 4 * 24 * 3600 * 1000);
      const chart = await yf.chart(yfSymbol, {
        period1,
        interval: interval as any
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
        ? "HIGH TAIL / WHIPSAW RISK (>=110)"
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
