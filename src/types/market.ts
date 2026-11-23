export type DataStatus = "LIVE" | "DELAYED" | "DERIVED" | "MANUAL INPUT" | "SAMPLE";

export interface OHLCVBar {
  timestamp: string; // ISO string
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketQuote {
  symbol: string;
  displaySymbol: "NQ" | "MNQ" | "QQQ";
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
  timestamp: string;
  source: string;
  status: DataStatus;
  stalenessSeconds: number;
}

export type LevelRole =
  | "LIQUIDITY POOL"
  | "RETRACE ZONE"
  | "EQUILIBRIUM"
  | "MAGNET"
  | "INVALIDATION"
  | "TARGET";

export interface KeyLevel {
  id: string;
  name: string;
  shortName: string;
  price: number;
  role: LevelRole;
  distancePoints: number;
  distancePercent: number;
  timeframe: "DAILY" | "GLOBEX" | "INTRADAY" | "HTF";
  note: string;
}

export interface SessionMetrics {
  pdh: number;
  pdl: number;
  pdc: number;
  pdMid: number;
  onh: number;
  onl: number;
  onMid: number;
  londonHigh?: number;
  londonLow?: number;
  asiaHigh?: number;
  asiaLow?: number;
  sessionVwap: number;
  htf50Retrace: number;
  htf618Retrace: number;
  htfImpulseHigh: number;
  htfImpulseLow: number;
  atr14Daily: number;
  atr15mIntraday: number;
  overnightRange: number;
  overnightInventory: "BULLISH_IMBALANCE" | "BEARISH_IMBALANCE" | "BALANCED";
  inventoryPercent: number; // e.g. +72% above PDC
  openingGap: number;
  openingLocation:
    | "ABOVE_ONH"
    | "INSIDE_UPPER_GLOBEX"
    | "AROUND_EQUILIBRIUM"
    | "INSIDE_LOWER_GLOBEX"
    | "BELOW_ONL";
}

export type BiasVerdict =
  | "CONTINUATION FAVORED (BULLISH)"
  | "CONTINUATION FAVORED (BEARISH)"
  | "CAUTION / CHOP RISK"
  | "STAND ASIDE / HIGH VOL";

export interface BiasRegime {
  verdict: BiasVerdict;
  confidence: "HIGH" | "MODERATE" | "LOW";
  htfTrend: "BULLISH" | "BEARISH" | "NEUTRAL / RANGING";
  chopRisk: "LOW" | "ELEVATED" | "SEVERE";
  summary: string;
  drivers: string[];
  risks: string[];
  idealRetraceZone: {
    startPrice: number;
    endPrice: number;
    description: string;
  };
}

export interface SizingGuidance {
  userRiskDollars: number;
  userTargetDollars: number;
  selectedInstrument: "NQ" | "MNQ";
  nqPointValue: number;
  mnqPointValue: number;
  maxStopPointsNQ: number;
  maxStopPointsMNQ: number;
  stopClippingRisk: boolean;
  stopClippingReason: string;
  recommendedSizing: {
    instrument: "NQ" | "MNQ";
    contracts: number;
    stopPoints: number;
    targetPoints: number;
    riskDollars: number;
    targetDollars: number;
    rrRatio: number;
    summary: string;
  };
  mnqAlternatives: Array<{
    contracts: number;
    stopPoints: number;
    riskDollars: number;
    comfortLevel: "TIGHT" | "RECOMMENDED" | "CONSERVATIVE";
  }>;
}

export interface MacroIndicator {
  symbol: string;
  name: string;
  value: number;
  change: number;
  changePercent?: number;
  status: DataStatus;
  source: string;
  regime: string;
  note: string;
}

export interface EconomicEvent {
  id: string;
  timeET: string;
  event: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  forecast?: string;
  previous?: string;
  actual?: string;
  alert: boolean;
  notes: string;
}

export interface OpenBriefData {
  tradeDate: string; // YYYY-MM-DD
  generatedAt: string;
  instrument: "NQ" | "MNQ";
  underlyingAsset: string;
  quote: MarketQuote;
  sessionMetrics: SessionMetrics;
  keyLevels: KeyLevel[];
  bias: BiasRegime;
  riskGuidance: SizingGuidance;
  macro: {
    vix: MacroIndicator;
    us10y: MacroIndicator;
    dxy: MacroIndicator;
    megaCaps: Array<{
      symbol: string;
      name: string;
      price: number;
      changePercent: number;
    }>;
    events: EconomicEvent[];
    dealerGammaTilt: {
      regime: string;
      source: "DERIVED_HEURISTIC" | "MANUAL INPUT";
      note: string;
    };
  };
  dataSource: {
    providerName: string;
    quoteStatus: DataStatus;
    levelsStatus: DataStatus;
    lastUpdated: string;
    cacheExpiresAt: string;
    notice: string;
  };
}
