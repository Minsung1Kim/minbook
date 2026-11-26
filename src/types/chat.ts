import type { UIMessage } from "ai";
import type { AccountDrawdownMode } from "./market";

export type MarketStalenessBadge = "FRESH" | "DELAYED" | "STALE" | "SAMPLE";

export const CHAT_MODEL_ID = "gemini-3.5-flash-lite";
export const CHAT_FALLBACK_MODEL_ID = "gemini-3.6-flash";
export const CHAT_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
] as const;
export const CHAT_MODEL_LABEL = "Gemini 3.5 Flash-Lite";

export type ChatMode = "LIVE_SCALP" | "DEEP_DIVE";
export type ChatModePreference = "AUTO" | ChatMode;

export type ScalpSetupArchetype =
  | "SWEEP_MSS_REVERSAL"
  | "RETRACE_CONTINUATION"
  | "VWAP_ONMID_PULLBACK"
  | "OPEN_RANGE_BREAK"
  | "UNKNOWN";

export type SessionWindow =
  | "NY_OPEN_0930_1000"
  | "NY_AM_1000_1130"
  | "NY_LUNCH_1130_1330"
  | "NY_PM_1330_1600"
  | "OVERNIGHT_GLOBEX";

export interface ExtractedChartState {
  instrument: "NQ" | "MNQ";
  liveSpot: number;
  timeframe: string;
  orderState: "OPEN_POSITION" | "PENDING_LIMIT_ORDER" | "MARKET_ENTRY_NOW" | "ANALYSIS_ONLY";
  direction: "LONG" | "SHORT" | "NONE";
  entryPx: number | null;
  entryZoneLow: number | null;
  entryZoneHigh: number | null;
  stopPx: number | null;
  tp1Px: number | null;
  tp2Px: number | null;
  contracts: number;
  detectedSetupArchetype: ScalpSetupArchetype;
  visibleKeyLevels: Array<{ label: string; price: number }>;
  newsCountdownMinutes?: number | null;
  newsImpact?: "RED_HIGH" | "ORANGE_MEDIUM" | "YELLOW_LOW" | "UNKNOWN";
  newsEventName?: string | null;
  accountBalance?: number | null;
  openPnlDollars?: number | null;
  candleOHLC?: { open: number; high: number; low: number; close: number } | null;
}

export interface ScalpAccountProfile {
  accountDrawdownMode: AccountDrawdownMode;
  riskBudgetDollars?: number;
  maxContracts?: number;
  atr5mDiurnalPts?: number;
  sessionStreak?: number;
  currentMinuteET?: number;
}

export interface DoubleBarrierOdds {
  tp1HitBeforeSlPct5m: number;
  tp1HitBeforeSlPct10m: number;
  tp1HitBeforeSlPct15m: number;
  tp2HitBeforeSlPct15m: number | null;
  driftPtsPerMin: number;
  sigma1mPts: number;
  model: "ABSORBING_DOUBLE_BARRIER_T4";
}

export interface ContractSizingUnit {
  riskBudgetDollars: number;
  mnqContracts: number;
  actualRiskDollars: number;
}

export interface ScalpJournalTrade {
  id: string;
  userId: string;
  slideNumber: number | null;
  tradeDate: string;
  entryTimeET: string;
  instrument: "NQ" | "MNQ";
  direction: "LONG" | "SHORT";
  contracts: number;
  sessionWindow: SessionWindow | string;
  setupArchetype: ScalpSetupArchetype | string;
  stopPts: number;
  tp1Pts: number | null;
  realizedR: number;
  mfePts: number;
  maePts: number;
  gexRegime: string;
  playbookArchetype: string;
  executionGrade: string;
  mistakeTags: string[];
  traderNotes: string;
  importSource?: "PDF_SLIDES" | "JSON" | "CSV" | "GOOGLE_SLIDES_API" | "MANUAL";
  createdAt?: string;
}

export interface JournalQueryResult {
  matchedCount: number;
  overallTotalTrades: number;
  overallWinRatePct: number;
  empiricalWinRatePct: number | null;
  shrunkWinRatePct: number;
  winRateSource: "JOURNAL_EMPIRICAL" | "JOURNAL_SHRUNK" | "BASELINE_45PCT";
  avgRealizedR: number;
  relevantTrades: Array<{
    id: string;
    tradeDate: string;
    setupArchetype: string;
    sessionWindow: string;
    gexRegime: string;
    realizedR: number;
    executionGrade: string;
    mistakeTags: string[];
    shortNote: string;
  }>;
  tiltWarning: boolean;
  tiltReason: string | null;
  consecutiveLosses: number;
  outsideProfitableWindow: boolean;
}

export interface ChatContextLevel {
  name: string;
  shortName: string;
  price: number;
  distancePoints: number;
  role: string;
  timeframe: string;
  source: string;
  timestamp: string;
  staleness: MarketStalenessBadge;
}

export interface ChatJournalSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  totalPnlDollars: number;
  avgMaeWinningR: number;
  riskBudgetDollars?: number;
  maxDailyLossDollars?: number;
  maxDailyTrades?: number;
  recentTrades: Array<{
    tradeDate: string;
    symbol: "NQ" | "MNQ";
    direction: string;
    actualPnlDollars: number;
    actualPnlR: number;
    maeR: number;
    mfeR: number;
    retraceLevelUsed: string;
    notes: string;
  }>;
}

export interface ChatMarketContextSnapshot {
  capturedAt: string;
  instrument: "NQ" | "MNQ";
  underlyingAsset: string;
  quote: {
    price: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
    open: number;
    previousClose: number;
    source: string;
    timestamp: string;
    status: string;
    stalenessSeconds: number;
    stalenessBadge: MarketStalenessBadge;
  };
  session: {
    activeSession: string;
    activeSessionLabel: string;
    phase: string;
    targetTradeDate: string;
    priorTradeDate: string;
    isMarketOpen: boolean;
    countdown: string;
    currentETDateTime?: string;
    upcomingSchedule?: Array<{
      date: string;
      weekday: string;
      status: "NORMAL" | "HOLIDAY" | "HALF_DAY" | "WEEKEND";
      note: string;
    }>;
  };
  upcomingEvents?: Array<{
    date: string;
    timeET: string;
    event: string;
    impact: string;
    folderColor: string;
    forecast?: string;
    previous?: string;
    actual?: string;
    marketImpact?: string;
  }>;
  regime: {
    biasVerdict: string;
    confidence: string;
    htfTrend: string;
    chopRisk: string;
    riskMultiplier: number;
    summary: string;
    singleTradeDirective: string;
    archetype: string;
    activeVetoes: string[];
    vwapMode: "VOLUME_WEIGHTED" | "TWAP_FALLBACK";
    expectedMoveStraddle: number;
    expectedMove1SD: number;
    atrOpen15m: number;
    overnightInventory: string;
    inventoryPercent: number;
  };
  volatilityAndMacro: {
    vxn: number;
    vix: number;
    vix3m: number;
    termRatio: number;
    termStructureRegime: string;
    vvix: number;
    vrpRatio: number;
    isNegativeVrp: boolean;
    macroCorrelationRegime: string;
    rateSource: string;
    dxyPrice: number;
    dxyPercentChange: number;
  };
  gex: {
    available: boolean;
    netGammaRegime?: string;
    gammaFlipNq?: number;
    callWallNq?: number;
    putWallNq?: number;
    source: string;
    lastUpdated: string;
    disclaimer: string;
  };
  smt: {
    hasDivergence: boolean;
    divergenceType: string;
    direction: string;
    notes: string;
  };
  footprint: {
    available: boolean;
    sessionCvd?: number;
    rthCvd?: number;
    lastUpdated?: string;
    disclaimer: string;
  };
  keyLevels: ChatContextLevel[];
  journal: ChatJournalSummary;
  honestyNotice: string;
}

export interface ChatThreadSummary {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  imageUrls: string[]; // Stored paths or URLs in DB
  signedImageUrls: string[]; // Hydrated displayable URLs
  marketContextSnapshot: ChatMarketContextSnapshot | null;
  createdAt: string;
}

export interface ChatMessageMetadata {
  createdAt?: string;
  model?: string;
  totalTokens?: number;
  snapshot?: ChatMarketContextSnapshot;
}

export type StratUIMessage = UIMessage<ChatMessageMetadata>;
