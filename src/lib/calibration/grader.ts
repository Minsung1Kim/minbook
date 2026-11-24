import { OHLCVBar, OpenBriefData } from "../../types/market";
import {
  DailyPrediction,
  PredictionGrade,
  ICalibrationRepository
} from "../../types/calibration";
import { getCalibrationRepository } from "./store";
import { YahooFinanceProvider } from "../market/yahoo";

/**
 * Maps factor names from playbook factorScorecard to standard factor keys
 */
export function mapScorecardToFactorKeys(factorScorecard: Array<{ factor: string; score: number }>): Record<string, number> {
  const result: Record<string, number> = {
    htfTrend: 0,
    vwapAlignment: 0,
    overnightInventory: 0,
    openingGap: 0,
    smtDivergence: 0,
    volatilitySurface: 0,
    macroRegime: 0,
    gexRegime: 0
  };

  for (const item of factorScorecard) {
    const f = item.factor.toLowerCase();
    if (f.includes("htf") || f.includes("trend")) {
      result.htfTrend = item.score;
    } else if (f.includes("vwap") || f.includes("opening location")) {
      result.vwapAlignment = item.score;
    } else if (f.includes("inventory")) {
      result.overnightInventory = item.score;
    } else if (f.includes("gap")) {
      result.openingGap = item.score;
    } else if (f.includes("smt")) {
      result.smtDivergence = item.score;
    } else if (f.includes("volatility") || f.includes("vrp")) {
      result.volatilitySurface = item.score;
    } else if (f.includes("macro") || f.includes("yields")) {
      result.macroRegime = item.score;
    } else if (f.includes("gex") || f.includes("gamma")) {
      result.gexRegime = item.score;
    }
  }

  return result;
}

/**
 * Freezes today's pre-market brief into an immutable prediction record.
 * If a prediction already exists for targetTradeDate, it is NEVER overwritten.
 */
export async function freezePredictionSnapshot(
  brief: OpenBriefData,
  repo: ICalibrationRepository = getCalibrationRepository()
): Promise<{ prediction: DailyPrediction; isNew: boolean; message: string }> {
  const targetDate = brief.sessionInfo?.targetTradeDate || brief.tradeDate;

  // 1. Check if already frozen
  const existing = await repo.getPredictionByDate(targetDate);
  if (existing) {
    return {
      prediction: existing,
      isNew: false,
      message: `Snapshot already frozen at ${existing.frozenAtEt} (Immutable).`
    };
  }

  // 2. Resolve active model weights version
  const activeWeights = await repo.getActiveModelWeights();
  const scorecard = brief.tacticalPlan?.retraceAnalysis?.factorScorecard || [];
  const factorScores = mapScorecardToFactorKeys(scorecard);

  const stopHuntDetails = brief.tacticalPlan?.trader5Answers?.stopHuntDetails;
  const stopHuntProb = brief.tacticalPlan?.trader5Answers?.stopHuntProbability || "LOW (DIRECT DRIVE)";
  const stopHuntTargetLevel = stopHuntDetails?.sweepLevelPrice ?? null;

  const hasNewsNear = Boolean(
    brief.macro?.events?.some((e) => e.isNearOpenWindow || e.alert)
  );

  const nowIso = new Date().toISOString();
  const pred: DailyPrediction = {
    id: `pred_${targetDate}`,
    targetTradeDate: targetDate,
    frozenAtEt: nowIso,
    modelVersion: activeWeights.version,
    spotAtFreeze: brief.quote.price,
    biasVerdict: brief.bias.verdict,
    confidenceTier: brief.bias.confidence,
    archetype: brief.tacticalPlan?.retraceAnalysis?.archetype || "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)",
    stopHuntLikelihood: stopHuntProb.includes("HIGH") ? "HIGH" : stopHuntProb.includes("MODERATE") ? "MODERATE" : "LOW",
    stopHuntTargetLevel,
    primaryRetraceLevels: {
      vwap: brief.sessionMetrics.sessionVwap,
      onMid: brief.sessionMetrics.onMid,
      pdc: brief.sessionMetrics.pdc,
      htf50: brief.sessionMetrics.htf50Retrace,
      htf618: brief.sessionMetrics.htf618Retrace
    },
    liquidityDraws: {
      onh: brief.sessionMetrics.onh,
      onl: brief.sessionMetrics.onl,
      pdh: brief.sessionMetrics.pdh,
      pdl: brief.sessionMetrics.pdl
    },
    regimeInputs: {
      vxn: brief.bias.volatilitySurface?.vxn,
      vix: brief.bias.volatilitySurface?.vix,
      vixTermRatio: brief.bias.volatilitySurface?.termRatio,
      vvix: brief.bias.volatilitySurface?.vvix,
      vrp: brief.bias.volatilitySurface?.vrp,
      gexRegime: brief.bias.gex?.netGammaRegime,
      gammaFlipNq: brief.bias.gex?.gammaFlipNq,
      overnightInventoryPct: brief.sessionMetrics.inventoryPercent,
      smtStatus: brief.sessionMetrics.smtDivergence?.divergenceType,
      stockBondCorr: brief.bias.macroRegime?.stockBondCorrelation60d,
      newsFlag: hasNewsNear,
      factorScores
    },
    status: "PENDING_GRADE",
    createdAt: nowIso
  };

  const saved = await repo.savePrediction(pred);
  return {
    prediction: saved,
    isNew: true,
    message: `Pre-market prediction snapshot successfully frozen for ${targetDate}.`
  };
}

/**
 * Extracts bars falling strictly within the 09:30–10:00 AM ET window for a given trade date.
 */
export function extractNYOpenBars(bars: OHLCVBar[], targetTradeDate: string): OHLCVBar[] {
  return bars.filter((b) => {
    const dt = new Date(b.timestamp);
    if (isNaN(dt.getTime())) return false;

    // Convert to America/New_York
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      hour12: false
    }).formatToParts(dt);

    const year = parts.find((p) => p.type === "year")?.value || "";
    const month = parts.find((p) => p.type === "month")?.value || "";
    const day = parts.find((p) => p.type === "day")?.value || "";
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

    const dateKey = `${year}-${month}-${day}`;
    if (dateKey !== targetTradeDate) return false;

    const timeMins = hour * 60 + minute;
    // 09:30 is 570 mins, 10:00 is 600 mins (inclusive)
    return timeMins >= 570 && timeMins <= 600;
  });
}

/**
 * Pure, deterministic grading function:
 * Evaluates what NQ actually did during 09:30–10:00 ET against the frozen pre-market prediction.
 */
export function computePredictionGrade(
  pred: DailyPrediction,
  windowBars: OHLCVBar[],
  atr15m: number = 24.5
): PredictionGrade | null {
  if (windowBars.length === 0) return null;

  // Sort chronologically ascending
  const sorted = [...windowBars].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const openPrice930 = sorted[0].open;
  const windowHigh = Math.max(...sorted.map((b) => b.high));
  const windowLow = Math.min(...sorted.map((b) => b.low));
  const windowClose1000 = sorted[sorted.length - 1].close;

  const isBull = pred.biasVerdict.toUpperCase().includes("LONG") || pred.biasVerdict.toUpperCase().includes("BULL");
  const isBear = pred.biasVerdict.toUpperCase().includes("SHORT") || pred.biasVerdict.toUpperCase().includes("BEAR");
  const isCaution = pred.biasVerdict.toUpperCase().includes("CAUTION") || pred.biasVerdict.toUpperCase().includes("STAND");

  // Rule: Expand in predicted direction by at least 0.75 * ATR_15m before invalidating 1.0 * ATR_15m against it
  const requiredExpansion = Math.max(14, atr15m * 0.75);
  const invalidationStop = Math.max(18, atr15m * 1.0);

  let biasCorrect = false;

  if (isBull) {
    let hitStop = false;
    let hitTarget = false;
    for (const b of sorted) {
      if (b.low <= openPrice930 - invalidationStop) {
        hitStop = true;
        break;
      }
      if (b.high >= openPrice930 + requiredExpansion) {
        hitTarget = true;
        break;
      }
    }
    biasCorrect = hitTarget && !hitStop;
  } else if (isBear) {
    let hitStop = false;
    let hitTarget = false;
    for (const b of sorted) {
      if (b.high >= openPrice930 + invalidationStop) {
        hitStop = true;
        break;
      }
      if (b.low <= openPrice930 - requiredExpansion) {
        hitTarget = true;
        break;
      }
    }
    biasCorrect = hitTarget && !hitStop;
  } else if (isCaution) {
    // Chop warning correct if total range is compressed <= 1.3x ATR_15m
    const totalRange = windowHigh - windowLow;
    biasCorrect = totalRange <= atr15m * 1.35;
  }

  // Favorable & Adverse excursions from 9:30 open
  const favorableExcursionPts = isBull
    ? Math.max(0, windowHigh - openPrice930)
    : isBear
    ? Math.max(0, openPrice930 - windowLow)
    : Math.max(0, (windowHigh - windowLow) / 2);

  const adverseExcursionPts = isBull
    ? Math.max(0, openPrice930 - windowLow)
    : isBear
    ? Math.max(0, windowHigh - openPrice930)
    : Math.max(0, (windowHigh - windowLow) / 2);

  // Retrace levels tapped
  const retraceTapped: string[] = [];
  const levelTolerance = 2.5; // pts
  const isLevelTapped = (lvl: number) => lvl >= windowLow - levelTolerance && lvl <= windowHigh + levelTolerance;

  if (isLevelTapped(pred.primaryRetraceLevels.vwap)) retraceTapped.push("VWAP");
  if (isLevelTapped(pred.primaryRetraceLevels.onMid)) retraceTapped.push("ON Mid");
  if (isLevelTapped(pred.primaryRetraceLevels.pdc)) retraceTapped.push("PDC");
  if (isLevelTapped(pred.primaryRetraceLevels.htf50)) retraceTapped.push("HTF 50%");
  if (isLevelTapped(pred.primaryRetraceLevels.htf618)) retraceTapped.push("HTF 61.8%");

  // Stop hunt occurred: pierced stop hunt target level and closed back inside range
  let stopHuntOccurred = false;
  if (pred.stopHuntTargetLevel !== null) {
    const target = pred.stopHuntTargetLevel;
    if (target > pred.spotAtFreeze) {
      // Swept high
      stopHuntOccurred = windowHigh >= target && windowClose1000 < target;
    } else {
      // Swept low
      stopHuntOccurred = windowLow <= target && windowClose1000 > target;
    }
  }

  // Liquidity draws reached
  const liquidityDrawHit: string[] = [];
  if (isBull) {
    if (windowHigh >= pred.liquidityDraws.onh - levelTolerance) liquidityDrawHit.push("ONH");
    if (windowHigh >= pred.liquidityDraws.pdh - levelTolerance) liquidityDrawHit.push("PDH");
  } else if (isBear) {
    if (windowLow <= pred.liquidityDraws.onl + levelTolerance) liquidityDrawHit.push("ONL");
    if (windowLow <= pred.liquidityDraws.pdl + levelTolerance) liquidityDrawHit.push("PDL");
  } else {
    if (windowHigh >= pred.liquidityDraws.onh) liquidityDrawHit.push("ONH");
    if (windowLow <= pred.liquidityDraws.onl) liquidityDrawHit.push("ONL");
  }

  // Chop warning check
  const chopWarningCorrect = isCaution ? biasCorrect : (windowHigh - windowLow) <= atr15m * 1.1;

  // Brier score: (p - y)^2
  const pConfidence =
    pred.confidenceTier === "HIGH" ? 0.8 : pred.confidenceTier === "MODERATE" ? 0.65 : 0.5;
  const yActual = biasCorrect ? 1.0 : 0.0;
  const brierScore = Math.round(Math.pow(pConfidence - yActual, 2) * 1000) / 1000;

  // Composite Score (0–100)
  // 50 pts bias + 20 pts retrace tap + 15 pts magnet hit + 15 pts MFE/MAE ratio
  const mfeRatio = favorableExcursionPts / (favorableExcursionPts + adverseExcursionPts + 0.001);
  const compositeScore = Math.min(
    100,
    Math.round(
      (biasCorrect ? 50 : 10) +
      (retraceTapped.length > 0 ? 20 : 0) +
      (liquidityDrawHit.length > 0 ? 15 : 0) +
      Math.min(15, Math.round(mfeRatio * 15))
    )
  );

  return {
    id: `grade_${pred.targetTradeDate}`,
    targetTradeDate: pred.targetTradeDate,
    predictionId: pred.id,
    openPrice930: Math.round(openPrice930 * 100) / 100,
    windowHigh: Math.round(windowHigh * 100) / 100,
    windowLow: Math.round(windowLow * 100) / 100,
    windowClose1000: Math.round(windowClose1000 * 100) / 100,
    biasCorrect,
    favorableExcursionPts: Math.round(favorableExcursionPts * 10) / 10,
    adverseExcursionPts: Math.round(adverseExcursionPts * 10) / 10,
    retraceTapped,
    stopHuntOccurred,
    liquidityDrawHit,
    chopWarningCorrect,
    brierScore,
    compositeScore,
    gradedAt: new Date().toISOString()
  };
}

/**
 * Runs the grading pipeline for any pending predictions whose 09:30–10:00 window has concluded.
 */
export async function gradePendingPredictions(
  repo: ICalibrationRepository = getCalibrationRepository(),
  provider = new YahooFinanceProvider()
): Promise<{ gradedCount: number; gradedDates: string[]; errors: string[] }> {
  const pending = await repo.getPendingPredictions();
  if (pending.length === 0) {
    return { gradedCount: 0, gradedDates: [], errors: [] };
  }

  const gradedDates: string[] = [];
  const errors: string[] = [];

  // Fetch 5m intraday bars for NQ=F
  let bars: OHLCVBar[] = [];
  try {
    bars = await provider.getIntradayBars("NQ=F", "5m");
  } catch (err: any) {
    errors.push(`Failed to fetch 5m intraday bars: ${err?.message || err}`);
    return { gradedCount: 0, gradedDates: [], errors };
  }

  for (const pred of pending) {
    try {
      const windowBars = extractNYOpenBars(bars, pred.targetTradeDate);

      // We require at least 3 bars (e.g. 5m bars from 9:30, 9:35, 9:40, 9:45, 9:50, 9:55)
      if (windowBars.length < 3) {
        // Window may not have settled yet if it is today
        continue;
      }

      const grade = computePredictionGrade(pred, windowBars);
      if (grade) {
        await repo.saveGrade(grade);
        gradedDates.push(pred.targetTradeDate);
      }
    } catch (err: any) {
      errors.push(`Error grading ${pred.targetTradeDate}: ${err?.message || err}`);
    }
  }

  return {
    gradedCount: gradedDates.length,
    gradedDates,
    errors
  };
}
