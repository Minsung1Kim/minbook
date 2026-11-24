import { describe, it, expect } from "vitest";
import {
  evaluateLTFExecution,
  computeBrownianTouchProbability,
  normalCdf
} from "../lib/execution/ltfExecution";
import { computeDetailedRiskPlan } from "../lib/risk/sizing";
import { PROP_PRESETS } from "../lib/risk/propProfile";
import { checkTier1NewsBlackout } from "../lib/market/economicCalendar";
import {
  OHLCVBar,
  SessionMetrics,
  KeyLevel,
  EconomicEvent,
  Layer1RiskGates,
  Layer2DirectionalScore
} from "../types/market";

describe("Sprint 2: Lower-Timeframe (1m) Trade Card & Prop-Firm Risk Engine", () => {
  const atrOpen15m = 105.0; // 105 pts ATR_Open_15m

  const mockMetrics: SessionMetrics = {
    pdc: 26400.0,
    pdh: 26550.0,
    pdl: 26200.0,
    pdMid: 26375.0,
    onh: 26430.0,
    onl: 26300.0,
    onMid: 26365.0,
    sessionVwap: 26360.0,
    globexVwap: 26360.0,
    priorDayRthVwap: 26360.0,
    rthSessionVwap: 26360.0,
    inventoryPercent: 45,
    openingLocation: "AROUND_EQUILIBRIUM",
    openingGap: 0,
    overnightInventory: "BALANCED",
    expectedMove1SD: 219.84,
    expectedMoveStraddle: 175.41,
    upper1SD: 26619.84,
    lower1SD: 26180.16,
    upperStraddle: 26575.41,
    lowerStraddle: 26224.59,
    atr14Daily: 160,
    atr15mIntraday: 35,
    atrOpen15m: 105.0,
    overnightRange: 130,
    overnightRangeConsumedPercent: 40,
    htfImpulseDirection: "BEARISH",
    htfImpulseHigh: 26600,
    htfImpulseLow: 26200,
    htf50Retrace: 26400,
    htf618Retrace: 26450,
    htf705Retrace: 26480,
    vwapCalculationMode: "VOLUME_WEIGHTED"
  };

  const layer1: Layer1RiskGates = {
    allowTrading: true,
    sizeMultiplier: 1.0,
    targetCapMultipleR: 2.2,
    reversalVetoActive: false,
    activeVetoes: [],
    gateDetails: [],
    volatilityState: {
      vrpRatio: 1.25,
      isNegativeVrp: false,
      termRatio: 0.88,
      vvix: 88,
      termStructureRegime: "CONTANGO (NORMAL)"
    }
  };

  const layer2: Layer2DirectionalScore = {
    signals: [],
    totalScore: -2.0,
    direction: "BEARISH",
    verdict: "CONTINUATION FAVORED (BEARISH)",
    confidence: "HIGH",
    summary: "Bearish continuation favored."
  };

  // November 24, 2026 Opening Fixture
  // 09:30: Open 26362.50, High 26417.00, Low 26338.50, Close 26355.00
  // 09:31 Flush: Open 26355.00, High 26358.00, Low 26265.00, Close 26270.00
  // 09:32: Open 26270.00, High 26285.00, Low 26260.00, Close 26280.00
  // 09:33: Open 26280.00, High 26295.00, Low 26268.00, Close 26290.00
  // 09:34–09:36 Retrace into 40%-50% zone [26322.8, 26338.5]
  // 09:39 Sweep of ORL (26260) with Low 26245
  // 09:40 Bullish MSS displacement candle Close 26278
  const baseOpeningBars: OHLCVBar[] = [
    { timestamp: "2026-11-24T14:30:00Z", open: 26362.50, high: 26417.00, low: 26338.50, close: 26355.00, volume: 8500 },
    { timestamp: "2026-11-24T14:31:00Z", open: 26355.00, high: 26358.00, low: 26265.00, close: 26270.00, volume: 12000 },
    { timestamp: "2026-11-24T14:32:00Z", open: 26270.00, high: 26285.00, low: 26260.00, close: 26280.00, volume: 6000 },
    { timestamp: "2026-11-24T14:33:00Z", open: 26280.00, high: 26295.00, low: 26268.00, close: 26290.00, volume: 5000 }
  ];

  describe("Fixture 1: 09:30–09:33 ET Observation Lock & Anti-Chase Gate", () => {
    it("enforces observation lock and tracks ORH_3m (26417.00) / ORL_3m (26260.00) during 09:30–09:33 ET", () => {
      const card = evaluateLTFExecution({
        m1Bars: baseOpeningBars,
        currentPrice: 26290.00,
        atrOpen15m,
        metrics: mockMetrics,
        layer1,
        layer2,
        forcedTimeET: { hour: 9, minute: 33 }
      });

      expect(card.status).toBe("OBSERVATION_LOCK");
      expect(card.archetype).toBe("OBSERVATION_FREEZE");
      expect(card.orh3m).toBe(26417.00);
      expect(card.orl3m).toBe(26260.00);
      expect(card.initialImpulseRange).toBe(157.00); // 26417 - 26260
      expect(card.killSwitchMessage).toContain("HANDS OFF MOUSE");
    });

    it("triggers Anti-Chase Gate when chasing the 09:31 flush close (26270.00)", () => {
      // At 09:34, price is sitting down at 26270.00 while stop is at swing high 26420+ (> 145 pts away)
      // Chase threshold = 0.35 * ATR_Open_15m = 0.35 * 105 = 36.75 pts
      const card = evaluateLTFExecution({
        m1Bars: baseOpeningBars,
        currentPrice: 26270.00, // Chasing at the low of the 09:31 flush!
        atrOpen15m,
        metrics: mockMetrics,
        layer1,
        layer2,
        forcedTimeET: { hour: 9, minute: 34 }
      });

      expect(card.antiChaseWarning).toBe(true);
      expect(card.status).toBe("STAND_ASIDE");
      expect(card.antiChaseMessage).toContain("ANTI-CHASE GATE TRIGGERED");
      expect(card.antiChaseMessage).toContain("DO NOT chase market orders");
      // Output must provide limit retrace zone instead of market chase
      expect(card.entryZone.low).toBeGreaterThan(26270.00);
      expect(card.entryZone.high).toBeLessThan(26417.00);
    });
  });

  describe("Fixture 2: 09:34–09:36 Retrace Short Execution & Reachability Target Engine", () => {
    // Add 09:34–09:36 retrace bars into the 40%-50% zone
    const retraceBars: OHLCVBar[] = [
      ...baseOpeningBars,
      { timestamp: "2026-11-24T14:34:00Z", open: 26290.00, high: 26335.00, low: 26288.00, close: 26330.00, volume: 4500 },
      { timestamp: "2026-11-24T14:35:00Z", open: 26330.00, high: 26340.00, low: 26322.00, close: 26335.00, volume: 3800 },
      { timestamp: "2026-11-24T14:36:00Z", open: 26335.00, high: 26338.00, low: 26315.00, close: 26320.00, volume: 4100 }
    ];

    const mockKeyLevels: KeyLevel[] = [
      { id: "lvl-orl", name: "ORL 3m", shortName: "ORL", price: 26288.00, role: "TARGET", distancePoints: 42.0, distancePercent: 0.16, timeframe: "INTRADAY", note: "" },
      { id: "lvl-sweep-pool", name: "Opening Liquidity Pool", shortName: "Sweep Pool", price: 26262.00, role: "TARGET", distancePoints: 68.0, distancePercent: 0.26, timeframe: "INTRADAY", note: "" },
      { id: "lvl-htf-magnet", name: "Distant Prior Day Low", shortName: "Distant PDL", price: 26180.00, role: "LIQUIDITY POOL", distancePoints: 150.0, distancePercent: 0.57, timeframe: "DAILY", note: "" }
    ];

    it("generates retrace continuation card, sizing 3-4 MNQ with reachable TP1 (~42 pts) and TP2 (~68 pts)", () => {
      // Trader enters on limit at the 40%-50% retrace mid (~26330.00)
      const currentPrice = 26330.00;

      const card = evaluateLTFExecution({
        m1Bars: retraceBars,
        currentPrice,
        atrOpen15m,
        metrics: mockMetrics,
        layer1,
        layer2,
        keyLevels: mockKeyLevels,
        propProfile: PROP_PRESETS.Topstep_EOD,
        forcedTimeET: { hour: 9, minute: 36 }
      });

      expect(card.archetype).toBe("RETRACE_CONTINUATION");
      expect(card.direction).toBe("SHORT");

      // Reachable targets inside [0.25, 0.75] * ATR_Open_15m (26.25 to 78.75 pts)
      // TP1 must be inside [0.25, 0.45] * ATR_Open_15m (26.25 to 47.25 pts)
      expect(card.tp1.distancePts).toBeGreaterThanOrEqual(0.25 * atrOpen15m);
      expect(card.tp1.distancePts).toBeLessThanOrEqual(0.45 * atrOpen15m);
      expect(card.tp1.distancePts).toBeCloseTo(42.0, 0);

      // TP2 must be inside [0.50, 0.75] * ATR_Open_15m (52.5 to 78.75 pts)
      expect(card.tp2.distancePts).toBeGreaterThanOrEqual(0.50 * atrOpen15m);
      expect(card.tp2.distancePts).toBeLessThanOrEqual(0.75 * atrOpen15m);
      expect(card.tp2.distancePts).toBeCloseTo(68.0, 0);

      // Sizing on Topstep $50k Express ($250 risk budget, stopPts ~20-25 pts)
      expect(card.contracts).toBeGreaterThanOrEqual(3);
      expect(card.contracts).toBeLessThanOrEqual(5);

      // Proves distant 150-pt HTF magnets (> 0.75x ATR = 78.75 pts) are demoted to HTF Context Only
      expect(card.tp1.distancePts).not.toBe(150.0);
      expect(card.tp2.distancePts).not.toBe(150.0);

      const demotedPDL = card.htfDemotedLevels.find((lvl) => lvl.name.includes("Distant Prior Day Low") || lvl.distancePts >= 140);
      expect(demotedPDL).toBeDefined();
      expect(demotedPDL?.badge).toContain("HTF Context Only — Low 10m Hit Prob");
      expect(demotedPDL?.hitProb10m).toBeLessThan(0.10); // < 10% Brownian touch probability
    });

    it("calculates accurate Brownian touch probabilities across 5m, 10m, and 15m horizons", () => {
      // 42 pt distance with 105 pt ATR (sigma_15m = 52.5 pts)
      const p5m = computeBrownianTouchProbability(42, 5, 105);
      const p10m = computeBrownianTouchProbability(42, 10, 105);
      const p15m = computeBrownianTouchProbability(42, 15, 105);

      expect(p5m).toBeGreaterThan(0.15);
      expect(p10m).toBeGreaterThan(p5m);
      expect(p15m).toBeGreaterThan(p10m);
      expect(p15m).toBeLessThan(1.0);

      // 150 pt distant level over 10m horizon must have negligible probability (< 5%)
      const p150_10m = computeBrownianTouchProbability(150, 10, 105);
      expect(p150_10m).toBeLessThan(0.05);
    });
  });

  describe("Fixture 3: 09:39 Sweep + 09:40 MSS Reversal Detection", () => {
    it("detects sweep of ORL (26260.00) followed by 1m MSS displacement close (26278.00)", () => {
      const sweepBars: OHLCVBar[] = [
        ...baseOpeningBars,
        { timestamp: "2026-11-24T14:38:00Z", open: 26275.00, high: 26280.00, low: 26262.00, close: 26265.00, volume: 5000 },
        // 09:39: Sweeps ORL (26260) with Low 26245.00
        { timestamp: "2026-11-24T14:39:00Z", open: 26265.00, high: 26270.00, low: 26245.00, close: 26252.00, volume: 14000 },
        // 09:40: Strong green displacement candle reclaiming ORL, closing at 26278.00
        { timestamp: "2026-11-24T14:40:00Z", open: 26252.00, high: 26282.00, low: 26250.00, close: 26278.00, volume: 16000 }
      ];

      const card = evaluateLTFExecution({
        m1Bars: sweepBars,
        currentPrice: 26278.00,
        atrOpen15m,
        metrics: mockMetrics,
        layer1,
        forcedTimeET: { hour: 9, minute: 40 }
      });

      expect(card.archetype).toBe("SWEEP_MSS_REVERSAL");
      expect(card.direction).toBe("LONG");
      expect(card.status).toBe("ARMED_SWEEP_REVERSAL");
      // Stop loss anchored below the sweep wick (26245) + buffer
      expect(card.stopLoss).toBeLessThan(26245.00);
      expect(card.entryZone.mid).toBeCloseTo(26260.00, 1);
    });
  });

  describe("PropProfile Risk Sizing & Guardrails", () => {
    it("enforces Intraday Unrealized drawdown mode caps (<= 1.8R), disables runners, and emits phantom drawdown warning", () => {
      const apexIntraday = PROP_PRESETS.Apex_Intraday;
      expect(apexIntraday.drawdownMode).toBe("INTRADAY_UNREALIZED");

      const plan = computeDetailedRiskPlan({
        entryPrice: 26330.00,
        stopPrice: 26350.00,
        targetRR: 3.5, // Trader requested 3.5R runner
        instrument: "MNQ",
        propProfile: apexIntraday
      });

      // Target R:R must be capped at 1.8R
      expect(plan.rawRR).toBeLessThanOrEqual(1.8);
      expect(plan.targetPts).toBe(36.0); // 20 pts stop * 1.8 = 36 pts
      expect(plan.phantomDrawdownWarning).toBeDefined();
      expect(plan.phantomDrawdownWarning).toContain("PHANTOM DRAWDOWN WARNING");
      expect(plan.warnings.some((w) => w.includes("Breakeven runners prohibited"))).toBe(true);
    });

    it("enforces dynamic Consistency Rule profit cap (e.g. 0.38x on 40% rule)", () => {
      const tradeifyProfile = PROP_PRESETS.Tradeify_EOD; // 40% consistency rule, $3000 profit target
      expect(tradeifyProfile.consistencyRulePercent).toBe(40);
      expect(tradeifyProfile.cycleProfitTarget).toBe(3000);

      // On a large trade targeting $1,500 (> 0.38 * 3000 = $1,140):
      const plan = computeDetailedRiskPlan({
        entryPrice: 26330.00,
        stopPrice: 26340.00, // 10 pt stop
        targetPrice: 26230.00, // 100 pt target
        instrument: "MNQ",
        baseRiskDollars: 300,
        propProfile: tradeifyProfile
      });

      // Should warn about exceeding $1,140 consistency ceiling
      expect(plan.consistencyCapWarning).toBeDefined();
      expect(plan.consistencyCapWarning).toContain("CONSISTENCY CAP WARNING");
      expect(plan.consistencyCapWarning).toContain("38% on 40% rule");
    });

    it("quantizes MNQ contracts: switches 1 contract to '1 MNQ ALL-OUT AT TP1' and handles 0 contracts tighter retrace requirement", () => {
      // Case A: Exactly 1 contract
      const singleLotPlan = computeDetailedRiskPlan({
        entryPrice: 26330.00,
        stopPrice: 26430.00, // 100 pt stop with $250 budget -> 1 contract
        instrument: "MNQ",
        propProfile: PROP_PRESETS.Topstep_EOD
      });

      expect(singleLotPlan.suggestedContracts).toBe(1);
      expect(singleLotPlan.contractSplitDirective).toContain("1 MNQ ALL-OUT AT TP1");
      expect(singleLotPlan.contractSplitDirective).toContain("Partial profit scale-outs disabled");

      // Case B: 0 contracts (stop is too wide for budget)
      const zeroLotPlan = computeDetailedRiskPlan({
        entryPrice: 26330.00,
        stopPrice: 26500.00, // 170 pt stop with $100 budget -> 0 contracts
        baseRiskDollars: 100,
        instrument: "MNQ",
        propProfile: PROP_PRESETS.Topstep_EOD
      });

      expect(zeroLotPlan.suggestedContracts).toBe(0);
      expect(zeroLotPlan.tighterEntryRequired).toBeDefined();
      expect(zeroLotPlan.tighterEntryRequired?.directive).toContain("RETRACE ENTRY REQUIRED");
      expect(zeroLotPlan.tighterEntryRequired?.maxStopPts).toBeGreaterThan(0);
    });

    it("triggers Tier 1 news blackout alarm within firm blackout window (CPI, NFP, PPI, FOMC)", () => {
      const cpiEvent: EconomicEvent = {
        id: "cpi-test",
        date: "2026-11-24",
        timeET: "08:30 AM",
        event: "Core CPI (m/m)",
        country: "USD",
        impact: "HIGH",
        folderColor: "RED",
        alert: true,
        notes: ""
      };

      // Exactly at 08:29 AM ET (1 minute before CPI release)
      const nowAt829 = new Date("2026-11-24T13:29:00Z"); // 08:29 AM ET
      const result = checkTier1NewsBlackout([cpiEvent], nowAt829, 2);

      expect(result.hasBlackoutAlarm).toBe(true);
      expect(result.alarmMessage).toContain("PROP FIRM VIOLATION RISK");
      expect(result.alarmMessage).toContain("Core CPI (m/m)");
      expect(result.alarmMessage).toContain("CANCEL ALL RESTING LIMIT ORDERS");

      // At 09:15 AM ET (45 minutes after release, outside ±2m window)
      const nowAt915 = new Date("2026-11-24T14:15:00Z"); // 09:15 AM ET
      const safeResult = checkTier1NewsBlackout([cpiEvent], nowAt915, 2);
      expect(safeResult.hasBlackoutAlarm).toBe(false);
    });
  });
});
