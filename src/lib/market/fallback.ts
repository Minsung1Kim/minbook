import { MarketDataProvider, MacroDataResult } from "./provider";
import { OHLCVBar, MarketQuote, EconomicEvent } from "@/types/market";

export class SeedFallbackProvider implements MarketDataProvider {
  readonly name = "Seed / Demo Provider";

  isConfigured(): boolean {
    return true;
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const isMNQ = symbol.toUpperCase().startsWith("MNQ");
    const basePrice = 21085.25;
    const prevClose = 21020.0;
    const change = basePrice - prevClose;
    const changePercent = (change / prevClose) * 100;

    return {
      symbol: isMNQ ? "MNQ (Sample)" : "NQ (Sample)",
      displaySymbol: isMNQ ? "MNQ" : "NQ",
      price: basePrice,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      high: 21124.5,
      low: 21012.0,
      open: 21035.0,
      previousClose: prevClose,
      volume: 48520,
      timestamp: new Date().toISOString(),
      source: "Sample Fallback Feed (Offline/Unconfigured Mode)",
      status: "SAMPLE",
      stalenessSeconds: 0
    };
  }

  async getDailyBars(symbol: string, days: number = 30): Promise<OHLCVBar[]> {
    const bars: OHLCVBar[] = [];
    const now = Date.now();
    let currentPrice = 21020.0;

    for (let i = days; i >= 1; i--) {
      const dayMs = now - i * 24 * 60 * 60 * 1000;
      const open = currentPrice;
      const drift = (Math.sin(i * 0.5) * 60) + 15;
      const high = open + Math.abs(drift) + 80;
      const low = open - Math.abs(drift) - 60;
      const close = open + drift;
      currentPrice = close;

      bars.push({
        timestamp: new Date(dayMs).toISOString(),
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume: 350000 + Math.floor(Math.random() * 100000)
      });
    }
    return bars;
  }

  async getIntradayBars(symbol: string, interval: "1m" | "5m" | "15m" = "15m"): Promise<OHLCVBar[]> {
    const bars: OHLCVBar[] = [];
    const count = 40;
    const stepMs = interval === "1m" ? 60000 : interval === "5m" ? 300000 : 900000;
    const startTime = Date.now() - count * stepMs;
    let price = 21020.0;

    for (let i = 0; i < count; i++) {
      const t = startTime + i * stepMs;
      const o = price;
      const delta = (Math.random() - 0.45) * 12;
      const c = o + delta;
      const h = Math.max(o, c) + Math.random() * 8;
      const l = Math.min(o, c) - Math.random() * 8;
      price = c;

      bars.push({
        timestamp: new Date(t).toISOString(),
        open: Math.round(o * 100) / 100,
        high: Math.round(h * 100) / 100,
        low: Math.round(l * 100) / 100,
        close: Math.round(c * 100) / 100,
        volume: 1200 + Math.floor(Math.random() * 2000)
      });
    }
    return bars;
  }

  async getMacroData(): Promise<MacroDataResult> {
    return {
      vix: {
        symbol: "^VIX",
        name: "CBOE Volatility Index",
        value: 16.42,
        change: -0.38,
        changePercent: -2.26,
        status: "SAMPLE",
        source: "Seed Fallback Data",
        regime: "NORMAL (14-20)",
        note: "Ideal continuation conditions; low chop expansion"
      },
      us10y: {
        symbol: "^TNX",
        name: "10-Year US Treasury Yield",
        value: 4.415,
        change: -0.025,
        status: "SAMPLE",
        source: "Seed Fallback Data",
        regime: "MODERATE",
        note: "Yields stable, non-disruptive to Tech growth multiples"
      },
      dxy: {
        symbol: "DX-Y.NYB",
        name: "US Dollar Index (DXY)",
        value: 104.15,
        change: 0.08,
        status: "SAMPLE",
        source: "Seed Fallback Data",
        regime: "NEUTRAL",
        note: "DXY consolidating"
      },
      megaCaps: [
        { symbol: "AAPL", name: "Apple Inc.", price: 228.5, changePercent: 0.85 },
        { symbol: "NVDA", name: "NVIDIA Corp.", price: 142.1, changePercent: 1.45 },
        { symbol: "MSFT", name: "Microsoft Corp.", price: 425.0, changePercent: 0.62 },
        { symbol: "AMZN", name: "Amazon.com Inc.", price: 202.8, changePercent: 1.12 },
        { symbol: "META", name: "Meta Platforms", price: 588.2, changePercent: 0.94 },
        { symbol: "GOOGL", name: "Alphabet Inc.", price: 175.4, changePercent: 0.48 }
      ],
      dealerGammaTilt: {
        regime: "POSITIVE GAMMA (STICKY/CHOPPY)",
        source: "DERIVED_HEURISTIC",
        note: "Dealers long gamma around 21,000/21,100 strikes. Expect mean-reversion unless volume expands 2x."
      }
    };
  }

  async getEconomicEvents(): Promise<EconomicEvent[]> {
    return [
      {
        id: "ev-demo-01",
        timeET: "08:30 AM",
        event: "Initial Jobless Claims",
        impact: "HIGH",
        forecast: "215K",
        previous: "217K",
        actual: "213K",
        alert: false,
        notes: "Pre-market release absorbed without trend disruption."
      },
      {
        id: "ev-demo-02",
        timeET: "09:45 AM",
        event: "S&P Global Manufacturing & Services PMI",
        impact: "HIGH",
        forecast: "54.0",
        previous: "53.8",
        alert: true,
        notes: "WATCH 9:45 AM ET: Spread widening expected. Protect open retrace profit."
      },
      {
        id: "ev-demo-03",
        timeET: "10:00 AM",
        event: "ISM Services PMI / Factory Orders",
        impact: "HIGH",
        forecast: "55.2",
        previous: "54.9",
        alert: true,
        notes: "10:00 AM ET milestone. Target or trailing stop should be engaged before print."
      }
    ];
  }
}
