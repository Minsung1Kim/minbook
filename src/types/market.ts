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

// ---------------- Actionable Decision & Scenario Playbook Types ----------------

export type SessionArchetype =
  | "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)"
  | "OPEN-DRIVE (RUNAWAY / SHALLOW RETRACE ONLY)"
  | "OPEN-REVERSAL / INVENTORY FLUSH"
  | "OPEN-AUCTION / CHOP PINCH";

export interface RetraceAnalysis {
  isRetraceProbable: boolean;
  probabilityPercent: number; // 0 to 100
  archetype: SessionArchetype;
  retraceType: "DEEP TO VWAP/ON-MID" | "DEEP TO VWAP/PDC" | "SHALLOW (FIRST 3-MIN PULLBACK)" | "UNLIKELY (RUNAWAY EXPANSION)" | "CHOP / TWO-WAY";
  verdictHeadline: string;
  explanation: string;
  expectedPullbackDepthPts: number;
  retraceActionAdvice: string;
}

export interface ActionScenario {
  id: string;
  condition: string; // e.g. "IF Price Retraces to VWAP (~21,085)"
  conditionShort: string; // e.g. "VWAP Test"
  whatItMeans: string; // Plain-English institutional market mechanics
  actionableDecision: string; // e.g. "WAIT FOR 1-MIN WICK ABSORPTION & ENTER LONG"
  entryTrigger: string; // Specific candle/price confirmation
  invalidation: string; // Exact hard stop price / condition
  targetObjective: string; // Target level & expected points
  trapWarning: string; // What retail traders get wrong here
  status: "ACTIVE" | "PENDING" | "INVALIDATED";
}

export interface Trader5Answers {
  biasDirection: "BULLISH CONTINUATION" | "BEARISH CONTINUATION" | "CHOP / NEUTRAL";
  biasConfidence: "HIGH" | "MODERATE" | "LOW";
  biasReason: string;
  stopHuntProbability: "HIGH (EXPECT OPENING SWEEP)" | "MODERATE" | "LOW (DIRECT DRIVE)";
  stopHuntDetails: {
    sideBeingHunted: "BUY-SIDE (ABOVE ONH)" | "SELL-SIDE (BELOW ONL/LONDON LOW)" | "BOTH (TWO-WAY WHIP)";
    sweepLevelPrice: number;
    sweepLevelName: string;
    actionableAdvice: string;
  };
  retraceLevels: Array<{
    name: string;
    price: number;
    priority: "PRIMARY (BEST R:R)" | "SECONDARY" | "DEEP VALUE";
    distancePts: number;
    note: string;
  }>;
  drawsOnLiquidity: Array<{
    name: string;
    price: number;
    type: "BUY-SIDE LIQUIDITY (RESTING BUY STOPS)" | "SELL-SIDE LIQUIDITY (RESTING SELL STOPS)" | "FAIR VALUE / VWAP PIN";
    strength: "MAGNET #1 (PRIMARY TARGET)" | "MAGNET #2" | "SECONDARY";
    pointsDistance: number;
  }>;
  rrGuidance: {
    recommendedStrategy: "LOWER R:R (1.5R – 2.0R QUICK SCALP & LOCK)" | "HIGHER R:R (2.5R – 3.5R RUNNER EXPANSION)";
    targetMultipleR: number;
    recommendedTargetPts: number;
    rationale: string;
  };
}

export interface TacticalExecutionPlan {
  singleTradeDirective: string; // The #1 actionable rule for today's 1 trade
  trader5Answers: Trader5Answers;
  retraceAnalysis: RetraceAnalysis;
  scenarios: ActionScenario[];
  timelineGuide: {
    observePhase: { timeWindow: "09:30 – 09:33 AM ET"; rule: string };
    entryWindow: { timeWindow: "09:34 – 09:48 AM ET"; rule: string; zone: string };
    managementPhase: { timeWindow: "09:48 – 10:00 AM ET"; rule: string };
  };
  vwapPlaybook: {
    price: number;
    bounceMeaning: string;
    breakdownMeaning: string;
    tradeVerdict: string;
    actionIfTested: string;
  };
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
  tacticalPlan: TacticalExecutionPlan;
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
