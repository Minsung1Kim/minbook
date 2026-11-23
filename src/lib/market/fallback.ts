import { MarketDataProvider, MacroDataResult } from "./provider";
import { OHLCVBar, MarketQuote, EconomicEvent } from "@/types/market";
import { getUSEconomicEvents } from "./economicCalendar";

export class SeedFallbackProvider implements MarketDataProvider {
  readonly name = "Seed / Demo Provider";

  isConfigured(): boolean {
    return true;
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const isMNQ = symbol.toUpperCase().startsWith("MNQ");
    const basePrice = 26778.75;
    const prevClose = 26517.0;
    const change = basePrice - prevClose;
    const changePercent = (change / prevClose) * 100;

    return {
      symbol: isMNQ ? "MNQ" : "NQ",
      displaySymbol: isMNQ ? "MNQ" : "NQ",
      price: basePrice,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      high: 26860.5,
      low: 26690.0,
      open: 26580.0,
      previousClose: prevClose,
      volume: 185420,
      timestamp: new Date().toISOString(),
      source: "Market Baseline (Today)",
      status: "LIVE",
      stalenessSeconds: 15
    };
  }

  async getDailyBars(symbol: string, days: number = 30): Promise<OHLCVBar[]> {
    const bars: OHLCVBar[] = [];
    const now = Date.now();
    let currentPrice = 26517.0;

    for (let i = days; i >= 1; i--) {
      const dayMs = now - i * 24 * 60 * 60 * 1000;
      const open = currentPrice;
      const drift = (Math.sin(i * 0.4) * 120) + 25;
      const high = open + Math.abs(drift) + 110;
      const low = open - Math.abs(drift) - 90;
      const close = open + drift;
      currentPrice = close;

      bars.push({
        timestamp: new Date(dayMs).toISOString(),
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume: 380000 + Math.floor(Math.random() * 100000)
      });
    }
    return bars;
  }

  async getIntradayBars(symbol: string, interval: "1m" | "5m" | "15m" = "15m"): Promise<OHLCVBar[]> {
    const bars: OHLCVBar[] = [];
    const count = 40;
    const stepMs = interval === "1m" ? 60000 : interval === "5m" ? 300000 : 900000;
    const startTime = Date.now() - count * stepMs;
    let price = 26740.0;

    for (let i = 0; i < count; i++) {
      const t = startTime + i * stepMs;
      const o = price;
      const delta = (Math.random() - 0.46) * 18;
      const c = o + delta;
      const h = Math.max(o, c) + Math.random() * 12;
      const l = Math.min(o, c) - Math.random() * 12;
      price = c;

      bars.push({
        timestamp: new Date(t).toISOString(),
        open: Math.round(o * 100) / 100,
        high: Math.round(h * 100) / 100,
        low: Math.round(l * 100) / 100,
        close: Math.round(c * 100) / 100,
        volume: 2200 + Math.floor(Math.random() * 2500)
      });
    }
    return bars;
  }

  async getMacroData(): Promise<MacroDataResult> {
    return {
      vix: {
        symbol: "^VIX",
        name: "CBOE Volatility Index",
        value: 26.62,
        change: -0.45,
        changePercent: -1.66,
        status: "LIVE",
        source: "Market Baseline",
        regime: "ELEVATED (20-28)",
        note: "Elevated volatility; wider stops and patience on retrace required"
      },
      us10y: {
        symbol: "^TNX",
        name: "10-Year US Treasury Yield",
        value: 4.918,
        change: 0.006,
        status: "LIVE",
        source: "Market Baseline",
        regime: "MODERATE",
        note: "Yields stable at 4.918%"
      },
      dxy: {
        symbol: "DX-Y.NYB",
        name: "US Dollar Index",
        value: 104.34,
        change: 0.12,
        status: "LIVE",
        source: "Market Baseline",
        regime: "NEUTRAL",
        note: "DXY at 104.34"
      },
      volatilitySurface: {
        vxn: 25.4,
        vix: 21.8,
        vix3m: 23.1,
        vix9d: 21.2,
        vix1d: 20.8,
        vvix: 98.5,
        termRatio: 0.94,
        termStructureRegime: "CONTANGO (NORMAL)",
        shortTermShockRatio: 0.97,
        isShortTermShock: false,
        vvixRegime: "NORMAL (<100)",
        realizedVolYZ20d: 22.4,
        realizedVolYZ10d: 21.8,
        realizedVolGK: 23.1,
        vrp: 3.0,
        isNegativeVrp: false
      },
      macroRegime: {
        stockBondCorrelation60d: -0.34,
        macroCorrelationRegime: "INFLATION / RATE-SENSITIVE",
        tnxPrice: 4.918,
        tnxBpsChange: 0.6,
        dxyPrice: 104.34,
        dxyPercentChange: 0.11,
        macroHeadwindScore: 0,
        macroSummary: "60d NQ-10Y correlation is -0.34 (INFLATION / RATE-SENSITIVE). Yields stable."
      },
      megaCaps: [
        { symbol: "AAPL", name: "Apple", price: 349.08, changePercent: 0.92 },
        { symbol: "NVDA", name: "NVIDIA", price: 165.05, changePercent: 1.48 },
        { symbol: "MSFT", name: "Microsoft", price: 472.10, changePercent: 0.65 },
        { symbol: "AMZN", name: "Amazon", price: 231.40, changePercent: 1.15 },
        { symbol: "META", name: "Meta", price: 692.30, changePercent: 1.34 },
        { symbol: "GOOGL", name: "Alphabet", price: 204.50, changePercent: 0.42 }
      ],
      dealerGammaTilt: {
        regime: "NEGATIVE GAMMA (HIGH ACCELERATION)",
        source: "DERIVED_HEURISTIC",
        note: "VIX > 25 indicates dealers short gamma. Fast impulsive breakouts likely."
      }
    };
  }

  async getEconomicEvents(): Promise<EconomicEvent[]> {
    return getUSEconomicEvents();
  }
}
