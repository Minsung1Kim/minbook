import {
  DailyPrediction,
  PredictionGrade,
  ModelWeightsRecord,
  FactorAttribution,
  CalibrationAuditSummary,
  ProposedWeightUpdate,
  ICalibrationRepository
} from "../../types/calibration";
import { getCalibrationRepository, DEFAULT_MODEL_WEIGHTS } from "./store";

export const FACTOR_KEY_CONFIG: Record<string, { name: string; defaultWeight: number }> = {
  // v3.0 4 Orthogonal Signals
  compositeHtf: { name: "Composite HTF & Auction Location", defaultWeight: 1.0 },
  smtBreadth: { name: "Cross-Index SMT Divergence + Breadth", defaultWeight: 1.0 },
  macroImpulse: { name: "23h Macro Impulse (ZN / DXY)", defaultWeight: 1.0 },
  openingFlow: { name: "Opening Flow (VW Wick Rejection)", defaultWeight: 1.0 },

  // Historical / Legacy Factor Mappings
  htfTrend: { name: "HTF Trend Alignment", defaultWeight: 1.0 },
  vwapAlignment: { name: "VWAP / Opening Location", defaultWeight: 1.0 },
  overnightInventory: { name: "Overnight Inventory Skew", defaultWeight: 1.0 },
  openingGap: { name: "Opening Gap Extension", defaultWeight: 1.0 },
  smtDivergence: { name: "Cross-Index SMT Divergence", defaultWeight: 1.0 },
  volatilitySurface: { name: "Volatility Surface & VRP", defaultWeight: 1.0 },
  macroRegime: { name: "Macro Yields & Dollar", defaultWeight: 1.0 },
  gexRegime: { name: "Dealer Gamma Tilt (GEX)", defaultWeight: 1.0 }
};

export const PRIOR_ALPHA_0 = 25;
export const PRIOR_BETA_0 = 25;
export const DEFAULT_FORGETTING_FACTOR = 0.99;
export const WEIGHT_MIN_CLIP = 0.6;
export const WEIGHT_MAX_CLIP = 1.5;
export const STATUS_TAG_MIN_SAMPLE_SIZE = 60;

/**
 * Computes the complete System Self-Audit and Factor Attribution Leaderboard.
 */
export async function computeCalibrationSummary(
  repo: ICalibrationRepository = getCalibrationRepository()
): Promise<CalibrationAuditSummary> {
  // Ensure default seed if DB is brand new
  await repo.seedSampleArchiveIfEmpty();

  const gradedHistory: Array<{ prediction: DailyPrediction; grade: PredictionGrade }> = await repo.getGradedHistory();
  const auditHistory = await repo.getAuditHistory(100);
  const activeWeights = await repo.getActiveModelWeights();

  const totalPredictions = auditHistory.length;
  const gradedSessions = gradedHistory.length;
  const pendingSessions = totalPredictions - gradedSessions;

  if (gradedSessions === 0) {
    return {
      totalPredictions,
      gradedSessions: 0,
      pendingSessions,
      overallBiasAccuracy: 0,
      retraceTapRate: 0,
      stopHuntAccuracy: 0,
      liquidityDrawRate: 0,
      avgMfePts: 0,
      avgMaePts: 0,
      avgCompositeScore: 0,
      sampleSizeGate: {
        isCalibrated: false,
        required: 30,
        current: 0,
        remaining: 30
      },
      activeModelVersion: activeWeights.version,
      factorAttributions: Object.entries(FACTOR_KEY_CONFIG).map(([key, cfg]) => ({
        factorKey: key,
        factorName: cfg.name,
        totalOccurrences: 0,
        winsWhenActive: 0,
        winRate: 0,
        baselineWinRate: 0,
        liftPercent: 0,
        currentWeight: activeWeights.weights[key] ?? cfg.defaultWeight,
        performanceByVol: { normalVolWinRate: 0, highVolWinRate: 0 },
        status: "NEUTRAL"
      })),
      proposedUpdate: null,
      history: auditHistory
    };
  }

  // 1. Overall Hit Rates
  const correctCount = gradedHistory.filter((h: { grade: PredictionGrade }) => h.grade.biasCorrect).length;
  const overallBiasAccuracy = Math.round((correctCount / gradedSessions) * 1000) / 10;

  const retraceTappedCount = gradedHistory.filter(
    (h: { grade: PredictionGrade }) => h.grade.retraceTapped && h.grade.retraceTapped.length > 0
  ).length;
  const retraceTapRate = Math.round((retraceTappedCount / gradedSessions) * 1000) / 10;

  const stopHuntPreds = gradedHistory.filter(
    (h: { prediction: DailyPrediction }) => h.prediction.stopHuntLikelihood === "HIGH" || h.prediction.stopHuntTargetLevel !== null
  );
  const stopHuntSuccessCount = stopHuntPreds.filter((h: { grade: PredictionGrade }) => h.grade.stopHuntOccurred).length;
  const stopHuntAccuracy =
    stopHuntPreds.length > 0
      ? Math.round((stopHuntSuccessCount / stopHuntPreds.length) * 1000) / 10
      : 0;

  const liquidityDrawCount = gradedHistory.filter(
    (h: { grade: PredictionGrade }) => h.grade.liquidityDrawHit && h.grade.liquidityDrawHit.length > 0
  ).length;
  const liquidityDrawRate = Math.round((liquidityDrawCount / gradedSessions) * 1000) / 10;

  const totalMfe = gradedHistory.reduce((sum: number, h: { grade: PredictionGrade }) => sum + h.grade.favorableExcursionPts, 0);
  const totalMae = gradedHistory.reduce((sum: number, h: { grade: PredictionGrade }) => sum + h.grade.adverseExcursionPts, 0);
  const totalComposite = gradedHistory.reduce((sum: number, h: { grade: PredictionGrade }) => sum + h.grade.compositeScore, 0);

  const avgMfePts = Math.round((totalMfe / gradedSessions) * 10) / 10;
  const avgMaePts = Math.round((totalMae / gradedSessions) * 10) / 10;
  const avgCompositeScore = Math.round((totalComposite / gradedSessions) * 10) / 10;

  // 2. Factor Attribution Calculation
  const factorAttributions: FactorAttribution[] = [];

  for (const [key, cfg] of Object.entries(FACTOR_KEY_CONFIG)) {
    let occurrences = 0;
    let winsWhenActive = 0;

    let normalVolCount = 0;
    let normalVolWins = 0;
    let highVolCount = 0;
    let highVolWins = 0;

    for (const h of gradedHistory) {
      const score = h.prediction.regimeInputs?.factorScores?.[key] ?? 0;
      if (score !== 0) {
        occurrences++;
        if (h.grade.biasCorrect) {
          winsWhenActive++;
        }

        // Volatility split (VRP < 0 or termRatio >= 1.0 is High Vol / Stress)
        const isHighVol =
          (h.prediction.regimeInputs?.vrp !== undefined && h.prediction.regimeInputs.vrp < 0) ||
          (h.prediction.regimeInputs?.vixTermRatio !== undefined && h.prediction.regimeInputs.vixTermRatio >= 1.0);

        if (isHighVol) {
          highVolCount++;
          if (h.grade.biasCorrect) highVolWins++;
        } else {
          normalVolCount++;
          if (h.grade.biasCorrect) normalVolWins++;
        }
      }
    }

    const winRate =
      occurrences > 0 ? Math.round((winsWhenActive / occurrences) * 1000) / 10 : overallBiasAccuracy;
    const liftPercent = Math.round((winRate - overallBiasAccuracy) * 10) / 10;

    const normalVolWinRate =
      normalVolCount > 0 ? Math.round((normalVolWins / normalVolCount) * 1000) / 10 : winRate;
    const highVolWinRate =
      highVolCount > 0 ? Math.round((highVolWins / highVolCount) * 1000) / 10 : winRate;

    const currentWeight = activeWeights.weights[key] ?? cfg.defaultWeight;

    // Strict Sample Size Gate: remove ±4% status tags until N >= 60
    let status: FactorAttribution["status"] = "NEUTRAL";
    if (gradedSessions >= STATUS_TAG_MIN_SAMPLE_SIZE) {
      if (liftPercent >= 4.0) status = "EDGE_ENHANCER";
      else if (liftPercent <= -4.0) status = "NOISE_DETRACTOR";
    }

    factorAttributions.push({
      factorKey: key,
      factorName: cfg.name,
      totalOccurrences: occurrences,
      winsWhenActive,
      winRate,
      baselineWinRate: overallBiasAccuracy,
      liftPercent,
      currentWeight,
      performanceByVol: {
        normalVolWinRate,
        highVolWinRate
      },
      status
    });
  }

  // Sort factor attribution leaderboard: edge enhancers first, then neutral, then noise detractors
  factorAttributions.sort((a, b) => b.liftPercent - a.liftPercent);

  // 3. Closed-Form Beta-Binomial Bayesian Shrinkage Optimization
  let proposedUpdate: ProposedWeightUpdate | null = null;
  if (gradedSessions >= 30) {
    proposedUpdate = computeBayesianShrinkageOptimization(gradedHistory, activeWeights, factorAttributions);
  }

  return {
    totalPredictions,
    gradedSessions,
    pendingSessions,
    overallBiasAccuracy,
    retraceTapRate,
    stopHuntAccuracy,
    liquidityDrawRate,
    avgMfePts,
    avgMaePts,
    avgCompositeScore,
    sampleSizeGate: {
      isCalibrated: gradedSessions >= 30,
      required: 30,
      current: gradedSessions,
      remaining: Math.max(0, 30 - gradedSessions)
    },
    activeModelVersion: activeWeights.version,
    factorAttributions,
    proposedUpdate,
    history: auditHistory
  };
}

export interface BayesianFactorResult {
  factorKey: string;
  totalOccurrences: number;
  winsWhenActive: number;
  effectiveN: number;
  effectiveWins: number;
  rawWinRate: number;
  shrunkWinRate: number;
  bayesianWeight: number;
  clippedWeight: number;
  rationale: string;
}

/**
 * Closed-Form Beta-Binomial Bayesian Shrinkage:
 * Prior alpha0 = 25, beta0 = 25 (prior mean = 50%, prior pseudo-sample size = 50).
 * Optional exponential forgetting factor gamma = 0.99.
 * Production weight clip strictly within [0.6, 1.5].
 */
export function computeBayesianFactorShrinkage(
  gradedHistory: Array<{ prediction: DailyPrediction; grade: PredictionGrade }>,
  gamma: number = DEFAULT_FORGETTING_FACTOR,
  alpha0: number = PRIOR_ALPHA_0,
  beta0: number = PRIOR_BETA_0
): Record<string, BayesianFactorResult> {
  const sorted = [...gradedHistory].sort((a, b) => {
    return a.prediction.targetTradeDate.localeCompare(b.prediction.targetTradeDate);
  });

  const T = sorted.length;
  const results: Record<string, BayesianFactorResult> = {};

  for (const [key, cfg] of Object.entries(FACTOR_KEY_CONFIG)) {
    let rawOccurrences = 0;
    let rawWins = 0;
    let effN = 0;
    let effWins = 0;

    for (let t = 0; t < T; t++) {
      const h = sorted[t];
      const score = h.prediction.regimeInputs?.factorScores?.[key] ?? 0;
      if (score !== 0) {
        rawOccurrences++;
        const weight = Math.pow(gamma, T - 1 - t);
        effN += weight;

        const isWin = h.grade.biasCorrect || (h.grade.realizedNetR !== undefined && h.grade.realizedNetR > 0);
        if (isWin) {
          rawWins++;
          effWins += weight;
        }
      }
    }

    // Closed-form Beta-Binomial posterior mean: (k_eff + alpha0) / (n_eff + alpha0 + beta0)
    const shrunkWinRate = (effWins + alpha0) / (effN + alpha0 + beta0);
    const bayesianWeight = Math.round(2.0 * shrunkWinRate * 100) / 100;
    const clippedWeight = Math.max(WEIGHT_MIN_CLIP, Math.min(WEIGHT_MAX_CLIP, bayesianWeight));
    const rawWinRate = rawOccurrences > 0 ? (rawWins / rawOccurrences) * 100 : 50.0;

    const delta = Math.round((clippedWeight - 1.0) * 100) / 100;
    const rationale =
      rawOccurrences < 10
        ? `Sparse evidence (${rawOccurrences} sessions); shrunk strongly toward prior 50% (weight ${clippedWeight.toFixed(2)}).`
        : delta > 0
        ? `Empirical win rate ${rawWinRate.toFixed(1)}% shrunk to ${(shrunkWinRate * 100).toFixed(1)}%; weight scaled to ${clippedWeight.toFixed(2)}.`
        : delta < 0
        ? `Empirical win rate ${rawWinRate.toFixed(1)}% shrunk to ${(shrunkWinRate * 100).toFixed(1)}%; weight attenuated to ${clippedWeight.toFixed(2)}.`
        : `Baseline performance; weight neutral at 1.00.`;

    results[key] = {
      factorKey: key,
      totalOccurrences: rawOccurrences,
      winsWhenActive: rawWins,
      effectiveN: Math.round(effN * 10) / 10,
      effectiveWins: Math.round(effWins * 10) / 10,
      rawWinRate: Math.round(rawWinRate * 10) / 10,
      shrunkWinRate: Math.round(shrunkWinRate * 1000) / 10,
      bayesianWeight,
      clippedWeight,
      rationale
    };
  }

  return results;
}

/**
 * Beta-Binomial Bayesian Shrinkage Optimizer:
 * Evaluates Bayesian posterior weights for each factor.
 * Clamps proposed weights strictly within [0.6, 1.5].
 */
export function computeBayesianShrinkageOptimization(
  gradedHistory: Array<{ prediction: DailyPrediction; grade: PredictionGrade }>,
  activeWeights: ModelWeightsRecord,
  factors: FactorAttribution[],
  gamma: number = DEFAULT_FORGETTING_FACTOR
): ProposedWeightUpdate | null {
  const n = gradedHistory.length;
  if (n < 30) return null; // Gate: requires N >= 30 sessions before proposing calibration

  const shrinkageResults = computeBayesianFactorShrinkage(gradedHistory, gamma);
  const proposedWeights: Record<string, number> = { ...activeWeights.weights };
  const weightDeltas: ProposedWeightUpdate["weightDeltas"] = {};

  let hasMeaningfulDelta = false;

  for (const factor of factors) {
    const key = factor.factorKey;
    const curW = activeWeights.weights[key] ?? 1.0;
    const shrinkRes = shrinkageResults[key];
    const targetW = shrinkRes ? shrinkRes.clippedWeight : curW;

    proposedWeights[key] = targetW;
    const change = Math.round((targetW - curW) * 100) / 100;

    if (Math.abs(change) >= 0.05) {
      hasMeaningfulDelta = true;
    }

    weightDeltas[key] = {
      from: curW,
      to: targetW,
      change,
      rationale: shrinkRes?.rationale ?? `Weight maintained at ${targetW.toFixed(2)}.`
    };
  }

  if (!hasMeaningfulDelta) {
    return null;
  }

  const currentVerNum = parseFloat(activeWeights.version.replace("v", "")) || 1.0;
  const nextVersion = `v${(currentVerNum + 0.1).toFixed(1)}`;

  const correctCount = gradedHistory.filter((h) => h.grade.biasCorrect).length;
  const accuracy = Math.round((correctCount / n) * 1000) / 10;

  const summary = `Beta-Binomial Bayesian Shrinkage (α0=25, β0=25, γ=${gamma}) across ${n} sessions updated factor weights clamped to [${WEIGHT_MIN_CLIP}, ${WEIGHT_MAX_CLIP}].`;

  return {
    fromVersion: activeWeights.version,
    toVersion: nextVersion,
    currentInSampleAccuracy: accuracy,
    currentOutOfSampleAccuracy: accuracy,
    proposedOutOfSampleAccuracy: accuracy,
    outOfSampleLift: 0,
    brierImprovement: 0,
    sampleSize: n,
    proposedWeights,
    weightDeltas,
    summary
  };
}

/**
 * Backwards compatibility alias for walk-forward optimization
 */
export const computeWalkForwardOptimization = computeBayesianShrinkageOptimization;

/**
 * Re-scores predictions on a slice of sessions using given factor weights
 * and returns how many times the weighted verdict matched reality.
 */
function evaluateModelOnSlice(
  slice: Array<{ prediction: DailyPrediction; grade: PredictionGrade }>,
  weights: Record<string, number>
): number {
  let correct = 0;

  for (const h of slice) {
    let weightedScore = 0;
    const scores = h.prediction.regimeInputs?.factorScores || {};

    for (const [key, s] of Object.entries(scores)) {
      const w = weights[key] ?? 1.0;
      weightedScore += s * w;
    }

    // Weighted model bias: score >= 1.5 -> Bullish, score <= -1.5 -> Bearish, else Neutral/Caution
    const isBull = weightedScore >= 1.2;
    const isBear = weightedScore <= -1.2;

    const actualBull = h.grade.openPrice930 < h.grade.windowClose1000 && h.grade.biasCorrect;
    const actualBear = h.grade.openPrice930 > h.grade.windowClose1000 && h.grade.biasCorrect;

    if (isBull && actualBull) correct++;
    else if (isBear && actualBear) correct++;
    else if (!isBull && !isBear && h.grade.chopWarningCorrect) correct++;
  }

  return correct;
}

function computeSliceBrier(
  slice: Array<{ prediction: DailyPrediction; grade: PredictionGrade }>,
  weights: Record<string, number>
): number {
  if (slice.length === 0) return 0;
  let totalBrier = 0;

  for (const h of slice) {
    let weightedScore = 0;
    const scores = h.prediction.regimeInputs?.factorScores || {};
    for (const [key, s] of Object.entries(scores)) {
      const w = weights[key] ?? 1.0;
      weightedScore += s * w;
    }

    // Sigmoid probability
    const p = 1 / (1 + Math.exp(-weightedScore * 0.5));
    const y = h.grade.biasCorrect ? 1.0 : 0.0;
    totalBrier += Math.pow(p - y, 2);
  }

  return Math.round((totalBrier / slice.length) * 1000) / 1000;
}
