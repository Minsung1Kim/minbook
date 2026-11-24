import type { CMESessionInfo, CMESessionPhase } from "@/lib/market/sessionClock";

export type DataStatus = "LIVE" | "DELAYED" | "DERIVED" | "MANUAL INPUT" | "SAMPLE";

export type SessionPhase =
  | "PRE_MARKET_BRIEF"
  | "DEVELOPING_OVERNIGHT"
  | "PRE_MARKET_LOCK"
  | "NY_OPEN_WINDOW_930_1000"
  | "POST_WINDOW"
  | "POST_WINDOW_RECAP"
  | "CME_BREAK_OR_WEEKEND";

export type ExecutionWindowSubPhase =
  | "PRE_BELL"
  | "OPEN_NOISE_SWEEP_WATCH"
  | "PRIME_RETRACE_WINDOW"
  | "LATE_WINDOW_DECAY_CAUTION"
  | "WINDOW_CLOSED";

export interface GammaStrike {
  strike: number;
  strikeNq: number;
  callGex: number;
  putGex: number;
  netGex: number;
  isCallWall?: boolean;
  isPutWall?: boolean;
  isGammaFlip?: boolean;
}

export interface GEXExposureData {
  netGammaRegime: "POSITIVE_GAMMA" | "NEGATIVE_GAMMA";
  totalNetGex: number; // in $
  totalCallGex: number;
  totalPutGex: number;
  zeroDteNetGex: number;
  gammaFlipNq: number;
  callWallNq: number;
  putWallNq: number;
  topGammaStrikes: GammaStrike[];
  underlyingPrice: number; // QQQ or NDX spot
  nqSpotPrice: number;
  basisRatio: number;
  source: "CBOE_NDX_DELAYED" | "CBOE_QQQ_DELAYED" | "YF_QQQ_MODEL_BS" | "SAMPLE_FALLBACK";
  disclaimer: "DELAYED OI-BASED GEX ESTIMATE (NOT LIVE DEALER INVENTORY)";
  lastUpdated: string;
}

export type FootprintSignalType = "ABS_BUY" | "ABS_SELL" | "IMP_BUY" | "IMP_SELL" | "CVD_DIV_BULL" | "CVD_DIV_BEAR";

export interface CandleFootprintData {
  timeSec: number;
  candleNetDelta: number;
  totalVolume: number;
  deltaRatio: number;
  cvd: number;
  candlePocPrice: number;
  signal?: FootprintSignalType;
  signalLabel?: string;
  signalColor?: string;
}

export interface FootprintSummary {
  bars: CandleFootprintData[];
  sessionCvd: number;
  rthCvd: number;
  disclaimer: "Free 1m-Derived Intrabar Delta Proxy (Delayed — Not CME L2 Tick Flow)";
  lastUpdated: string;
}

export interface SMTSwingPoint {
  timeSec: number; // Unix seconds
  price: number;
  label: string; // e.g. "LL", "HL", "HH", "LH"
}

export interface SMTDivergence {
  hasDivergence: boolean;
  divergenceType:
    | "BULLISH_SMT (NQ SWEPT LOW, ES HELD)"
    | "BEARISH_SMT (NQ SWEPT HIGH, ES HELD)"
    | "BULLISH_SMT (ES SWEPT LOW, NQ HELD)"
    | "BEARISH_SMT (ES SWEPT HIGH, NQ HELD)"
    | "NONE (SYNCED)";
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  leadingAsset: "ES" | "NQ" | "NEUTRAL";
  sweptAsset: "NQ" | "ES" | "NONE";
  nqPrice: number;
  esPrice: number;
  nqHigh: number;
  nqLow: number;
  esHigh: number;
  esLow: number;
  nqMadeNewHigh?: boolean;
  nqMadeNewLow?: boolean;
  esMadeNewHigh?: boolean;
  esMadeNewLow?: boolean;
  nqSwingPoints?: [SMTSwingPoint, SMTSwingPoint]; // Point 1 and Point 2 connecting the dotted line
  notes: string;
  institutionalMechanism: string;
  mssTriggerInstruction: string;
}

export interface VolatilitySurface {
  vxn: number; // Nasdaq 30d IV
  vix: number; // SPX 30d IV
  vix3m: number; // 3-month IV
  vix9d: number; // 9-day IV
  vix1d: number; // 1-day IV (or fallback)
  vvix: number; // Vol of VIX
  termRatio: number; // vix / vix3m
  termStructureRegime: "CONTANGO (NORMAL)" | "ELEVATED" | "BACKWARDATION (STRESS)";
  shortTermShockRatio: number; // vix9d / vix
  isShortTermShock: boolean; // > 1.15
  vvixRegime: "NORMAL (<100)" | "CAUTION (100-110)" | "HIGH TAIL / WHIPSAW RISK (>=110)";
  realizedVolYZ20d: number; // Yang-Zhang 20d annualized RV
  realizedVolYZ10d: number; // Yang-Zhang 10d annualized RV
  realizedVolGK: number; // Garman-Klass annualized RV
  vrp: number; // Variance Risk Premium = vxn - realizedVolYZ20d
  isNegativeVrp: boolean; // RV > IV (stop-run dislocation warning)
}

export interface MacroRegimeState {
  stockBondCorrelation60d: number; // Pearson r between NQ and TNX
  macroCorrelationRegime: "INFLATION / RATE-SENSITIVE" | "GROWTH-SCARE" | "DECOUPLED / NEUTRAL";
  tnxPrice: number;
  tnxBpsChange: number;
  dxyPrice: number;
  dxyPercentChange: number;
  macroHeadwindScore: number; // -2 to +2 impact on NQ
  macroSummary: string;
}

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
  | "EXPECTED MOVE"
  | "TARGET";

export interface KeyLevel {
  id: string;
  name: string;
  shortName: string;
  price: number;
  role: LevelRole;
  distancePoints: number;
  distancePercent: number;
  timeframe: "DAILY" | "GLOBEX" | "INTRADAY" | "HTF" | "VOLATILITY";
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
  globexVwap: number;
  priorDayRthVwap: number;
  rthSessionVwap: number;
  vwapCalculationMode: "VOLUME_WEIGHTED" | "TWAP_FALLBACK";
  htf50Retrace: number;
  htf618Retrace: number;
  htf705Retrace: number;
  htfImpulseDirection: "BULLISH" | "BEARISH";
  htfImpulseHigh: number;
  htfImpulseLow: number;
  expectedMove1SD: number;
  expectedMoveStraddle: number;
  upper1SD: number;
  lower1SD: number;
  upperStraddle: number;
  lowerStraddle: number;
  overnightRangeConsumedPercent: number;
  atr14Daily: number;
  atr15mIntraday: number;
  overnightRange: number;
  overnightInventory: "BULLISH_IMBALANCE" | "BEARISH_IMBALANCE" | "BALANCED";
  inventoryPercent: number; // 0% to 100% of Globex bars closing above PDC
  openingGap: number;
  openingLocation:
    | "ABOVE_ONH"
    | "INSIDE_UPPER_GLOBEX"
    | "AROUND_EQUILIBRIUM"
    | "INSIDE_LOWER_GLOBEX"
    | "BELOW_ONL";
  smtDivergence?: SMTDivergence;
  targetTradeDate?: string;
  priorTradeDate?: string;
  globexStatus?: "INITIALIZING" | "ACTIVE" | "FINALIZED";
}

export type BiasVerdict =
  | "CONTINUATION FAVORED (BULLISH)"
  | "CONTINUATION FAVORED (BEARISH)"
  | "CAUTION / CHOP RISK"
  | "STAND ASIDE / HIGH VOL";

export interface FactorScoreItem {
  factor: string;
  score: number; // -1, 0, or +1
  impact: "BULLISH" | "BEARISH" | "NEUTRAL";
  detail: string;
}

export interface BiasRegime {
  verdict: BiasVerdict;
  confidence: "HIGH" | "MODERATE" | "LOW";
  htfTrend: "BULLISH" | "BEARISH" | "NEUTRAL / RANGING";
  chopRisk: "LOW" | "ELEVATED" | "SEVERE";
  regimeRiskMultiplier: 1.0 | 0.5 | 0.0;
  summary: string;
  drivers: string[];
  risks: string[];
  volatilitySurface?: VolatilitySurface;
  macroRegime?: MacroRegimeState;
  gex?: GEXExposureData;
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
  probabilityPercent?: number; // Optional legacy percentage
  likelihoodTier: "HIGH" | "MODERATE" | "LOW";
  factorScorecard: FactorScoreItem[];
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
  stopHuntProbability: "HIGH (EXPECT OPENING SWEEP)" | "MODERATE" | "LOW (DIRECT DRIVE)" | string;
  stopHuntDetails: {
    sideBeingHunted: "BUY-SIDE (ABOVE ONH)" | "SELL-SIDE (BELOW ONL/LONDON LOW)" | "BOTH (TWO-WAY WHIP)" | string;
    sweepLevelPrice: number;
    sweepLevelName: string;
    actionableAdvice: string;
    targetPoolType?: "BUY-SIDE LIQUIDITY (BSL)" | "SELL-SIDE LIQUIDITY (SSL)" | "RANGE COMPRESSION (TWO-WAY)";
    institutionalMechanism?: string;
    theTrap?: string;
    theShiftMSS?: string;
    traderDirective?: string;
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
  sessionPhase: SessionPhase;
  executionSubPhase: ExecutionWindowSubPhase;
  isDelayedFeedWarningActive: boolean;
  delayedFeedBannerText: string;
  newsBufferWarning?: string;
  qqqLiveProxy?: MarketQuote;
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
  sessionInfo?: CMESessionInfo;
  cmePhase?: CMESessionPhase;
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
  date: string; // YYYY-MM-DD
  timeET: string;
  event: string;
  country: "USD";
  impact: "HIGH" | "MEDIUM" | "LOW";
  folderColor: "RED" | "ORANGE";
  forecast?: string;
  previous?: string;
  actual?: string;
  alert: boolean;
  notes: string;
  marketImpact?: string; // Short & simple explanation on how it affects the market (required for red news)
  isNearOpenWindow?: boolean; // Scheduled near 9:30–10:00 AM NY open
}

export interface OpenBriefData {
  tradeDate: string; // YYYY-MM-DD
  targetTradeDate?: string;
  priorTradeDate?: string;
  sessionInfo?: CMESessionInfo;
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
    volatilitySurface?: VolatilitySurface;
    macroRegime?: MacroRegimeState;
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
  intradayBars?: OHLCVBar[];
  gex?: GEXExposureData;
  footprint?: FootprintSummary;
}
