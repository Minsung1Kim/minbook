import { OHLCVBar, MarketQuote, MacroIndicator, EconomicEvent, VolatilitySurface, MacroRegimeState } from "@/types/market";

export interface MacroDataResult {
  vix: MacroIndicator;
  us10y: MacroIndicator;
  dxy: MacroIndicator;
  volatilitySurface?: VolatilitySurface;
  macroRegime?: MacroRegimeState;
  qqqProxyQuote?: MarketQuote;
  esData?: {
    quote: MarketQuote;
    dailyBars: OHLCVBar[];
    intradayBars: OHLCVBar[];
  };
  megaCaps: Array<{
    symbol: string;
    name: string;
    price: number;
    changePercent: number;
  }>;
  dealerGammaTilt: {
    regime: string;
    source: "DERIVED_HEURISTIC" | "MANUAL INPUT";
    note: string;
  };
}

export interface MarketDataProvider {
  readonly name: string;
  isConfigured(): boolean;
  getQuote(symbol: string): Promise<MarketQuote>;
  getDailyBars(symbol: string, days?: number): Promise<OHLCVBar[]>;
  getIntradayBars(symbol: string, interval?: "1m" | "5m" | "15m"): Promise<OHLCVBar[]>;
  getMacroData(): Promise<MacroDataResult>;
  getEconomicEvents(): Promise<EconomicEvent[]>;
  clearCache?(): void;
}
