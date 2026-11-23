import { MarketDataProvider, MacroDataResult } from "./provider";
import { OHLCVBar, MarketQuote, EconomicEvent } from "@/types/market";
import { YahooFinanceProvider } from "./yahoo";

export class PolygonProvider implements MarketDataProvider {
  readonly name = "Polygon.io";
  private apiKey: string;
  private yahooFallback: YahooFinanceProvider;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.POLYGON_API_KEY || "";
    this.yahooFallback = new YahooFinanceProvider();
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    if (!this.isConfigured()) {
      return this.yahooFallback.getQuote(symbol);
    }

    try {
      // Map futures NQ to QQQ or I:NDX if on starter Polygon plan
      const polyTicker = symbol.toUpperCase().startsWith("NQ") ? "QQQ" : symbol.toUpperCase();
      const url = `https://api.polygon.io/v2/aggs/ticker/${polyTicker}/prev?adjusted=true&apiKey=${this.apiKey}`;
      const res = await fetch(url, { next: { revalidate: 30 } });
      const data = await res.json();

      if (!res.ok || !data?.results?.[0]) {
        return this.yahooFallback.getQuote(symbol);
      }

      const r = data.results[0];
      const isProxy = polyTicker === "QQQ";
      const scaleMultiplier = isProxy ? 41.13 : 1; // Approximate synthetic NQ ratio

      const price = (r.c ?? 0) * scaleMultiplier;
      const previousClose = (r.c ?? 0) * scaleMultiplier;
      const change = 0;
      const changePercent = 0;

      return {
        symbol: polyTicker,
        displaySymbol: symbol.toUpperCase().startsWith("MNQ") ? "MNQ" : "NQ",
        price: Math.round(price * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        high: Math.round((r.h ?? price) * scaleMultiplier * 100) / 100,
        low: Math.round((r.l ?? price) * scaleMultiplier * 100) / 100,
        open: Math.round((r.o ?? price) * scaleMultiplier * 100) / 100,
        previousClose: Math.round(previousClose * 100) / 100,
        volume: r.v ?? 0,
        timestamp: new Date(r.t).toISOString(),
        source: `Polygon.io (${polyTicker}${isProxy ? " -> Synthetic NQ" : ""})`,
        status: isProxy ? "DERIVED" : "DELAYED",
        stalenessSeconds: Math.max(0, Math.round((Date.now() - r.t) / 1000))
      };
    } catch {
      return this.yahooFallback.getQuote(symbol);
    }
  }

  async getDailyBars(symbol: string, days?: number): Promise<OHLCVBar[]> {
    return this.yahooFallback.getDailyBars(symbol, days);
  }

  async getIntradayBars(symbol: string, interval?: "1m" | "5m" | "15m"): Promise<OHLCVBar[]> {
    return this.yahooFallback.getIntradayBars(symbol, interval);
  }

  async getMacroData(): Promise<MacroDataResult> {
    return this.yahooFallback.getMacroData();
  }

  async getEconomicEvents(): Promise<EconomicEvent[]> {
    return this.yahooFallback.getEconomicEvents();
  }
}
