import type { UIMessage } from "ai";

export type MarketStalenessBadge = "FRESH" | "DELAYED" | "STALE" | "SAMPLE";

export const CHAT_MODEL_ID = "gemini-2.5-flash";
export const CHAT_MODEL_LABEL = "Gemini 2.5 Flash";

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
  };
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
