import { OpenBriefData } from "./market";

export interface UserProfile {
  id: string; // e.g., 'minsung', 'alex', 'jordan', 'default'
  name: string;
  defaultInstrument: "NQ" | "MNQ";
  riskBudgetDollars: number;
  targetBudgetDollars: number;
  maxDailyTrades: number;
  maxDailyLossDollars: number;
  trailingDrawdownAlert: number;
  notes?: string;
  updatedAt: string;
}

export interface TradeLogEntry {
  id: string;
  userId: string;
  tradeDate: string; // YYYY-MM-DD
  symbol: "NQ" | "MNQ";
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  exitPrice: number;
  contracts: number;
  plannedRiskDollars: number;
  plannedTargetDollars: number;
  actualPnlDollars: number;
  actualPnlR: number; // e.g. +2.2R or -1.0R
  maeR: number; // Maximum Adverse Excursion in R (worst heat drawn down, e.g. -0.35R)
  mfeR: number; // Maximum Favorable Excursion in R (peak profit reached, e.g. +2.8R)
  stoppedOut: boolean;
  entryTimeET: string;
  exitTimeET: string;
  retraceLevelUsed: string;
  notes: string;
  createdAt: string;
}

export interface JournalAnalytics {
  totalTrades: number;
  wins: number;
  losses: number;
  scratches: number;
  winRatePercent: number;
  totalPnlDollars: number;
  avgPnlR: number;
  profitFactor: number;
  expectancyR: number;
  avgMaeWinningTradesR: number;
  avgMaeLosingTradesR: number;
  avgMfeTradesR: number;
  // Deep empirical insight: how many winning trades suffered >0.5R or >0.75R adverse heat?
  deepHeatDistribution: {
    under25PctR: number; // MAE between 0 and -0.25R
    under50PctR: number; // MAE between -0.25R and -0.5R
    under75PctR: number; // MAE between -0.5R and -0.75R
    severeDrawdown: number; // MAE > -0.75R
  };
  recommendation: string;
}

export interface SavedDailyBrief {
  id: string;
  tradeDate: string; // YYYY-MM-DD
  symbol: "NQ" | "MNQ";
  data: OpenBriefData;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface ChecklistState {
  date: string;
  htfTrendConfirmed: boolean;
  openingDriveAllowed: boolean;
  retraceKeyLevelHit: boolean;
  noImpendingRedNews: boolean;
  stopFitsDollarBudget: boolean;
  singleTradeCommitment: boolean;
  journalPledge: boolean;
}
