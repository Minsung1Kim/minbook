import { describe, it, expect } from "vitest";
import { finalizeGEXData } from "../lib/market/gex";
import { evaluateLayer1RiskGates } from "../lib/market/riskGates";
import { evaluateLayer2DirectionalScore } from "../lib/market/directionalScore";
import { generateTacticalPlaybook } from "../lib/market/playbook";
import { evaluateBiasAndRegime } from "../lib/market/regime";
import {
  findPriorDay1600Settlement,
  computeAtrOpen15m,
  computePriorDayVolumeProfile,
  computeSessionLevels
} from "../lib/market/levels";
import { computeExpectedMove, computeDimensionlessVRP } from "../lib/market/math";
import { computeLevelVitality } from "../components/KeyLevelsTable";
import {
  SessionMetrics,
  BiasRegime,
  OHLCVBar,
  VolatilitySurface,
  GEXExposureData
} from "../types/market";

describe("Sprint 1 Quantitative & Engineering Invariants", () => {
  // Baseline Mock Metrics
  const mockMetrics: SessionMetrics = {
    pdc: 21100,
    pdh: 21200,
    pdl: 21000,
    pdMid: 21100,
    onh: 21150,
    onl: 21050,
    onMid: 21100,
    sessionVwap: 21100,
    globexVwap: 21100,
    priorDayRthVwap: 21100,
    rthSessionVwap: 21100,
    inventoryPercent: 50,
    openingLocation: "AROUND_EQUILIBRIUM",
    openingGap: 0,
    overnightInventory: "BALANCED",
    expectedMove1SD: 219.84,
    expectedMoveStraddle: 175.41,
    upper1SD: 21319.84,
    lower1SD: 20880.16,
    upperStraddle: 21275.41,
    lowerStraddle: 20924.59,
    straddleCoveragePercent: 57.5,
    coverageLabel: "~57.5% Normal Coverage (0.7979 SD)",
    atr14Daily: 160,
    atr15mIntraday: 25,
    atrOpen15m: 32,
    overnightRange: 100,
    overnightRangeConsumedPercent: 30,
    htfImpulseDirection: "BEARISH",
    htfImpulseHigh: 21300,
    htfImpulseLow: 20900,
    htf50Retrace: 21100,
    htf618Retrace: 21150,
    htf705Retrace: 21180,
    vwapCalculationMode: "VOLUME_WEIGHTED"
  };

  describe("Invariant 1: Two-Layer Architecture & Contango Bearish Regression", () => {
    it("proves calm Contango volatility state does NOT downgrade or neutralize a bearish directional score", () => {
      // Setup a calm Contango volatility surface
      const contangoSurface: VolatilitySurface = {
        vxn: 18.5,
        vix: 15.2,
        vix3m: 17.5,
        vix9d: 14.8,
        vix1d: 14.2,
        vvix: 88,
        termRatio: 0.87, // VIX / VIX3M < 1.0 (Contango)
        termStructureRegime: "CONTANGO (NORMAL)",
        shortTermShockRatio: 0.95,
        isShortTermShock: false,
        vvixRegime: "NORMAL (<100)",
        isNegativeVrp: false,
        vrpRatio: 1.25,
        realizedVolYZ20d: 14.8,
        realizedVolYZ10d: 14.5,
        realizedVolGK: 15.0,
        vrp: 3.7
      };

      // Market is trading below PDC and below VWAP in a bearish HTF trend
      const currentPrice = 21020; // below PDC 21100, below VWAP 21100, below ON Mid 21100

      // In MinBook v2.0, Factor 6 added +1 for Contango to directional score,
      // shifting a -3 score up to -2, and on mild days turning a bearish setup into neutral!
      // In MinBook v3.0:
      // Layer 1 handles Volatility: Contango means 1.0x size, no veto, allowTrading = true
      const layer1 = evaluateLayer1RiskGates({
        currentPrice,
        metrics: mockMetrics,
        volatilitySurface: contangoSurface
      });

      expect(layer1.allowTrading).toBe(true);
      expect(layer1.sizeMultiplier).toBe(1.0);
      expect(layer1.reversalVetoActive).toBe(false);

      // Layer 2 handles Directional signals: completely decoupled from Contango
      const layer2 = evaluateLayer2DirectionalScore({
        currentPrice,
        metrics: mockMetrics,
        htfTrend: "BEARISH"
      });

      // Direction MUST remain strictly BEARISH
      expect(layer2.direction).toBe("BEARISH");
      expect(layer2.totalScore).toBeLessThan(0);
      expect(layer2.signals.find((s) => s.id === "compositeLocation")?.score).toBe(-1);

      // Verify full Tactical Plan inherits pure bearish direction without Contango pollution
      const biasRegime: BiasRegime = {
        verdict: "CONTINUATION FAVORED (BEARISH)",
        confidence: "HIGH",
        htfTrend: "BEARISH",
        chopRisk: "LOW",
        regimeRiskMultiplier: 1.0,
        summary: "Clean bearish continuation.",
        drivers: [],
        risks: [],
        volatilitySurface: contangoSurface,
        layer1RiskGates: layer1,
        idealRetraceZone: {
          startPrice: 21080,
          endPrice: 21100,
          description: "Equilibrium retrace"
        }
      };

      const plan = generateTacticalPlaybook(currentPrice, mockMetrics, biasRegime);
      expect(plan.trader5Answers.biasDirection).toBe("BEARISH CONTINUATION");
      expect(plan.layer1RiskGates?.sizeMultiplier).toBe(1.0);
      expect(plan.layer2DirectionalScore?.direction).toBe("BEARISH");
    });

    it("triggers Overnight Inventory Reversal Veto and caps bullish location score when longs are trapped below ON Mid", () => {
      // 85% of overnight bars were above PDC, but price is trading below ON Mid
      const trappedLongMetrics: SessionMetrics = {
        ...mockMetrics,
        inventoryPercent: 85,
        onMid: 21150
      };
      const currentPrice = 21110; // below ON Mid (trapped longs)

      const layer1 = evaluateLayer1RiskGates({
        currentPrice,
        metrics: trappedLongMetrics
      });

      expect(layer1.reversalVetoActive).toBe(true);
      expect(layer1.sizeMultiplier).toBe(0.5); // Risk scaled down
      expect(layer1.reversalVetoReason).toContain("Trapped overnight longs offside");

      const layer2 = evaluateLayer2DirectionalScore({
        currentPrice,
        metrics: trappedLongMetrics,
        htfTrend: "BULLISH", // HTF was bullish
        reversalVetoActive: layer1.reversalVetoActive
      });

      // Long score must be suppressed to <= 0 due to trapped inventory flush risk
      const locSignal = layer2.signals.find((s) => s.id === "compositeLocation");
      expect(locSignal?.score).toBeLessThanOrEqual(0);

      const regime = evaluateBiasAndRegime(currentPrice, trappedLongMetrics);
      expect(regime.verdict).toBe("CAUTION / CHOP RISK");
    });
  });

  describe("Invariant 2: Synchronized CME Clocks & Basis Locking", () => {
    it("locks NQ/QQQ options basis to prior settlement when timestamp delta > 60s, preventing 100+ pt option wall shifts", () => {
      // Scenario A: 15-minute delayed NQ quote (e.g. 09:30 AM ET vs 09:45 AM live QQQ)
      const liveQQQTimestamp = 1795531500000; // 09:45:00
      const delayedNQTimestamp = 1795530600000; // 09:30:00 (900 seconds delta > 60s)

      const priorSettlementBasis = 41.35; // e.g. 21,088.50 / 510.0
      const staleNqPrice = 21000.0;

      const strikeMap = new Map();
      strikeMap.set(500, { callGex: 10000000, putGex: -50000000, netGex: -40000000, callOi: 1000, putOi: 5000 });
      strikeMap.set(515, { callGex: 80000000, putGex: -10000000, netGex: 70000000, callOi: 8000, putOi: 1000 });

      const gexData = finalizeGEXData(
        strikeMap,
        510.0,
        staleNqPrice,
        90000000,
        -60000000,
        30000000,
        "YF_QQQ_MODEL_BS",
        {
          nqTimestamp: delayedNQTimestamp,
          underlyingTimestamp: liveQQQTimestamp,
          priorSynchronousSettlementBasis: priorSettlementBasis
        }
      );

      // Verify basis was locked to prior settlement rather than contaminated by delayed ratio
      expect(gexData.basisSyncStatus).toBe("LOCKED_TO_PRIOR_SETTLEMENT");
      expect(gexData.basisTimestampDeltaSeconds).toBe(900);
      expect(gexData.basisRatio).toBe(priorSettlementBasis);
      expect(gexData.callWallNq).toBe(Math.round(515.0 * priorSettlementBasis * 100) / 100);
    });

    it("strictly anchors Prior Day Close (PDC) to 16:00 ET settlement close from intraday bars", () => {
      const intradayBars: OHLCVBar[] = [
        // 15:59 ET bar
        { timestamp: "2026-11-23T20:59:00Z", open: 21100, high: 21110, low: 21095, close: 21105, volume: 5000 },
        // 16:00 ET official CME settlement bar
        { timestamp: "2026-11-23T21:00:00Z", open: 21105, high: 21120, low: 21100, close: 21115, volume: 8000 },
        // 16:59 ET Globex last trade bar (not official settlement!)
        { timestamp: "2026-11-23T21:59:00Z", open: 21080, high: 21090, low: 21075, close: 21085, volume: 1500 }
      ];

      const settlement = findPriorDay1600Settlement(intradayBars, "2026-11-23");
      expect(settlement).toBeDefined();
      expect(settlement?.settlementPrice).toBe(21115); // 16:00 ET settlement close
      expect(settlement?.isOfficial1600).toBe(true);

      const dailyBars: OHLCVBar[] = [
        { timestamp: "2026-11-23", open: 21000, high: 21200, low: 21000, close: 21100, volume: 100000 }
      ];

      const computed = computeSessionLevels(
        21100,
        dailyBars,
        intradayBars,
        20.0,
        undefined,
        "2026-11-24"
      );

      expect(computed.sessionMetrics.pdc).toBe(21115);
      expect(computed.sessionMetrics.pdcSource).toBe("CME_1600_SETTLEMENT");
    });
  });

  describe("Invariant 3: Volatility & Diurnal Scaling", () => {
    it("computes expected move dividing by sqrt(252)", () => {
      const pdc = 21000;
      const iv = 20.0;
      const em = computeExpectedMove(pdc, iv);

      // sqrt(252) = 15.87451
      // 21000 * 0.20 / 15.87451 ≈ 264.58 pts
      expect(em.annualizationDays).toBe(252);
      expect(em.expectedMove1SD).toBeCloseTo(264.58, 1);

      // Straddle move is 1SD * sqrt(2/pi) ≈ 211.10 pts
      expect(em.expectedMoveStraddle).toBeCloseTo(211.10, 1);
      expect(em.straddleCoveragePercent).toBe(57.5);
    });

    it("computes diurnally matched ATR_Open_15m using median range of 09:30–09:45 ET bars", () => {
      // 5 sessions of 15m bars
      const bars15m: OHLCVBar[] = [
        // Session 1 (2026-11-17): 09:30 ET bar has range 30 pts; 03:00 ET overnight bar has range 10 pts
        { timestamp: "2026-11-17T08:00:00Z", open: 21000, high: 21010, low: 21000, close: 21005, volume: 200 },
        { timestamp: "2026-11-17T14:30:00Z", open: 21000, high: 21030, low: 21000, close: 21025, volume: 5000 }, // range 30
        // Session 2 (2026-11-18): 09:30 ET bar has range 40 pts
        { timestamp: "2026-11-18T14:30:00Z", open: 21020, high: 21060, low: 21020, close: 21050, volume: 6000 }, // range 40
        // Session 3 (2026-11-19): 09:30 ET bar has range 35 pts
        { timestamp: "2026-11-19T14:30:00Z", open: 21050, high: 21085, low: 21050, close: 21070, volume: 5500 }  // range 35
      ];

      // Median of [30, 35, 40] is 35 pts
      const atrOpen15m = computeAtrOpen15m(bars15m, "2026-11-20", 3);
      expect(atrOpen15m).toBe(35);
    });

    it("computes Variance Risk Premium as a dimensionless ratio (IV / RV)", () => {
      const normal = computeDimensionlessVRP(22.0, 18.0);
      expect(normal.vrpRatio).toBeCloseTo(1.22, 2);
      expect(normal.isNegativeVrp).toBe(false);

      const negativeVrp = computeDimensionlessVRP(15.0, 20.0);
      expect(negativeVrp.vrpRatio).toBeCloseTo(0.75, 2);
      expect(negativeVrp.isNegativeVrp).toBe(true);
    });
  });

  describe("Invariant 4: Structural Levels & Footprint Honesty", () => {
    it("demotes 5-day HTF Fibonacci structural weight strictly below PDH/PDL and Prior Day Volume Profile", () => {
      const fibVitality = computeLevelVitality(
        { id: "htf-618", name: "HTF 61.8%", shortName: "HTF 61.8", price: 21150, role: "RETRACE ZONE", distancePoints: 50, distancePercent: 0.24, timeframe: "HTF", note: "" },
        21100
      );
      const pdhVitality = computeLevelVitality(
        { id: "lvl-pdh", name: "Prior Day High", shortName: "PDH", price: 21200, role: "LIQUIDITY POOL", distancePoints: 100, distancePercent: 0.47, timeframe: "DAILY", note: "" },
        21100
      );
      const pocVitality = computeLevelVitality(
        { id: "lvl-prior-poc", name: "Prior Day POC", shortName: "Prior POC", price: 21100, role: "EQUILIBRIUM", distancePoints: 0, distancePercent: 0, timeframe: "DAILY", note: "" },
        21100
      );

      // Fib structural weight (60) must be lower than PDH (80) and POC (82)
      expect(fibVitality.structuralWeight).toBe(60);
      expect(pdhVitality.structuralWeight).toBe(80);
      expect(pocVitality.structuralWeight).toBe(82);

      expect(fibVitality.structuralWeight).toBeLessThan(pdhVitality.structuralWeight);
      expect(fibVitality.structuralWeight).toBeLessThan(pocVitality.structuralWeight);
    });

    it("computes Prior Day Volume Profile (VAH, POC, VAL) from intraday bars", () => {
      // Intraday bars with heavy volume centered around 21050
      const intradayBars: OHLCVBar[] = [
        { timestamp: "2026-11-23T15:00:00Z", open: 21000, high: 21030, low: 21000, close: 21020, volume: 1000 },
        { timestamp: "2026-11-23T15:30:00Z", open: 21040, high: 21060, low: 21040, close: 21050, volume: 10000 }, // Heavy POC
        { timestamp: "2026-11-23T16:00:00Z", open: 21070, high: 21100, low: 21070, close: 21090, volume: 1500 }
      ];

      const vp = computePriorDayVolumeProfile(intradayBars, "2026-11-23");
      expect(vp).toBeDefined();
      expect(vp?.poc).toBe(21050);
      expect(vp?.vah).toBeGreaterThanOrEqual(vp?.poc!);
      expect(vp?.val).toBeLessThanOrEqual(vp?.poc!);
    });
  });
});
