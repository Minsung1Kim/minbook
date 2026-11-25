import { OHLCVBar, OpenBriefData, PropProfile } from "../../types/market";
import {
  DailyPrediction,
  PredictionGrade,
  TripleBarrierOutcome,
  ICalibrationRepository
} from "../../types/calibration";
import { getCalibrationRepository } from "./store";
import { YahooFinanceProvider } from "../market/yahoo";
import { getBarETParts } from "../market/levels";
import { fetch1mBars } from "../market/footprint";
import { getETParts } from "../market/sessionClock";

/**
 * Maps factor names from playbook factorScorecard to standard factor keys
 */
export function mapScorecardToFactorKeys(factorScorecard: Array<{ factor: string; score: number }>): Record<string, number> {
  const result: Record<string, number> = {
    compositeLocation: 0,
    smtBreadth: 0,
    macroImpulse: 0,
    openingFlow: 0
  };

  for (const item of factorScorecard) {
    const f = item.factor.toLowerCase();
    if (f.includes("location") || f.includes("htf") || f.includes("vwap")) {
      result.compositeLocation = item.score;
    } else if (f.includes("smt") || f.includes("breadth")) {
      result.smtBreadth = item.score;
    } else if (f.includes("macro") || f.includes("zn") || f.includes("yield")) {
      result.macroImpulse = item.score;
    } else if (f.includes("flow") || f.includes("vwwr") || f.includes("delta")) {
      result.openingFlow = item.score;
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
      atr15m: brief.sessionMetrics.atrOpen15m || brief.sessionMetrics.atr15mIntraday,
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
  atr15m: number = 24.5,
  propProfile?: PropProfile
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

  const isBull =
    pred.biasVerdict.toUpperCase().includes("LONG") ||
    pred.biasVerdict.toUpperCase().includes("BULL");
  const isBear =
    pred.biasVerdict.toUpperCase().includes("SHORT") ||
    pred.biasVerdict.toUpperCase().includes("BEAR");
  const isCaution =
    pred.biasVerdict.toUpperCase().includes("CAUTION") ||
    pred.biasVerdict.toUpperCase().includes("STAND");

  // 1. Isolate 09:30–09:33 ET observation lock bars to establish initial impulse range
  const bars930to933 = sorted.filter((b) => {
    const et = getBarETParts(b.timestamp);
    const m = et.hour * 60 + et.minute;
    return m >= 9 * 60 + 30 && m <= 9 * 60 + 33;
  });

  const orh3m =
    bars930to933.length > 0
      ? Math.max(...bars930to933.map((b) => b.high))
      : openPrice930;
  const orl3m =
    bars930to933.length > 0
      ? Math.min(...bars930to933.map((b) => b.low))
      : openPrice930;
  const impulseRange = Math.max(8.0, orh3m - orl3m);

  // 2. Define Predicted Limit Retrace Zone & Target / Stop Levels
  let entryPrice = openPrice930;
  let stopLoss = isBull ? openPrice930 - atr15m : openPrice930 + atr15m;
  let tp1Price = isBull ? openPrice930 + 0.35 * atr15m : openPrice930 - 0.35 * atr15m;
  let tp2Price = isBull ? openPrice930 + 0.65 * atr15m : openPrice930 - 0.65 * atr15m;

  if (isBull) {
    const retrace45 = orh3m - 0.45 * impulseRange;
    entryPrice = Math.round(retrace45 * 100) / 100;
    stopLoss = Math.round((orl3m - Math.max(3.0, 0.15 * atr15m)) * 100) / 100;
    tp1Price = Math.round((entryPrice + Math.max(12, 0.35 * atr15m)) * 100) / 100;
    tp2Price = Math.round((entryPrice + Math.max(22, 0.65 * atr15m)) * 100) / 100;
  } else if (isBear) {
    const retrace45 = orl3m + 0.45 * impulseRange;
    entryPrice = Math.round(retrace45 * 100) / 100;
    stopLoss = Math.round((orh3m + Math.max(3.0, 0.15 * atr15m)) * 100) / 100;
    tp1Price = Math.round((entryPrice - Math.max(12, 0.35 * atr15m)) * 100) / 100;
    tp2Price = Math.round((entryPrice - Math.max(22, 0.65 * atr15m)) * 100) / 100;
  }

  // 3. Simulate Limit Order Execution between 09:34 and 09:48 ET
  const slippagePts =
    propProfile?.slippagePts ??
    (propProfile?.defaultSlippageTicks !== undefined
      ? propProfile.defaultSlippageTicks * 0.25
      : 0.75); // 3 ticks (0.75 pt)
  const feePerContractRT =
    propProfile?.feePerContractRT ?? propProfile?.mnqFeeRoundTrip ?? 1.30;
  const pointValue = 2.0; // MNQ point value ($2/pt)

  let isFilled = false;
  let fillBarIdx = -1;
  let fillPrice = entryPrice;
  let fillTimeET: string | undefined;

  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    const et = getBarETParts(b.timestamp);
    const m = et.hour * 60 + et.minute;

    // Execution window: strictly 09:34–09:48 ET (574–588 mins)
    if (m >= 9 * 60 + 34 && m <= 9 * 60 + 48) {
      if (isBull && b.low <= entryPrice) {
        isFilled = true;
        fillBarIdx = i;
        fillPrice = Math.round((entryPrice + slippagePts) * 100) / 100;
        fillTimeET = `${et.hour.toString().padStart(2, "0")}:${et.minute.toString().padStart(2, "0")}:00 ET`;
        break;
      } else if (isBear && b.high >= entryPrice) {
        isFilled = true;
        fillBarIdx = i;
        fillPrice = Math.round((entryPrice - slippagePts) * 100) / 100;
        fillTimeET = `${et.hour.toString().padStart(2, "0")}:${et.minute.toString().padStart(2, "0")}:00 ET`;
        break;
      }
    }
  }

  let tripleBarrierOutcome: TripleBarrierOutcome = isFilled ? "TIME_EXIT" : "NO_FILL";
  let realizedNetR = 0;
  let netPnlDollars = 0;
  let exitPrice = windowClose1000;
  let exitTimeET = "10:00:00 ET";
  let biasCorrect = false;

  if (isCaution) {
    const totalRange = windowHigh - windowLow;
    const upMove = Math.max(0, windowHigh - openPrice930);
    const downMove = Math.max(0, openPrice930 - windowLow);
    const netMove = Math.abs(windowClose1000 - openPrice930);
    const directionalEfficiency = totalRange > 0 ? netMove / totalRange : 0;
    const isTwoWayReversal = upMove >= atr15m * 0.75 && downMove >= atr15m * 0.75;
    const isCompressedChop = totalRange <= atr15m * 1.35 || directionalEfficiency < 0.35;
    biasCorrect = isTwoWayReversal || isCompressedChop;
    tripleBarrierOutcome = "NO_FILL";
  } else if (isFilled && fillBarIdx >= 0) {
    const stopPts = Math.max(3.0, Math.abs(fillPrice - stopLoss));
    const initialContracts = 2; // Standard 2-lot scale-out plan
    const initialRiskDollars =
      initialContracts * (stopPts * pointValue + slippagePts * pointValue) +
      initialContracts * feePerContractRT;

    let remainingContracts = initialContracts;
    let tp1Hit = false;
    let realizedGrossDollars = 0;

    for (let i = fillBarIdx; i < sorted.length; i++) {
      const b = sorted[i];
      const et = getBarETParts(b.timestamp);
      const m = et.hour * 60 + et.minute;

      // Barrier 1: Stop Loss (Pre-TP1 initial stop-loss)
      if (!tp1Hit && ((isBull && b.low <= stopLoss) || (isBear && b.high >= stopLoss))) {
        const exitPx = isBull ? stopLoss - slippagePts : stopLoss + slippagePts;
        const pts = isBull ? exitPx - fillPrice : fillPrice - exitPx;
        realizedGrossDollars += remainingContracts * (pts * pointValue);
        remainingContracts = 0;
        exitPrice = exitPx;
        exitTimeET = `${et.hour.toString().padStart(2, "0")}:${et.minute.toString().padStart(2, "0")}:00 ET`;
        tripleBarrierOutcome = "STOPPED_OUT";
        break;
      }

      // Barrier 2: Take Profit 1 (Scale out 1 contract)
      if (!tp1Hit && ((isBull && b.high >= tp1Price) || (isBear && b.low <= tp1Price))) {
        tp1Hit = true;
        const pts = isBull ? tp1Price - fillPrice : fillPrice - tp1Price;
        realizedGrossDollars += 1 * (pts * pointValue);
        remainingContracts = 1;
        tripleBarrierOutcome = "HIT_TP1";
      }

      // Barrier 2: Take Profit 2 (Exit remaining runner)
      if (tp1Hit && ((isBull && b.high >= tp2Price) || (isBear && b.low <= tp2Price))) {
        const pts = isBull ? tp2Price - fillPrice : fillPrice - tp2Price;
        realizedGrossDollars += 1 * (pts * pointValue);
        remainingContracts = 0;
        exitPrice = tp2Price;
        exitTimeET = `${et.hour.toString().padStart(2, "0")}:${et.minute.toString().padStart(2, "0")}:00 ET`;
        tripleBarrierOutcome = "HIT_TP2";
        break;
      }

      // 1m MSS Kill-Switch: If trade reached TP1 (>= 0.8R) and opposing bar closes back across entry
      if (tp1Hit && ((isBull && b.close < entryPrice) || (isBear && b.close > entryPrice))) {
        const pts = isBull ? entryPrice - fillPrice : fillPrice - entryPrice;
        realizedGrossDollars += 1 * (pts * pointValue);
        remainingContracts = 0;
        exitPrice = entryPrice;
        exitTimeET = `${et.hour.toString().padStart(2, "0")}:${et.minute.toString().padStart(2, "0")}:00 ET`;
        tripleBarrierOutcome = "HIT_TP1";
        break;
      }

      // Barrier 3: 10:00 AM ET Vertical Time Exit
      if (m >= 10 * 60) {
        if (remainingContracts > 0) {
          const pts = isBull ? b.close - fillPrice : fillPrice - b.close;
          realizedGrossDollars += remainingContracts * (pts * pointValue);
          remainingContracts = 0;
          exitPrice = b.close;
          exitTimeET = "10:00:00 ET";
          tripleBarrierOutcome = tp1Hit ? "HIT_TP1" : "TIME_EXIT";
        }
        break;
      }
    }

    const totalFrictionDollars =
      initialContracts * feePerContractRT + initialContracts * slippagePts * pointValue;
    netPnlDollars = Math.round((realizedGrossDollars - totalFrictionDollars) * 100) / 100;
    realizedNetR = Math.round((netPnlDollars / Math.max(10, initialRiskDollars)) * 100) / 100;
    biasCorrect = netPnlDollars > 0;
  } else {
    // If no limit fill occurred during 09:34–09:48, evaluate directional expansion without invalidation
    const requiredExpansion = Math.max(14, atr15m * 0.75);
    const invalidationStop = Math.max(18, atr15m * 1.0);

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
    }
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
  const totalWindowRange = windowHigh - windowLow;
  const upExcursion = Math.max(0, windowHigh - openPrice930);
  const downExcursion = Math.max(0, openPrice930 - windowLow);
  const netWindowMove = Math.abs(windowClose1000 - openPrice930);
  const windowEfficiency = totalWindowRange > 0 ? netWindowMove / totalWindowRange : 0;
  const chopWarningCorrect = isCaution
    ? biasCorrect
    : totalWindowRange <= atr15m * 1.1 || (upExcursion >= atr15m * 0.75 && downExcursion >= atr15m * 0.75) || windowEfficiency < 0.35;

  // Strictly proper scoring rules: Brier score and Log score
  const pConfidence =
    pred.confidenceTier === "HIGH" ? 0.8 : pred.confidenceTier === "MODERATE" ? 0.65 : 0.5;
  const yActual = biasCorrect ? 1.0 : 0.0;
  const brierScore = Math.round(Math.pow(pConfidence - yActual, 2) * 1000) / 1000;

  const eps = 1e-4;
  const pSafe = Math.max(eps, Math.min(1 - eps, pConfidence));
  const logScore = Math.round(-(yActual * Math.log(pSafe) + (1 - yActual) * Math.log(1 - pSafe)) * 1000) / 1000;

  // Composite Score (0–100)
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
    logScore,
    compositeScore,
    tripleBarrierOutcome,
    realizedNetR,
    netPnlDollars,
    fillPrice: isFilled ? fillPrice : undefined,
    fillTimeET,
    exitPrice: isFilled ? exitPrice : undefined,
    exitTimeET: isFilled ? exitTimeET : undefined,
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

  const nowET = getETParts(new Date());
  const todayET = nowET.dateStr;
  const nowMinsET = nowET.hour * 60 + nowET.minute;

  // Filter out predictions whose 09:30-10:00 ET window + 20m CME delay (10:20 ET) has not settled yet
  const eligible = pending.filter((p) => {
    if (p.targetTradeDate < todayET) return true;
    if (p.targetTradeDate === todayET && nowMinsET >= 10 * 60 + 20) return true;
    return false;
  });

  if (eligible.length === 0) {
    return { gradedCount: 0, gradedDates: [], errors: [] };
  }

  const gradedDates: string[] = [];
  const errors: string[] = [];

  // Prefer 1m bars for accurate 09:30-09:33 OR and 09:34-09:48 limit-fill simulation; fallback to 5m bars
  let bars1m: OHLCVBar[] = [];
  let bars5m: OHLCVBar[] = [];
  try {
    bars1m = await fetch1mBars("NQ=F");
  } catch {
    bars1m = [];
  }

  try {
    bars5m = await provider.getIntradayBars("NQ=F", "5m");
  } catch (err: any) {
    if (bars1m.length === 0) {
      errors.push(`Failed to fetch intraday bars: ${err?.message || err}`);
      return { gradedCount: 0, gradedDates: [], errors };
    }
  }

  for (const pred of eligible) {
    try {
      const window1m = extractNYOpenBars(bars1m, pred.targetTradeDate);
      const window5m = extractNYOpenBars(bars5m, pred.targetTradeDate);
      const windowBars = window1m.length >= 6 ? window1m : window5m;

      // Require at least 3 bars in 09:30-10:00 ET window
      if (windowBars.length < 3) {
        continue;
      }

      const frozenAtr = pred.regimeInputs?.atr15m && pred.regimeInputs.atr15m > 0
        ? pred.regimeInputs.atr15m
        : 24.5;
      const grade = computePredictionGrade(pred, windowBars, frozenAtr);
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
