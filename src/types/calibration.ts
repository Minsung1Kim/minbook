export type PredictionStatus = "PENDING_GRADE" | "GRADED_OPEN_WINDOW" | "GRADED_FULL_DAY";

export interface PrimaryRetraceLevels {
  vwap: number;
  onMid: number;
  pdc: number;
  htf50: number;
  htf618: number;
}

export interface LiquidityDraws {
  onh: number;
  onl: number;
  pdh: number;
  pdl: number;
}

export interface RegimeInputsSnapshot {
  vxn?: number;
  vix?: number;
  vixTermRatio?: number;
  vvix?: number;
  vrp?: number;
  gexRegime?: string;
  gammaFlipNq?: number;
  overnightInventoryPct?: number;
  smtStatus?: string;
  stockBondCorr?: number;
  newsFlag?: boolean;
  factorScores: Record<string, number>; // e.g. { htfTrend: 1, vwapAlignment: 1, ... }
}

export interface DailyPrediction {
  id: string;
  targetTradeDate: string; // YYYY-MM-DD
  frozenAtEt: string; // ISO timestamp
  modelVersion: string; // e.g. 'v1.0'
  spotAtFreeze: number;
  biasVerdict: string; // LONG_CONTINUATION | SHORT_CONTINUATION | CAUTION_STAND_ASIDE
  confidenceTier: string; // HIGH | MODERATE | LOW
  archetype: string;
  stopHuntLikelihood: string;
  stopHuntTargetLevel: number | null;
  primaryRetraceLevels: PrimaryRetraceLevels;
  liquidityDraws: LiquidityDraws;
  regimeInputs: RegimeInputsSnapshot;
  status: PredictionStatus;
  createdAt: string;
}

export type TripleBarrierOutcome =
  | "HIT_TP1"
  | "HIT_TP2"
  | "STOPPED_OUT"
  | "TIME_EXIT"
  | "NO_FILL";

export interface PredictionGrade {
  id: string;
  targetTradeDate: string; // YYYY-MM-DD
  predictionId: string;
  openPrice930: number;
  windowHigh: number;
  windowLow: number;
  windowClose1000: number;
  biasCorrect: boolean;
  favorableExcursionPts: number;
  adverseExcursionPts: number;
  retraceTapped: string[]; // e.g. ['VWAP', 'ON Mid']
  stopHuntOccurred: boolean;
  liquidityDrawHit: string[]; // e.g. ['ONH', 'PDH']
  chopWarningCorrect: boolean;
  brierScore: number;
  logScore?: number;
  compositeScore: number; // 0 to 100
  tripleBarrierOutcome?: TripleBarrierOutcome;
  realizedNetR?: number;
  netPnlDollars?: number;
  fillPrice?: number;
  fillTimeET?: string;
  exitPrice?: number;
  exitTimeET?: string;
  gradedAt: string;
}

export interface ModelWeightsRecord {
  id: string;
  version: string; // e.g. 'v1.0'
  isActive: boolean;
  weights: Record<string, number>;
  sampleSizeUsed: number;
  outOfSampleAccuracy: number;
  changeSummary: string;
  createdAt: string;
}

export interface FactorAttribution {
  factorKey: string;
  factorName: string;
  totalOccurrences: number;
  winsWhenActive: number;
  winRate: number; // 0 to 100
  baselineWinRate: number; // 0 to 100
  liftPercent: number; // winRate - baselineWinRate
  currentWeight: number;
  recommendedWeight?: number;
  bayesianWeight?: number;
  posteriorMean?: number;
  effectiveN?: number;
  performanceByVol: {
    normalVolWinRate: number;
    highVolWinRate: number;
  };
  status: "EDGE_ENHANCER" | "NEUTRAL" | "NOISE_DETRACTOR";
}

export interface CalibrationAuditSummary {
  totalPredictions: number;
  gradedSessions: number;
  pendingSessions: number;
  overallBiasAccuracy: number; // 0 to 100
  retraceTapRate: number; // 0 to 100
  stopHuntAccuracy: number; // 0 to 100
  liquidityDrawRate: number; // 0 to 100
  avgMfePts: number;
  avgMaePts: number;
  avgCompositeScore: number;
  sampleSizeGate: {
    isCalibrated: boolean;
    required: number;
    current: number;
    remaining: number;
  };
  activeModelVersion: string;
  factorAttributions: FactorAttribution[];
  proposedUpdate: ProposedWeightUpdate | null;
  history: Array<{
    prediction: DailyPrediction;
    grade: PredictionGrade | null;
  }>;
}

export interface ProposedWeightUpdate {
  fromVersion: string;
  toVersion: string;
  currentInSampleAccuracy: number;
  currentOutOfSampleAccuracy: number;
  proposedOutOfSampleAccuracy: number;
  outOfSampleLift: number;
  brierImprovement: number;
  sampleSize: number;
  proposedWeights: Record<string, number>;
  weightDeltas: Record<string, { from: number; to: number; change: number; rationale: string }>;
  summary: string;
}

export interface ICalibrationRepository {
  // Predictions
  savePrediction(prediction: DailyPrediction): Promise<DailyPrediction>;
  getPredictionByDate(targetTradeDate: string): Promise<DailyPrediction | null>;
  getAllPredictions(limit?: number): Promise<DailyPrediction[]>;
  getPendingPredictions(): Promise<DailyPrediction[]>;
  updatePredictionStatus(id: string, status: PredictionStatus): Promise<void>;

  // Grades
  saveGrade(grade: PredictionGrade): Promise<PredictionGrade>;
  getGradeByDate(targetTradeDate: string): Promise<PredictionGrade | null>;
  getAllGrades(): Promise<PredictionGrade[]>;

  // Joined View
  getGradedHistory(): Promise<Array<{ prediction: DailyPrediction; grade: PredictionGrade }>>;
  getAuditHistory(limit?: number): Promise<Array<{ prediction: DailyPrediction; grade: PredictionGrade | null }>>;

  // Model Weights
  getActiveModelWeights(): Promise<ModelWeightsRecord>;
  saveModelWeights(record: Omit<ModelWeightsRecord, "id" | "createdAt">): Promise<ModelWeightsRecord>;
  getAllModelWeightsHistory(): Promise<ModelWeightsRecord[]>;
  setActiveModelWeights(version: string): Promise<void>;

  // Seeding
  seedSampleArchiveIfEmpty(): Promise<boolean>;
}

