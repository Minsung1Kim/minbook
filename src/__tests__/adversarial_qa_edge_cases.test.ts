import { describe, it, expect } from "vitest";
import {
  evaluateLTFExecution,
  normalCdf,
  computeBrownianTouchProbability
} from "../lib/execution/ltfExecution";
import { computeDetailedRiskPlan } from "../lib/risk/sizing";
import { finalizeGEXData } from "../lib/market/gex";
import { computeBayesianFactorShrinkage, computeBayesianShrinkageOptimization } from "../lib/calibration/optimizer";
import { computePredictionGrade } from "../lib/calibration/grader";
import { OHLCVBar, SessionMetrics, PropProfile, KeyLevel } from "../types/market";
import { DailyPrediction, PredictionGrade } from "../types/calibration";

describe("Adversarial Quantitative QA: Stress Tests & Edge-Case Probes", () => {
  const defaultMetrics: SessionMetrics = {
    pdh: 21100,
    pdl: 20900,
    pdc: 21000,
    pdMid: 21000,
    onh: 21050,
    onl: 20950,
    onMid: 21000,
    overnightRange: 100,
    sessionVwap: 21000,
    globexVwap: 21000,
    priorDayRthVwap: 21000,
    atr14Daily: 250,
    atr15mIntraday: 35,
    atrOpen15m: 40,
    inventoryPercent: 50,
    htfImpulseDirection: "BULLISH"
  } as unknown as SessionMetrics;

  // =========================================================================
  // SUITE 1: Extreme 09:30 Volatility (120–150 pt ATR) & Quantization Traps
  // =========================================================================
  describe("1. Extreme 09:30 Volatility & Quantization Traps", () => {
    it("PROBE: 0-MNQ Quantization Trap under 0.5x defensive scaling ($125 risk budget)", () => {
      // In extreme 140 pt ATR_Open_15m, stop distance is wide (~70 pts).
      // Base risk $250 * 0.5x regime multiplier = $125 adjusted budget.
      // 1 MNQ risk = (70 pts + 0.75 pt slip) * $2 + $1.30 fee = $142.80 > $125.
      // Sizing correctly computes suggestedContracts = 0.
      const extremeAtr = 140.0;
      const m1Bars: OHLCVBar[] = [
        { timestamp: "2026-11-24T14:30:00.000Z", open: 21000, high: 21120, low: 20980, close: 21100, volume: 5000 },
        { timestamp: "2026-11-24T14:31:00.000Z", open: 21100, high: 21140, low: 21020, close: 21050, volume: 4500 },
        { timestamp: "2026-11-24T14:32:00.000Z", open: 21050, high: 21080, low: 20990, close: 21020, volume: 4000 },
        { timestamp: "2026-11-24T14:33:00.000Z", open: 21020, high: 21060, low: 21000, close: 21040, volume: 3800 },
        // 09:34 ET: price at 21030
        { timestamp: "2026-11-24T14:34:00.000Z", open: 21040, high: 21050, low: 21025, close: 21030, volume: 3000 }
      ];

      const propProfile: PropProfile = {
        id: "Topstep_EOD",
        firmName: "Topstep",
        accountName: "Topstep $50k",
        drawdownMode: "EOD_TRAILING",
        maxTrailingDrawdown: 2000,
        currentRemainingDrawdown: 2000,
        cycleProfitTarget: 3000,
        consistencyRulePercent: 40,
        mnqFeeRoundTrip: 1.30,
        nqFeeRoundTrip: 4.54,
        defaultSlippageTicks: 3,
        newsBlackoutMinutes: 0,
        prohibitOvernight: true
      };

      const card = evaluateLTFExecution({
        m1Bars,
        currentPrice: 21030,
        atrOpen15m: extremeAtr,
        metrics: { ...defaultMetrics, atrOpen15m: extremeAtr },
        propProfile,
        layer1: {
          vrpRatio: 0.85,
          isNegativeVrp: true,
          termRatio: 1.05,
          isBackwardation: true,
          isVolOfVolElevated: false,
          regimeRiskMultiplier: 0.5, // 0.5x defensive size cut
          macroNewsLockout: false,
          riskGatesSummary: "0.5x Defensive Size Cut"
        } as unknown as import("@/types/market").Layer1RiskGates,
        forcedTimeET: { hour: 9, minute: 35 }
      });

      // Verification: sizing correctly returns 0 contracts
      expect(card.contracts).toBe(0);

      // DEFECT CHECK: When contracts === 0, the engine should transition to STAND_ASIDE.
      // If card.status remains "ARMED_RETRACE", an automated trader or execution engine
      // faces a "phantom armed" trade card with 0 contracts.
      expect(card.status).toBe("STAND_ASIDE");
    });

    it("PROBE: 1-MNQ Quantization Trap & Grader Disconnect", () => {
      // Sizing 1 MNQ enforces single-lot TP1 all-out.
      const plan = computeDetailedRiskPlan({
        entryPrice: 21000,
        stopPrice: 20950, // 50 pts stop
        targetPrice: 21035, // 35 pts target
        instrument: "MNQ",
        baseRiskDollars: 125, // only fits 1 MNQ: (50 + 0.75)*2 + 1.30 = $102.80 <= $125
        regimeMultiplier: 1.0
      });

      expect(plan.suggestedContracts).toBe(1);
      expect(plan.contractSplitDirective).toContain("1 MNQ ALL-OUT AT TP1");

      // Now check computePredictionGrade in grader.ts:
      // When a trade is graded, grader.ts simulates execution.
      // But notice: grader.ts line 284 has a hardcoded initialContracts = 2!
      // If a trade reaches TP1 and then reverses to stop out the runner,
      // a 1-MNQ trade in reality exited 100% at TP1 (profitable).
      // But grader.ts simulates 2 contracts, letting Contract 2 take a loss!
      const pred: DailyPrediction = {
        id: "pred_1mnq",
        targetTradeDate: "2026-11-24",
        frozenAtEt: "2026-11-24T09:25:00.000Z",
        modelVersion: "v3.0",
        spotAtFreeze: 21000,
        biasVerdict: "LONG_CONTINUATION",
        confidenceTier: "HIGH",
        archetype: "OPEN-TEST-DRIVE",
        stopHuntLikelihood: "LOW",
        stopHuntTargetLevel: null,
        primaryRetraceLevels: { vwap: 20990, onMid: 20980, pdc: 20960, htf50: 20970, htf618: 20950 },
        liquidityDraws: { onh: 21060, onl: 20950, pdh: 21080, pdl: 20930 },
        regimeInputs: { factorScores: {} },
        status: "PENDING_GRADE",
        createdAt: "2026-11-24T09:25:00.000Z"
      };

      // Bars where price fills at 21011, hits TP1 at 21024, then flushes below SL (20996)
      const bars: OHLCVBar[] = [
        { timestamp: "2026-11-24T14:30:00.000Z", open: 21005, high: 21020, low: 21000, close: 21015, volume: 1500 },
        { timestamp: "2026-11-24T14:33:00.000Z", open: 21015, high: 21018, low: 21012, close: 21016, volume: 1200 },
        // 09:35 ET: fill at 21011
        { timestamp: "2026-11-24T14:35:00.000Z", open: 21016, high: 21017, low: 21010, close: 21012, volume: 2000 },
        // 09:37 ET: hits TP1 at 21025
        { timestamp: "2026-11-24T14:37:00.000Z", open: 21012, high: 21026, low: 21012, close: 21024, volume: 3000 },
        // 09:40 ET: violent plunge to 20980 (piercing stop loss 20996)
        { timestamp: "2026-11-24T14:40:00.000Z", open: 21020, high: 21020, low: 20980, close: 20985, volume: 5000 },
        { timestamp: "2026-11-24T15:00:00.000Z", open: 20985, high: 20995, low: 20980, close: 20990, volume: 1500 }
      ];

      const grade = computePredictionGrade(pred, bars, 25);
      // In grader.ts, Barrier 1 is checked at line 298.
      // When 09:40 bar plunges to 20980, grader triggers Barrier 1 (STOPPED_OUT)
      // even though TP1 was already hit!
      expect(grade).not.toBeNull();
      // Probe: Did grader record STOPPED_OUT despite TP1 having been hit earlier?
      expect(grade?.tripleBarrierOutcome).toBe("HIT_TP1");
    });
  });

  // =========================================================================
  // SUITE 2: Stale/Delayed Futures Timestamps Mixed with Live QQQ Quotes
  // =========================================================================
  describe("2. Stale Futures Timestamps Mixed with Live QQQ Quotes", () => {
    it("PROBE: finalizeGEXData with 15m timestamp lag locks to prior synchronous settlement basis", () => {
      const strikeMap = new Map();
      strikeMap.set(500, { strike: 500, callGex: 1000, putGex: -200, netGex: 800, callOi: 500, putOi: 100 });
      strikeMap.set(510, { strike: 510, callGex: 2000, putGex: -100, netGex: 1900, callOi: 800, putOi: 50 });

      const nqSpot = 21000;
      const qqqSpot = 500;
      // Corrupted asynchronous basis = 21000 / 500 = 42.00
      // True synchronous prior settlement basis = 41.25 (PDC NQ 20625 / PDC QQQ 500)
      const priorSyncBasis = 41.25;

      const tNqDelayed = "2026-11-24T14:15:00.000Z"; // 09:15 ET (15m delayed)
      const tQqqLive = "2026-11-24T14:30:00.000Z"; // 09:30 ET (live)

      const result = finalizeGEXData(
        strikeMap,
        qqqSpot,
        nqSpot,
        3000,
        -300,
        1500,
        "YF_QQQ_MODEL_BS",
        {
          nqTimestamp: tNqDelayed,
          underlyingTimestamp: tQqqLive,
          priorSynchronousSettlementBasis: priorSyncBasis
        }
      );

      // Verify basis sync status triggers LOCKED_TO_PRIOR_SETTLEMENT
      expect(result.basisSyncStatus).toBe("LOCKED_TO_PRIOR_SETTLEMENT");
      expect(result.basisTimestampDeltaSeconds).toBe(900); // 15m delta
      // Verify basisRatio is locked to priorSyncBasis (41.25), NOT 42.00
      expect(result.basisRatio).toBe(priorSyncBasis);
      // Call Wall at strike 510 * 41.25 = 21037.50 (NOT 510 * 42.00 = 21420.00)
      expect(result.callWallNq).toBe(510 * priorSyncBasis);
    });

    it("DEFECT PROBE: finalizeGEXData when priorSynchronousSettlementBasis is undefined under 15m lag", () => {
      const strikeMap = new Map();
      strikeMap.set(500, { strike: 500, callGex: 1000, putGex: -200, netGex: 800, callOi: 500, putOi: 100 });

      const nqSpot = 21000;
      const qqqSpot = 500;
      const tNqDelayed = "2026-11-24T14:15:00.000Z";
      const tQqqLive = "2026-11-24T14:30:00.000Z";

      // If priorSynchronousSettlementBasis is NOT provided:
      const result = finalizeGEXData(
        strikeMap,
        qqqSpot,
        nqSpot,
        1000,
        -200,
        800,
        "YF_QQQ_MODEL_BS",
        {
          nqTimestamp: tNqDelayed,
          underlyingTimestamp: tQqqLive
          // priorSynchronousSettlementBasis omitted!
        }
      );

      // In gex.ts line 305:
      // basisSyncStatus is set to "LOCKED_TO_PRIOR_SETTLEMENT"
      // BUT basisRatio is NOT updated! It retains nqSpot / underlyingSpot (42.00)!
      // The probe checks whether the basis was actually protected or corrupted:
      expect(result.basisSyncStatus).toBe("LOCKED_TO_PRIOR_SETTLEMENT");
      // If priorSynchronousSettlementBasis is undefined, basisRatio should NOT claim to be locked
      // if it's actually using the corrupted asynchronous ratio!
      expect(result.basisRatio).not.toBe(nqSpot / qqqSpot);
    });
  });

  // =========================================================================
  // SUITE 3: Intraday Unrealized Trailing Prop Profiles & Phantom Drawdown
  // =========================================================================
  describe("3. Intraday Unrealized Trailing Prop Profiles & Phantom Drawdown", () => {
    const intradayProfile: PropProfile = {
      id: "Apex_Intraday",
      firmName: "Apex Trader Funding",
      accountName: "Apex $50k Intraday Trailing",
      drawdownMode: "INTRADAY_UNREALIZED",
      maxTrailingDrawdown: 2500,
      currentRemainingDrawdown: 2500,
      cycleProfitTarget: 3000,
      consistencyRulePercent: 30,
      mnqFeeRoundTrip: 1.20,
      nqFeeRoundTrip: 4.20,
      defaultSlippageTicks: 3,
      newsBlackoutMinutes: 0,
      prohibitOvernight: true
    };

    it("caps target RR strictly at 1.8R and emits phantom drawdown warning", () => {
      const plan = computeDetailedRiskPlan({
        entryPrice: 21000,
        stopPrice: 20970, // 30 pts stop
        targetRR: 3.0, // Requested 3.0R
        instrument: "MNQ",
        propProfile: intradayProfile
      });

      expect(plan.rawRR).toBeLessThanOrEqual(1.8);
      expect(plan.phantomDrawdownWarning).toBeDefined();
      expect(plan.phantomDrawdownWarning).toContain("PHANTOM DRAWDOWN WARNING");
    });

    it("DEFECT PROBE: Contract split directive contradictory in INTRADAY_UNREALIZED mode", () => {
      // In sizing.ts line 162: "Breakeven runners prohibited; cap target at 1.3R–1.8R and bank profits."
      // BUT line 188 outputs: "PARTIALS ACTIVE: Scale out 1 MNQ at TP1, hold 1 MNQ runner toward TP2."
      // For intraday unrealized drawdown, holding a runner without an active trailing stop
      // induces catastrophic trailing phantom drawdown if the trade reaches +1.5R and returns to BE.
      const plan = computeDetailedRiskPlan({
        entryPrice: 21000,
        stopPrice: 20970,
        instrument: "MNQ",
        baseRiskDollars: 250, // fits 3 MNQ
        propProfile: intradayProfile
      });

      expect(plan.suggestedContracts).toBeGreaterThanOrEqual(2);
      // The directive should explicitly warn against letting runners return to breakeven:
      expect(plan.contractSplitDirective).not.toContain("hold 1 MNQ runner toward TP2");
    });

    it("DEFECT PROBE: 1m MSS kill-switch flattens runner at entry (0.0R) rather than locking profit", () => {
      // In ltfExecution.ts line 427:
      // killSwitchPrice is set to entryZone.mid (breakeven).
      // If a trade reached +1.5R MFE and reverses back to entryZone.mid,
      // flattening at entryZone.mid results in 0 profit on the runner,
      // while the firm's trailing threshold ratcheted by +1.5R!
      const m1Bars: OHLCVBar[] = [
        { timestamp: "2026-11-24T14:30:00.000Z", open: 21000, high: 21020, low: 21000, close: 21015, volume: 1500 },
        { timestamp: "2026-11-24T14:33:00.000Z", open: 21015, high: 21018, low: 21012, close: 21016, volume: 1200 },
        { timestamp: "2026-11-24T14:35:00.000Z", open: 21016, high: 21017, low: 21010, close: 21012, volume: 2000 }
      ];

      const card = evaluateLTFExecution({
        m1Bars,
        currentPrice: 21012,
        atrOpen15m: 30,
        metrics: defaultMetrics,
        propProfile: intradayProfile,
        forcedTimeET: { hour: 9, minute: 36 }
      });

      // Under INTRADAY_UNREALIZED, the kill switch should protect unrealized profit,
      // not allow the runner to degrade all the way back to entry price!
      expect(card.killSwitchPrice).not.toBe(card.entryZone.mid);
    });
  });

  // =========================================================================
  // SUITE 4: Pure 50/50 Random Noise Over 30–60 Sessions (Bayesian Shrinkage)
  // =========================================================================
  describe("4. Pure 50/50 Random Noise & Bayesian Shrinkage Robustness", () => {
    it("keeps Bayesian factor weights tightly shrunk near 1.00 under pure 50/50 noise", () => {
      // Generate 60 synthetic sessions with independent Bernoulli(0.5) outcomes
      const history: Array<{ prediction: DailyPrediction; grade: PredictionGrade }> = [];
      // Deterministic alternating sequence: 30 wins, 30 losses (exactly 50.0% win rate)
      for (let i = 0; i < 60; i++) {
        const isWin = i % 2 === 0;
        const pred: DailyPrediction = {
          id: `pred_${i}`,
          targetTradeDate: `2026-09-${(i + 1).toString().padStart(2, "0")}`,
          frozenAtEt: "2026-09-01T09:25:00.000Z",
          modelVersion: "v3.0",
          spotAtFreeze: 21000,
          biasVerdict: "LONG_CONTINUATION",
          confidenceTier: "HIGH",
          archetype: "OPEN-TEST-DRIVE",
          stopHuntLikelihood: "LOW",
          stopHuntTargetLevel: null,
          primaryRetraceLevels: { vwap: 20990, onMid: 20980, pdc: 20960, htf50: 20970, htf618: 20950 },
          liquidityDraws: { onh: 21060, onl: 20950, pdh: 21080, pdl: 20930 },
          regimeInputs: {
            factorScores: { compositeHtf: 1, smtBreadth: 1, macroImpulse: 1, openingFlow: 1 }
          },
          status: "GRADED_OPEN_WINDOW",
          createdAt: "2026-09-01T09:25:00.000Z"
        };
        const grade: PredictionGrade = {
          id: `grade_${i}`,
          targetTradeDate: pred.targetTradeDate,
          predictionId: pred.id,
          openPrice930: 21000,
          windowHigh: isWin ? 21050 : 21010,
          windowLow: isWin ? 20990 : 20950,
          windowClose1000: isWin ? 21045 : 20955,
          biasCorrect: isWin,
          favorableExcursionPts: isWin ? 45 : 10,
          adverseExcursionPts: isWin ? 10 : 45,
          retraceTapped: ["VWAP"],
          stopHuntOccurred: false,
          liquidityDrawHit: ["ONH"],
          chopWarningCorrect: false,
          brierScore: isWin ? 0.04 : 0.64,
          compositeScore: isWin ? 85 : 25,
          gradedAt: "2026-09-01T10:20:00.000Z"
        };
        history.push({ prediction: pred, grade });
      }

      const shrinkage = computeBayesianFactorShrinkage(history, 1.0, 25, 25);
      for (const [key, res] of Object.entries(shrinkage)) {
        // With 30 wins out of 60:
        // Posterior mean = (30 + 25) / (60 + 50) = 55 / 110 = 0.500
        // Bayesian weight = 2.0 * 0.500 = 1.00
        expect(res.shrunkWinRate).toBe(50);
        expect(res.bayesianWeight).toBe(1.0);
        expect(res.clippedWeight).toBe(1.0);
      }
    });

    it("verifies Bayesian shrinkage prevents overreacting to small-sample winning streaks", () => {
      // 30 sessions with 70% win rate (21 wins, 9 losses)
      const history: Array<{ prediction: DailyPrediction; grade: PredictionGrade }> = [];
      for (let i = 0; i < 30; i++) {
        const isWin = i < 21;
        const pred: DailyPrediction = {
          id: `pred_${i}`,
          targetTradeDate: `2026-09-${(i + 1).toString().padStart(2, "0")}`,
          frozenAtEt: "2026-09-01T09:25:00.000Z",
          modelVersion: "v3.0",
          spotAtFreeze: 21000,
          biasVerdict: "LONG_CONTINUATION",
          confidenceTier: "HIGH",
          archetype: "OPEN-TEST-DRIVE",
          stopHuntLikelihood: "LOW",
          stopHuntTargetLevel: null,
          primaryRetraceLevels: { vwap: 20990, onMid: 20980, pdc: 20960, htf50: 20970, htf618: 20950 },
          liquidityDraws: { onh: 21060, onl: 20950, pdh: 21080, pdl: 20930 },
          regimeInputs: { factorScores: { compositeHtf: 1 } },
          status: "GRADED_OPEN_WINDOW",
          createdAt: "2026-09-01T09:25:00.000Z"
        };
        const grade: PredictionGrade = {
          id: `grade_${i}`,
          targetTradeDate: pred.targetTradeDate,
          predictionId: pred.id,
          openPrice930: 21000,
          windowHigh: isWin ? 21050 : 21010,
          windowLow: isWin ? 20990 : 20950,
          windowClose1000: isWin ? 21045 : 20955,
          biasCorrect: isWin,
          favorableExcursionPts: isWin ? 45 : 10,
          adverseExcursionPts: isWin ? 10 : 45,
          retraceTapped: ["VWAP"],
          stopHuntOccurred: false,
          liquidityDrawHit: ["ONH"],
          chopWarningCorrect: false,
          brierScore: isWin ? 0.04 : 0.64,
          compositeScore: isWin ? 85 : 25,
          gradedAt: "2026-09-01T10:20:00.000Z"
        };
        history.push({ prediction: pred, grade });
      }

      // Raw win rate is 70% (21/30). Without shrinkage, weight would jump to 1.40.
      // With Bayesian prior alpha0=25, beta0=25:
      // Posterior mean = (21 + 25) / (30 + 50) = 46 / 80 = 57.5%
      // Weight = 2.0 * 0.575 = 1.15.
      const shrinkage = computeBayesianFactorShrinkage(history, 1.0, 25, 25);
      const res = shrinkage["compositeHtf"];
      expect(res.rawWinRate).toBe(70);
      expect(res.shrunkWinRate).toBe(57.5);
      expect(res.clippedWeight).toBe(1.15);
      // Confirms weight is shrunk substantially below the raw 1.40
      expect(res.clippedWeight).toBeLessThan(1.20);
    });
  });

  // =========================================================================
  // SUITE 5: High-Vol 1m Candle Sequences & HTF Target Leakage
  // =========================================================================
  describe("5. High-Vol 1m Candle Sequences & HTF Target Leakage", () => {
    it("PROBE: High-vol 1m candle where TP and SL sit inside the same bar", () => {
      const pred: DailyPrediction = {
        id: "pred_same_bar",
        targetTradeDate: "2026-11-24",
        frozenAtEt: "2026-11-24T09:25:00.000Z",
        modelVersion: "v3.0",
        spotAtFreeze: 21000,
        biasVerdict: "LONG_CONTINUATION",
        confidenceTier: "HIGH",
        archetype: "OPEN-TEST-DRIVE",
        stopHuntLikelihood: "LOW",
        stopHuntTargetLevel: null,
        primaryRetraceLevels: { vwap: 20990, onMid: 20980, pdc: 20960, htf50: 20970, htf618: 20950 },
        liquidityDraws: { onh: 21060, onl: 20950, pdh: 21080, pdl: 20930 },
        regimeInputs: { factorScores: {} },
        status: "PENDING_GRADE",
        createdAt: "2026-11-24T09:25:00.000Z"
      };

      // 09:30-09:33 OR: High 21020, Low 21000 -> entry 21011, SL 20996.25, TP1 21023, TP2 21033
      // Bar at 09:35 is an extreme 70-point expansion candle:
      // Open 21012, High 21045 (above TP2), Low 20985 (below SL), Close 21040
      const bars: OHLCVBar[] = [
        { timestamp: "2026-11-24T14:30:00.000Z", open: 21005, high: 21020, low: 21000, close: 21015, volume: 1500 },
        { timestamp: "2026-11-24T14:33:00.000Z", open: 21015, high: 21018, low: 21012, close: 21016, volume: 1200 },
        // 09:35 ET: Extreme bar penetrates BOTH Stop Loss (20985 <= 20996.25) AND TP2 (21045 >= 21033)
        { timestamp: "2026-11-24T14:35:00.000Z", open: 21012, high: 21045, low: 20985, close: 21040, volume: 8000 },
        { timestamp: "2026-11-24T15:00:00.000Z", open: 21040, high: 21045, low: 21035, close: 21040, volume: 1500 }
      ];

      const grade = computePredictionGrade(pred, bars, 25);
      expect(grade).not.toBeNull();
      // In grader.ts, Barrier 1 (Stop Loss) is checked before Barrier 2.
      // Therefore, the grader conservatively assumes STOPPED_OUT when both are breached.
      expect(grade?.tripleBarrierOutcome).toBe("STOPPED_OUT");
      expect(grade?.biasCorrect).toBe(false);
    });

    it("DEFECT PROBE: Distant HTF level (> 0.75 * ATR_Open_15m from entry) leaks into TP2 due to currentPrice anchoring", () => {
      // In this scenario:
      // safeAtrOpen15m = 40.0 pts.
      // 0.75 * ATR_Open_15m = 30.0 pts.
      // Direction = LONG.
      // 09:30-09:33 OR: High 21020, Low 21000.
      // Retrace entry zone = 21020 - 0.45 * 20 = 21011.
      // An HTF level sits at 21047:
      // Distance from entry zone (21011) = 21047 - 21011 = 36 pts (> 30 pts, i.e. 0.90x ATR!).
      // It MUST be demoted to HTF Context Only.
      //
      // BUT at 09:35 ET, currentPrice is at 21025 (price bounced prior to retracing).
      // Distance from currentPrice (21025) = 21047 - 21025 = 22 pts (<= 30 pts, i.e. 0.55x ATR!).
      //
      // Because ltfExecution.ts line 330 anchors entryRefPrice = currentPrice:
      // The distant level at 21047 leaks into TP2!
      const atrOpen15m = 40.0;
      const m1Bars: OHLCVBar[] = [
        { timestamp: "2026-11-24T14:30:00.000Z", open: 21005, high: 21020, low: 21000, close: 21015, volume: 1500 },
        { timestamp: "2026-11-24T14:33:00.000Z", open: 21015, high: 21020, low: 21012, close: 21018, volume: 1200 },
        { timestamp: "2026-11-24T14:35:00.000Z", open: 21018, high: 21026, low: 21018, close: 21025, volume: 2000 }
      ];

      const distantHtfLevel: KeyLevel = {
        name: "Prior Day High",
        shortName: "PDH",
        price: 21047, // 36 pts from entry 21011 (> 0.75 * 40 = 30 pts)
        significance: "HIGH",
        proximityScore: 80,
        hitProbability: 30,
        timeframe: "DAILY",
        description: "Distant PDH"
      } as unknown as KeyLevel;

      const card = evaluateLTFExecution({
        m1Bars,
        currentPrice: 21025,
        atrOpen15m,
        metrics: { ...defaultMetrics, atrOpen15m, htfImpulseDirection: "BULLISH" },
        keyLevels: [distantHtfLevel],
        forcedTimeET: { hour: 9, minute: 35 }
      });

      // Verification: The distance from actual entry zone (mid) to TP2 must NOT exceed 0.75 * ATR_Open_15m (30 pts)
      const distFromEntryToTP2 = Math.abs(card.tp2.price - card.entryZone.mid);

      // DEFECT CHECK: If tp2.price is 21047, then distFromEntryToTP2 is 36 pts (> 30 pts).
      // The test fails if the distant HTF level leaked into TP2!
      expect(distFromEntryToTP2).toBeLessThanOrEqual(0.75 * atrOpen15m);
    });
  });
});
