import { OpenBriefData } from "./market";

export interface UserProfile {
  id: string; // e.g., 'default', 'prop-eval', 'conservative'
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
  worstPrice?: number; // Lowest price during trade (Long) or highest price (Short)
  bestPrice?: number; // Highest price during trade (Long) or lowest price (Short)
  contracts: number;
  plannedRiskDollars: number;
  plannedTargetDollars: number;
  actualPnlDollars: number;
  actualPnlR: number; // e.g. +2.2R or -1.0R
  maeR: number; // Maximum Adverse Excursion in R (worst heat drawn down)
  mfeR: number; // Maximum Favorable Excursion in R (peak profit reached)
  exitEfficiencyPercent?: number; // (actualPnlR / mfeR) * 100 for winners
  stoppedOut: boolean;
  entryTimeET: string;
  exitTimeET: string;
  retraceLevelUsed: string;
  notes: string;
  // Regime Snapshot at time of entry
  vxnSnapshot?: number;
  termRatioSnapshot?: number;
  vvixSnapshot?: number;
  vrpSnapshot?: number;
  inventoryPercentSnapshot?: number;
  smtSnapshot?: string;
  biasVerdictSnapshot?: string;
  sessionBarsJson?: string;
  screenshotPath?: string;
  screenshotSignedUrl?: string;
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
  avgExitEfficiencyPercent: number;
  sampleSizeGate: {
    isCalibrated: boolean;
    targetSampleSize: number;
    currentCount: number;
    statusMessage: string;
  };
  percentile85MaeWinners?: number;
  percentile90MaeWinners?: number;
  deepHeatDistribution: {
    under25PctR: number; // MAE <= 0.25R
    under50PctR: number; // MAE 0.25R - 0.50R
    under75PctR: number; // MAE 0.50R - 0.75R
    severeDrawdown: number; // MAE > 0.75R
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
