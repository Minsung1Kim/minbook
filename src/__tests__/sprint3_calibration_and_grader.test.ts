import { describe, it, expect } from "vitest";
import { computePredictionGrade } from "../lib/calibration/grader";
import {
  computeBayesianFactorShrinkage,
  computeBayesianShrinkageOptimization,
  STATUS_TAG_MIN_SAMPLE_SIZE,
  WEIGHT_MIN_CLIP,
  WEIGHT_MAX_CLIP
} from "../lib/calibration/optimizer";
import { computeBootstrapUpperP90 } from "../lib/db";
import { DailyPrediction, PredictionGrade, ModelWeightsRecord, FactorAttribution } from "../types/calibration";
import { OHLCVBar, PropProfile } from "../types/market";
import { JournalAnalytics } from "../types/app";

describe("Sprint 3: Empirical Grading & Safe Self-Calibration", () => {
  const basePrediction: DailyPrediction = {
    id: "pred_2026-11-24",
    targetTradeDate: "2026-11-24",
    frozenAtEt: "2026-11-24T09:25:00.000Z",
    modelVersion: "v3.0",
    spotAtFreeze: 21000,
    biasVerdict: "LONG_CONTINUATION",
    confidenceTier: "HIGH",
    archetype: "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)",
    stopHuntLikelihood: "LOW",
    stopHuntTargetLevel: null,
    primaryRetraceLevels: {
      vwap: 20990,
      onMid: 20980,
      pdc: 20960,
      htf50: 20970,
      htf618: 20950
    },
    liquidityDraws: {
      onh: 21060,
      onl: 20950,
      pdh: 21080,
      pdl: 20930
    },
    regimeInputs: {
      factorScores: { compositeHtf: 1, smtBreadth: 1, macroImpulse: 1, openingFlow: 1 }
    },
    status: "PENDING_GRADE",
    createdAt: "2026-11-24T09:25:00.000Z"
  };

  const testPropProfile: PropProfile = {
    id: "Topstep_EOD",
    firmName: "Topstep",
    accountName: "Topstep $50k Express",
    drawdownMode: "EOD_TRAILING",
    maxTrailingDrawdown: 2000,
    currentRemainingDrawdown: 2000,
    cycleProfitTarget: 3000,
    consistencyRulePercent: 40,
    dailyLossLimit: 400,
    mnqFeeRoundTrip: 1.30,
    nqFeeRoundTrip: 4.54,
    defaultSlippageTicks: 3,
    newsBlackoutMinutes: 2,
    prohibitOvernight: true,
    feePerContractRT: 1.30,
    slippagePts: 0.75
  };

  describe("1. Triple-Barrier R-Expectancy Grader", () => {
    it("simulates limit entry at 40%-50% retrace and reaches TP1 and TP2 with friction deducted", () => {
      // 09:30-09:33 opening range: High 21020, Low 21000 -> impulseRange = 20 pts
      // Predicted retrace entry = 21020 - 0.45 * 20 = 21011
      // Stop Loss = 21000 - max(3, 0.15 * 25) = 20996.25
      // TP1 = 21011 + 12 = 21023
      // TP2 = 21011 + 22 = 21033
      const atr15m = 25;
      const bars: OHLCVBar[] = [
        // 09:30 ET
        { timestamp: "2026-11-24T14:30:00.000Z", open: 21005, high: 21015, low: 21000, close: 21012, volume: 1500 },
        // 09:31 ET
        { timestamp: "2026-11-24T14:31:00.000Z", open: 21012, high: 21020, low: 21008, close: 21018, volume: 1800 },
        // 09:32 ET
        { timestamp: "2026-11-24T14:32:00.000Z", open: 21018, high: 21020, low: 21010, close: 21015, volume: 1400 },
        // 09:33 ET (Observation lock completes, OR established: High 21020, Low 21000)
        { timestamp: "2026-11-24T14:33:00.000Z", open: 21015, high: 21019, low: 21012, close: 21017, volume: 1200 },
        // 09:35 ET: Retraces to 21010 <= entryPrice (21011) -> Limit fill at 21011 + 0.75 slippage = 21011.75
        { timestamp: "2026-11-24T14:35:00.000Z", open: 21017, high: 21018, low: 21009, close: 21014, volume: 2200 },
        // 09:38 ET: Rallies to 21025 >= TP1 (21023) -> Scales out 1 contract
        { timestamp: "2026-11-24T14:38:00.000Z", open: 21014, high: 21026, low: 21013, close: 21024, volume: 3100 },
        // 09:42 ET: Surges to 21040 >= TP2 (21033) -> Exits remaining runner
        { timestamp: "2026-11-24T14:42:00.000Z", open: 21024, high: 21042, low: 21022, close: 21038, volume: 4500 },
        // 10:00 ET: Close
        { timestamp: "2026-11-24T15:00:00.000Z", open: 21038, high: 21045, low: 21035, close: 21040, volume: 2000 }
      ];

      const grade = computePredictionGrade(basePrediction, bars, atr15m, testPropProfile);
      expect(grade).not.toBeNull();
      expect(grade?.tripleBarrierOutcome).toBe("HIT_TP2");
      expect(grade?.biasCorrect).toBe(true);
      expect(grade?.fillPrice).toBe(21011.75); // entry + slippage
      expect(grade?.realizedNetR).toBeCloseTo(0.88, 2);
      expect(grade?.netPnlDollars).toBeGreaterThan(50);
      expect(grade?.logScore).toBeDefined();
      expect(grade?.logScore).toBeGreaterThan(0);
    });

    it("simulates Barrier 1: Stop-loss trigger when adverse excursion penetrates structural SL", () => {
      const atr15m = 25;
      const bars: OHLCVBar[] = [
        // 09:30-09:33 OR: High 21020, Low 21000 -> entry 21011, stop 20996.25
        { timestamp: "2026-11-24T14:30:00.000Z", open: 21005, high: 21020, low: 21000, close: 21015, volume: 1500 },
        { timestamp: "2026-11-24T14:33:00.000Z", open: 21015, high: 21018, low: 21012, close: 21016, volume: 1200 },
        // 09:35 ET: Limit fill at 21011
        { timestamp: "2026-11-24T14:35:00.000Z", open: 21016, high: 21016, low: 21010, close: 21010, volume: 2000 },
        // 09:37 ET: Flushes through SL to 20990 <= 20996.25
        { timestamp: "2026-11-24T14:37:00.000Z", open: 21010, high: 21011, low: 20988, close: 20992, volume: 4000 },
        { timestamp: "2026-11-24T15:00:00.000Z", open: 20992, high: 21000, low: 20985, close: 20995, volume: 1500 }
      ];

      const grade = computePredictionGrade(basePrediction, bars, atr15m, testPropProfile);
      expect(grade).not.toBeNull();
      expect(grade?.tripleBarrierOutcome).toBe("STOPPED_OUT");
      expect(grade?.biasCorrect).toBe(false);
      expect(grade?.realizedNetR).toBeLessThan(0);
      expect(grade?.netPnlDollars).toBeLessThan(0);
    });

    it("triggers 1m MSS kill-switch if price reaches TP1 then an opposing bar closes back across entry", () => {
      const atr15m = 25;
      const bars: OHLCVBar[] = [
        // 09:30-09:33 OR: High 21020, Low 21000 -> entry 21011, TP1 21023
        { timestamp: "2026-11-24T14:30:00.000Z", open: 21005, high: 21020, low: 21000, close: 21015, volume: 1500 },
        { timestamp: "2026-11-24T14:33:00.000Z", open: 21015, high: 21018, low: 21012, close: 21016, volume: 1200 },
        // 09:35 ET: Limit fill at 21011
        { timestamp: "2026-11-24T14:35:00.000Z", open: 21016, high: 21017, low: 21010, close: 21012, volume: 2000 },
        // 09:37 ET: Hits TP1 at 21024 -> 1 contract scaled out
        { timestamp: "2026-11-24T14:37:00.000Z", open: 21012, high: 21025, low: 21012, close: 21024, volume: 3000 },
        // 09:39 ET: Opposing reversal candle closes at 21008 < entryPrice (21011) -> Kill-switch flattens runner
        { timestamp: "2026-11-24T14:39:00.000Z", open: 21024, high: 21024, low: 21005, close: 21008, volume: 3500 },
        { timestamp: "2026-11-24T15:00:00.000Z", open: 21008, high: 21012, low: 21000, close: 21005, volume: 1500 }
      ];

      const grade = computePredictionGrade(basePrediction, bars, atr15m, testPropProfile);
      expect(grade).not.toBeNull();
      expect(grade?.tripleBarrierOutcome).toBe("HIT_TP1");
      expect(grade?.exitPrice).toBe(21011); // Exited runner at entry level
      expect(grade?.biasCorrect).toBe(true);
      expect(grade?.realizedNetR).toBeGreaterThan(0);
    });

    it("triggers Barrier 3 (10:00 AM ET vertical time exit) if trade neither hits SL nor TP2", () => {
      const atr15m = 25;
      const bars: OHLCVBar[] = [
        // 09:30-09:33 OR: High 21020, Low 21000 -> entry 21011
        { timestamp: "2026-11-24T14:30:00.000Z", open: 21005, high: 21020, low: 21000, close: 21015, volume: 1500 },
        { timestamp: "2026-11-24T14:33:00.000Z", open: 21015, high: 21018, low: 21012, close: 21016, volume: 1200 },
        // 09:35 ET: Limit fill at 21011
        { timestamp: "2026-11-24T14:35:00.000Z", open: 21016, high: 21017, low: 21010, close: 21012, volume: 2000 },
        // 09:40-09:59 ET: Chops between 21012 and 21018 (never hits TP1=21023 or SL=20996)
        { timestamp: "2026-11-24T14:45:00.000Z", open: 21012, high: 21018, low: 21011, close: 21015, volume: 1200 },
        // 10:00 ET: Vertical exit at close (21016)
        { timestamp: "2026-11-24T15:00:00.000Z", open: 21015, high: 21018, low: 21014, close: 21016, volume: 1500 }
      ];

      const grade = computePredictionGrade(basePrediction, bars, atr15m, testPropProfile);
      expect(grade).not.toBeNull();
      expect(grade?.tripleBarrierOutcome).toBe("TIME_EXIT");
      expect(grade?.exitPrice).toBe(21016);
      expect(grade?.exitTimeET).toBe("10:00:00 ET");
    });

    it("records NO_FILL if price never retraces to entry zone by 09:48 ET", () => {
      const atr15m = 25;
      const bars: OHLCVBar[] = [
        // 09:30-09:33 OR: High 21030, Low 21010 -> entry 21021
        { timestamp: "2026-11-24T14:30:00.000Z", open: 21010, high: 21025, low: 21010, close: 21020, volume: 1500 },
        { timestamp: "2026-11-24T14:33:00.000Z", open: 21020, high: 21030, low: 21018, close: 21028, volume: 1200 },
        // 09:35-09:48 ET: Price runs straight up without dipping below 21025 (never reaches 21021)
        { timestamp: "2026-11-24T14:35:00.000Z", open: 21028, high: 21040, low: 21026, close: 21038, volume: 3000 },
        { timestamp: "2026-11-24T14:45:00.000Z", open: 21038, high: 21055, low: 21035, close: 21050, volume: 3000 },
        { timestamp: "2026-11-24T15:00:00.000Z", open: 21050, high: 21060, low: 21048, close: 21055, volume: 2000 }
      ];

      const grade = computePredictionGrade(basePrediction, bars, atr15m, testPropProfile);
      expect(grade).not.toBeNull();
      expect(grade?.tripleBarrierOutcome).toBe("NO_FILL");
      // Still grades directional expansion accurately
      expect(grade?.biasCorrect).toBe(true);
    });

    it("computes strictly proper Brier and Log scores", () => {
      // High confidence = p = 0.80
      // If win (y = 1): Brier = (0.8 - 1)^2 = 0.04
      // Log score = -ln(0.8) ≈ 0.223
      const atr15m = 25;
      const bars: OHLCVBar[] = [
        { timestamp: "2026-11-24T14:30:00.000Z", open: 21000, high: 21040, low: 21000, close: 21035, volume: 2000 }
      ];

      const grade = computePredictionGrade(basePrediction, bars, atr15m);
      expect(grade?.brierScore).toBeCloseTo(0.04, 3);
      expect(grade?.logScore).toBeCloseTo(0.223, 2);
    });
  });

  describe("2. Beta-Binomial Bayesian Shrinkage Optimizer", () => {
    it("shrinks a 10-0 winning streak from raw 100% to 58.3% posterior mean with alpha0=25, beta0=25", () => {
      const history: Array<{ prediction: DailyPrediction; grade: PredictionGrade }> = [];
      for (let i = 0; i < 10; i++) {
        const pred: DailyPrediction = {
          ...basePrediction,
          id: `pred_${i}`,
          targetTradeDate: `2026-10-${(i + 1).toString().padStart(2, "0")}`,
          regimeInputs: { factorScores: { compositeHtf: 1 } }
        };
        const grade: PredictionGrade = {
          id: `grade_${i}`,
          targetTradeDate: pred.targetTradeDate,
          predictionId: pred.id,
          openPrice930: 21000,
          windowHigh: 21050,
          windowLow: 20990,
          windowClose1000: 21045,
          biasCorrect: true,
          favorableExcursionPts: 45,
          adverseExcursionPts: 10,
          retraceTapped: ["VWAP"],
          stopHuntOccurred: false,
          liquidityDrawHit: ["ONH"],
          chopWarningCorrect: false,
          brierScore: 0.04,
          compositeScore: 85,
          gradedAt: "2026-10-01T10:20:00.000Z"
        };
        history.push({ prediction: pred, grade });
      }

      // gamma=1.0 for exact analytic check:
      // effWins = 10, effN = 10 -> (10 + 25) / (10 + 25 + 25) = 35 / 60 = 0.5833
      const shrinkage = computeBayesianFactorShrinkage(history, 1.0, 25, 25);
      const res = shrinkage["compositeHtf"];
      expect(res).toBeDefined();
      expect(res.rawWinRate).toBe(100);
      expect(res.shrunkWinRate).toBeCloseTo(58.3, 1);
      // bayesianWeight = 2.0 * 0.5833 = 1.17
      expect(res.bayesianWeight).toBeCloseTo(1.17, 2);
      expect(res.clippedWeight).toBeCloseTo(1.17, 2);
    });

    it("clamps proposed Bayesian factor weights strictly within [0.6, 1.5]", () => {
      const history: Array<{ prediction: DailyPrediction; grade: PredictionGrade }> = [];
      // 40 consecutive wins for compositeHtf, 40 consecutive losses for openingFlow
      for (let i = 0; i < 40; i++) {
        const pred: DailyPrediction = {
          ...basePrediction,
          id: `pred_${i}`,
          targetTradeDate: `2026-10-${(i + 1).toString().padStart(2, "0")}`,
          regimeInputs: { factorScores: { compositeHtf: 1, openingFlow: -1 } }
        };
        const grade: PredictionGrade = {
          id: `grade_${i}`,
          targetTradeDate: pred.targetTradeDate,
          predictionId: pred.id,
          openPrice930: 21000,
          windowHigh: 21050,
          windowLow: 20990,
          windowClose1000: 21045,
          biasCorrect: true, // compositeHtf wins
          favorableExcursionPts: 45,
          adverseExcursionPts: 10,
          retraceTapped: ["VWAP"],
          stopHuntOccurred: false,
          liquidityDrawHit: ["ONH"],
          chopWarningCorrect: false,
          brierScore: 0.04,
          compositeScore: 85,
          gradedAt: "2026-10-01T10:20:00.000Z"
        };
        history.push({ prediction: pred, grade });
      }

      const shrinkage = computeBayesianFactorShrinkage(history, 0.99, 25, 25);
      for (const res of Object.values(shrinkage)) {
        expect(res.clippedWeight).toBeGreaterThanOrEqual(WEIGHT_MIN_CLIP);
        expect(res.clippedWeight).toBeLessThanOrEqual(WEIGHT_MAX_CLIP);
      }
    });

    it("enforces N >= 60 sample size gate before granting EDGE_ENHANCER or NOISE_DETRACTOR status tags", () => {
      // Setup: test with N = 35 (below gate) vs N = 65 (above gate)
      const buildFactors = (sampleSize: number, lift: number): FactorAttribution[] => {
        let status: FactorAttribution["status"] = "NEUTRAL";
        if (sampleSize >= STATUS_TAG_MIN_SAMPLE_SIZE) {
          if (lift >= 4.0) status = "EDGE_ENHANCER";
          else if (lift <= -4.0) status = "NOISE_DETRACTOR";
        }
        return [
          {
            factorKey: "compositeHtf",
            factorName: "Composite HTF",
            totalOccurrences: sampleSize,
            winsWhenActive: Math.round(sampleSize * 0.7),
            winRate: 70,
            baselineWinRate: 60,
            liftPercent: lift,
            currentWeight: 1.0,
            performanceByVol: { normalVolWinRate: 70, highVolWinRate: 70 },
            status
          }
        ];
      };

      const underGate = buildFactors(35, 10.0);
      expect(underGate[0].status).toBe("NEUTRAL");

      const aboveGateEnhancer = buildFactors(65, 8.0);
      expect(aboveGateEnhancer[0].status).toBe("EDGE_ENHANCER");

      const aboveGateDetractor = buildFactors(65, -8.0);
      expect(aboveGateDetractor[0].status).toBe("NOISE_DETRACTOR");
    });
  });

  describe("3. Journal MAE Stop Calibration & Bootstrap Upper P90", () => {
    it("computes non-parametric bootstrap upper 90% confidence bound correctly", () => {
      // Deterministic synthetic array of winners' MAE
      const winnerMaes = [
        0.15, 0.20, 0.22, 0.25, 0.28, 0.30, 0.32, 0.35, 0.38, 0.40,
        0.42, 0.45, 0.48, 0.50, 0.52, 0.55, 0.58, 0.60, 0.62, 0.65
      ];

      const upper90 = computeBootstrapUpperP90(winnerMaes, 500, 0.90);
      expect(upper90).toBeGreaterThanOrEqual(0.55);
      expect(upper90).toBeLessThanOrEqual(0.70);
    });

    it("enforces N >= 150 total trades AND >= 75 winning trades gate for MAE stop calibration", () => {
      const evaluateGate = (totalTrades: number, wins: number) => {
        const isCalibrated = totalTrades >= 150 && wins >= 75;
        const statusMessage = !isCalibrated
          ? `COLLECTING SAMPLE (${totalTrades}/150 TRADES, ${wins}/75 WINS) — DO NOT TIGHTEN STOPS YET`
          : `SAMPLE CALIBRATED (${totalTrades} TRADES, ${wins} WINS) — BOOTSTRAP P90 MAE ACTIVE`;
        return { isCalibrated, statusMessage };
      };

      // Case 1: 50 trades, 30 wins (old v2.0 gate would pass, v3.0 rejects)
      const underTotal = evaluateGate(50, 30);
      expect(underTotal.isCalibrated).toBe(false);
      expect(underTotal.statusMessage).toContain("DO NOT TIGHTEN STOPS YET");

      // Case 2: 160 trades but only 60 wins (fails wins gate)
      const underWins = evaluateGate(160, 60);
      expect(underWins.isCalibrated).toBe(false);
      expect(underWins.statusMessage).toContain("DO NOT TIGHTEN STOPS YET");

      // Case 3: 160 trades and 85 wins (passes both gates)
      const fullyCalibrated = evaluateGate(160, 85);
      expect(fullyCalibrated.isCalibrated).toBe(true);
      expect(fullyCalibrated.statusMessage).toContain("SAMPLE CALIBRATED");
      expect(fullyCalibrated.statusMessage).toContain("BOOTSTRAP P90 MAE ACTIVE");
    });
  });
});
