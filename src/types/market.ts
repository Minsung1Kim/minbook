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
  basisSyncStatus?: "SYNCHRONOUS" | "LOCKED_TO_PRIOR_SETTLEMENT" | "UNVERIFIED";
  basisTimestampDeltaSeconds?: number;
  source: "CBOE_NDX_DELAYED" | "CBOE_QQQ_DELAYED" | "YF_QQQ_MODEL_BS" | "SAMPLE_FALLBACK";
  disclaimer: "DELAYED OI-BASED GEX ESTIMATE (NOT LIVE DEALER INVENTORY)";
  lastUpdated: string;
}

export type FootprintSignalType =
  | "VWWR_BUY"
  | "VWWR_SELL"
  | "IMP_BUY"
  | "IMP_SELL"
  | "CVD_DIV_BULL"
  | "CVD_DIV_BEAR"
  | "ABS_BUY"
  | "ABS_SELL";

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
  disclaimer: string;
  hasNativeAggressorSide?: boolean;
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
  volq?: number; // Nasdaq-100 30d ATM Volatility
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
  realizedVol5m?: number; // 5-minute intraday realized volatility
  vrp: number; // Legacy difference = vxn - realizedVol
  vrpRatio: number; // Dimensionless VRP ratio = IV / RV (e.g. 1.15)
  isNegativeVrp: boolean; // RV > IV (vrpRatio < 1.0, stop-run dislocation warning)
}

export interface MacroRegimeState {
  stockBondCorrelation60d: number; // Pearson r between NQ and TNX/ZN
  macroCorrelationRegime: "INFLATION / RATE-SENSITIVE" | "GROWTH-SCARE" | "DECOUPLED / NEUTRAL";
  tnxPrice: number;
  tnxBpsChange: number;
  znPrice?: number; // 23-hour CME 10Y Note Futures price
  znChange?: number; // Price change in ZN
  znPercentChange?: number;
  rateSource: "CME_ZN_FUTURES_23H" | "TNX_CASH_INDEX";
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
  atrOpen15m: number; // Median range of trailing 15 sessions' 09:30–09:45 ET opening bar
  priorDayVah?: number;
  priorDayPoc?: number;
  priorDayVal?: number;
  pdcSource?: "CME_1600_SETTLEMENT" | "DAILY_BAR_FALLBACK";
  straddleCoveragePercent?: number;
  coverageLabel?: string;
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

export interface Layer1RiskGates {
  sizeMultiplier: 1.0 | 0.5 | 0.0;
  targetCapMultipleR: number; // e.g. 1.8 for positive gamma/chop pin, 2.2 for normal
  allowTrading: boolean;
  activeVetoes: string[];
  gateDetails: string[];
  volatilityState: {
    vrpRatio: number;
    isNegativeVrp: boolean;
    termRatio: number;
    vvix: number;
    termStructureRegime: string;
  };
  gexGate?: {
    regime: string;
    targetCapR: number;
    pinningRisk: boolean;
  };
  reversalVetoActive: boolean;
  reversalVetoReason?: string;
}

export interface Layer2DirectionalSignal {
  id: "compositeLocation" | "smtBreadth" | "macroImpulse" | "openingFlow";
  name: string;
  score: -1 | 0 | 1;
  impact: "BULLISH" | "BEARISH" | "NEUTRAL";
  weight: number; // Baseline 1.0
  detail: string;
}

export interface Layer2DirectionalScore {
  signals: Layer2DirectionalSignal[];
  totalScore: number; // Sum of score * weight [-4, +4]
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  verdict: BiasVerdict;
  confidence: "HIGH" | "MODERATE" | "LOW";
  summary: string;
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
  layer1RiskGates?: Layer1RiskGates;
  layer2DirectionalScore?: Layer2DirectionalScore;
  ltfTradeCard?: LTFTradeCard;
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
  layer1RiskGates?: Layer1RiskGates;
  layer2DirectionalScore?: Layer2DirectionalScore;
  ltfTradeCard?: LTFTradeCard;
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
  ltfTradeCard?: LTFTradeCard;
}

// ---------------- LTF Execution & Prop-Firm Risk Engine Types ----------------

export type DrawdownMode = "EOD_TRAILING" | "INTRADAY_UNREALIZED";

export interface PropProfile {
  id: string;
  firmName: string;
  accountName: string;
  drawdownMode: DrawdownMode;
  maxTrailingDrawdown: number;
  currentRemainingDrawdown: number;
  cycleProfitTarget: number;
  consistencyRulePercent?: number;
  dailyLossLimit?: number;
  mnqFeeRoundTrip: number;
  nqFeeRoundTrip: number;
  defaultSlippageTicks: number;
  newsBlackoutMinutes: number;
  prohibitOvernight: boolean;
  slippagePts?: number;
  feePerContractRT?: number;
}

export interface ReachabilityTarget {
  price: number;
  distancePts: number;
  hitProb5m: number;
  hitProb10m: number;
  hitProb15m: number;
  rationale: string;
}

export interface HTFDemotedLevel {
  name: string;
  price: number;
  distancePts: number;
  hitProb10m: number;
  badge: string;
}

export interface LTFTradeCard {
  status: "OBSERVATION_LOCK" | "ARMED_RETRACE" | "ARMED_SWEEP_REVERSAL" | "STAND_ASIDE";
  archetype: "RETRACE_CONTINUATION" | "SWEEP_MSS_REVERSAL" | "OBSERVATION_FREEZE";
  direction: "LONG" | "SHORT";
  entryZone: {
    low: number;
    high: number;
    mid: number;
  };
  stopLoss: number;
  stopPts: number;
  antiChaseWarning: boolean;
  antiChaseMessage?: string;
  tp1: ReachabilityTarget;
  tp2: ReachabilityTarget;
  htfDemotedLevels: HTFDemotedLevel[];
  killSwitchPrice: number;
  killSwitchMessage: string;
  contracts: number;
  contractSplitDirective: string;
  netRR: number;
  netTargetDollars: number;
  netRiskDollars: number;
  orh3m?: number;
  orl3m?: number;
  initialImpulseRange?: number;
  propProfile?: PropProfile;
  phantomDrawdownWarning?: string;
  consistencyCapWarning?: string;
  newsBlackoutWarning?: string;
}
