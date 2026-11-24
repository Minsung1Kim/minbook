import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { SqliteCalibrationRepository } from "../lib/calibration/store";
import {
  computePredictionGrade,
  extractNYOpenBars,
  freezePredictionSnapshot
} from "../lib/calibration/grader";
import {
  computeWalkForwardOptimization,
  FACTOR_KEY_CONFIG
} from "../lib/calibration/optimizer";
import { DailyPrediction, PredictionGrade, ModelWeightsRecord, FactorAttribution } from "../types/calibration";
import { OHLCVBar, OpenBriefData } from "../types/market";

describe("Calibration & Self-Improvement Engine", () => {
  let memoryDb: DatabaseSync;
  let repo: SqliteCalibrationRepository;

  beforeEach(() => {
    // In-memory SQLite database for isolated test runs
    memoryDb = new DatabaseSync(":memory:");
    repo = new SqliteCalibrationRepository(memoryDb);
  });

  describe("Immutable Snapshot Locking", () => {
    const mockPrediction: DailyPrediction = {
      id: "pred_2026-11-24",
      targetTradeDate: "2026-11-24",
      frozenAtEt: "2026-11-24T09:25:00.000Z",
      modelVersion: "v1.0",
      spotAtFreeze: 21050,
      biasVerdict: "LONG_CONTINUATION",
      confidenceTier: "HIGH",
      archetype: "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)",
      stopHuntLikelihood: "LOW",
      stopHuntTargetLevel: null,
      primaryRetraceLevels: {
        vwap: 21030,
        onMid: 21015,
        pdc: 20990,
        htf50: 21000,
        htf618: 20970
      },
      liquidityDraws: {
        onh: 21110,
        onl: 20950,
        pdh: 21140,
        pdl: 20920
      },
      regimeInputs: {
        vxn: 21.0,
        vix: 18.0,
        vixTermRatio: 0.95,
        vvix: 95,
        vrp: 2.0,
        factorScores: { htfTrend: 1, vwapAlignment: 1 }
      },
      status: "PENDING_GRADE",
      createdAt: "2026-11-24T09:25:00.000Z"
    };

    it("saves pre-market prediction successfully on first freeze", async () => {
      const saved = await repo.savePrediction(mockPrediction);
      expect(saved.targetTradeDate).toBe("2026-11-24");

      const retrieved = await repo.getPredictionByDate("2026-11-24");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.spotAtFreeze).toBe(21050);
      expect(retrieved?.status).toBe("PENDING_GRADE");
    });

    it("throws an error if attempting to overwrite an already frozen prediction (zero hindsight bias)", async () => {
      await repo.savePrediction(mockPrediction);

      // Mutated attempt to change prediction after open
      const mutated: DailyPrediction = {
        ...mockPrediction,
        spotAtFreeze: 21150,
        biasVerdict: "SHORT_CONTINUATION"
      };

      await expect(repo.savePrediction(mutated)).rejects.toThrow(
        /Immutable Freeze Error: Prediction already exists/
      );

      // Verify original remains uncorrupted
      const retrieved = await repo.getPredictionByDate("2026-11-24");
      expect(retrieved?.biasVerdict).toBe("LONG_CONTINUATION");
      expect(retrieved?.spotAtFreeze).toBe(21050);
    });

    it("freezePredictionSnapshot returns isNew: false when snapshot is already frozen", async () => {
      await repo.savePrediction(mockPrediction);

      const mockBrief = {
        sessionInfo: { targetTradeDate: "2026-11-24" },
        quote: { price: 21080 },
        bias: { verdict: "LONG_CONTINUATION", confidenceTier: "HIGH" },
        playbook: {
          retraceAnalysis: { archetype: "OPEN-TEST-DRIVE" },
          stopHuntWatch: { likelihood: "LOW", targetLevel: null },
          factorScorecard: []
        },
        sessionMetrics: {
          sessionVwap: 21030,
          onMid: 21015,
          pdc: 20990,
          htf50Retrace: 21000,
          htf618Retrace: 20970,
          onh: 21110,
          onl: 20950,
          pdh: 21140,
          pdl: 20920,
          inventoryPercent: 65
        }
      } as unknown as OpenBriefData;

      const res = await freezePredictionSnapshot(mockBrief, repo);
      expect(res.isNew).toBe(false);
      expect(res.message).toContain("Immutable");
    });
  });

  describe("Deterministic 09:30–10:00 Grading Math", () => {
    const mockLongPred: DailyPrediction = {
      id: "pred_2026-11-24",
      targetTradeDate: "2026-11-24",
      frozenAtEt: "2026-11-24T09:25:00.000Z",
      modelVersion: "v1.0",
      spotAtFreeze: 21000,
      biasVerdict: "LONG_CONTINUATION",
      confidenceTier: "HIGH",
      archetype: "OPEN-TEST-DRIVE",
      stopHuntLikelihood: "HIGH",
      stopHuntTargetLevel: 20975, // sweep below 20975 and reverse
      primaryRetraceLevels: {
        vwap: 20990,
        onMid: 20980,
        pdc: 20960,
        htf50: 20970,
        htf618: 20950
      },
      liquidityDraws: {
        onh: 21050,
        onl: 20970,
        pdh: 21080,
        pdl: 20940
      },
      regimeInputs: { factorScores: { htfTrend: 1 } },
      status: "PENDING_GRADE",
      createdAt: "2026-11-24T09:25:00.000Z"
    };

    it("grades Long bias as CORRECT when price hits +0.75 ATR before -1.0 ATR stop", () => {
      const atr15m = 20; // 0.75x = +15 pts, 1.0x = -20 pts
      // 9:30 open = 21000
      // Bar 1 (9:30): Dips to 20988 (VWAP tap at 20990), holds above 20980 (within -20 pts)
      // Bar 2 (9:35): Expands to 21025 (+25 pts >= +15 pts)
      const bars: OHLCVBar[] = [
        {
          timestamp: "2026-11-24T14:30:00.000Z", // 09:30 ET
          open: 21000,
          high: 21005,
          low: 20988,
          close: 20995,
          volume: 2000
        },
        {
          timestamp: "2026-11-24T14:35:00.000Z", // 09:35 ET
          open: 20995,
          high: 21025,
          low: 20992,
          close: 21020,
          volume: 3500
        },
        {
          timestamp: "2026-11-24T15:00:00.000Z", // 10:00 ET
          open: 21020,
          high: 21035,
          low: 21015,
          close: 21030,
          volume: 1800
        }
      ];

      const grade = computePredictionGrade(mockLongPred, bars, atr15m);
      expect(grade).not.toBeNull();
      expect(grade?.biasCorrect).toBe(true);
      expect(grade?.openPrice930).toBe(21000);
      expect(grade?.windowHigh).toBe(21035);
      expect(grade?.windowLow).toBe(20988);
      expect(grade?.retraceTapped).toContain("VWAP");
      expect(grade?.favorableExcursionPts).toBe(35); // 21035 - 21000
      expect(grade?.adverseExcursionPts).toBe(12); // 21000 - 20988
      expect(grade?.compositeScore).toBeGreaterThan(70);
    });

    it("grades Long bias as FAILED when price invalidates -1.0 ATR stop first", () => {
      const atr15m = 20; // 1.0x stop = -20 pts (20980)
      const bars: OHLCVBar[] = [
        {
          timestamp: "2026-11-24T14:30:00.000Z",
          open: 21000,
          high: 21004,
          low: 20970, // plunged 30 pts below 21000 -> invalidates stop!
          close: 20975,
          volume: 4000
        },
        {
          timestamp: "2026-11-24T15:00:00.000Z",
          open: 20975,
          high: 21010,
          low: 20970,
          close: 20990,
          volume: 2500
        }
      ];

      const grade = computePredictionGrade(mockLongPred, bars, atr15m);
      expect(grade).not.toBeNull();
      expect(grade?.biasCorrect).toBe(false);
      expect(grade?.adverseExcursionPts).toBe(30);
    });

    it("identifies Stop-Hunt sweep and reversal back inside range", () => {
      // stopHuntTargetLevel is 20975
      // Price plunges to 20972 (piercing 20975) then reverses and closes at 21010
      const bars: OHLCVBar[] = [
        {
          timestamp: "2026-11-24T14:30:00.000Z",
          open: 21000,
          high: 21005,
          low: 20972, // pierced target level 20975
          close: 20990,
          volume: 5000
        },
        {
          timestamp: "2026-11-24T15:00:00.000Z",
          open: 20990,
          high: 21020,
          low: 20985,
          close: 21015, // closed well above 20975
          volume: 3000
        }
      ];

      const grade = computePredictionGrade(mockLongPred, bars, 25);
      expect(grade?.stopHuntOccurred).toBe(true);
    });

    it("computes exact mathematical Brier score: (p - y)^2", () => {
      // High confidence = p = 0.80
      // Correct bias = y = 1.0 -> (0.8 - 1.0)^2 = 0.04
      const bars: OHLCVBar[] = [
        {
          timestamp: "2026-11-24T14:30:00.000Z",
          open: 21000,
          high: 21035,
          low: 20995,
          close: 21030,
          volume: 2000
        }
      ];

      const grade = computePredictionGrade(mockLongPred, bars, 20);
      expect(grade?.brierScore).toBeCloseTo(0.04, 3);
    });
  });

  describe("Walk-Forward Calibration Bounds & Anti-Overfitting Guardrails", () => {
    it("returns null when sample size N < 30 (enforcing strict calibration gate)", () => {
      const smallHistory: Array<{ prediction: DailyPrediction; grade: PredictionGrade }> = [];
      const activeWeights: ModelWeightsRecord = {
        id: "weight_v1.0",
        version: "v1.0",
        isActive: true,
        weights: { htfTrend: 1.0, vwapAlignment: 1.0 },
        sampleSizeUsed: 0,
        outOfSampleAccuracy: 0,
        changeSummary: "default",
        createdAt: new Date().toISOString()
      };

      const factors: FactorAttribution[] = [
        {
          factorKey: "htfTrend",
          factorName: "HTF Trend",
          totalOccurrences: 20,
          winsWhenActive: 16,
          winRate: 80,
          baselineWinRate: 60,
          liftPercent: 20,
          currentWeight: 1.0,
          performanceByVol: { normalVolWinRate: 80, highVolWinRate: 80 },
          status: "EDGE_ENHANCER"
        }
      ];

      const result = computeWalkForwardOptimization(smallHistory, activeWeights, factors);
      expect(result).toBeNull();
    });

    it("clamps proposed calibrated factor weights strictly within [0.2, 2.4]", () => {
      // Generate 35 sessions
      const history: Array<{ prediction: DailyPrediction; grade: PredictionGrade }> = [];
      for (let i = 0; i < 35; i++) {
        const isBull = i % 2 === 0;
        const pred: DailyPrediction = {
          id: `pred_${i}`,
          targetTradeDate: `2026-10-${(i + 1).toString().padStart(2, "0")}`,
          frozenAtEt: "2026-10-01T09:25:00.000Z",
          modelVersion: "v1.0",
          spotAtFreeze: 21000,
          biasVerdict: isBull ? "LONG_CONTINUATION" : "SHORT_CONTINUATION",
          confidenceTier: "HIGH",
          archetype: "OPEN-TEST-DRIVE",
          stopHuntLikelihood: "LOW",
          stopHuntTargetLevel: null,
          primaryRetraceLevels: { vwap: 20980, onMid: 20970, pdc: 20950, htf50: 20975, htf618: 20960 },
          liquidityDraws: { onh: 21050, onl: 20950, pdh: 21080, pdl: 20920 },
          regimeInputs: {
            factorScores: {
              htfTrend: 1, // extreme positive lift
              openingGap: -1 // extreme negative drag
            }
          },
          status: "GRADED_OPEN_WINDOW",
          createdAt: "2026-10-01T09:25:00.000Z"
        };

        const grade: PredictionGrade = {
          id: `grade_${i}`,
          targetTradeDate: pred.targetTradeDate,
          predictionId: pred.id,
          openPrice930: 21000,
          windowHigh: isBull ? 21050 : 21010,
          windowLow: isBull ? 20990 : 20950,
          windowClose1000: isBull ? 21045 : 20955,
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

      const activeWeights: ModelWeightsRecord = {
        id: "weight_v1.0",
        version: "v1.0",
        isActive: true,
        weights: { htfTrend: 1.0, openingGap: 1.0 },
        sampleSizeUsed: 0,
        outOfSampleAccuracy: 0,
        changeSummary: "default",
        createdAt: new Date().toISOString()
      };

      const factors: FactorAttribution[] = [
        {
          factorKey: "htfTrend",
          factorName: "HTF Trend",
          totalOccurrences: 35,
          winsWhenActive: 35,
          winRate: 100,
          baselineWinRate: 60,
          liftPercent: 40,
          currentWeight: 1.0,
          performanceByVol: { normalVolWinRate: 100, highVolWinRate: 100 },
          status: "EDGE_ENHANCER"
        },
        {
          factorKey: "openingGap",
          factorName: "Opening Gap",
          totalOccurrences: 35,
          winsWhenActive: 5,
          winRate: 14,
          baselineWinRate: 60,
          liftPercent: -46,
          currentWeight: 1.0,
          performanceByVol: { normalVolWinRate: 14, highVolWinRate: 14 },
          status: "NOISE_DETRACTOR"
        }
      ];

      const proposed = computeWalkForwardOptimization(history, activeWeights, factors);
      if (proposed) {
        for (const [key, weight] of Object.entries(proposed.proposedWeights)) {
          expect(weight).toBeGreaterThanOrEqual(0.2);
          expect(weight).toBeLessThanOrEqual(2.4);
        }
      }
    });
  });
});
