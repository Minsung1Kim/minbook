import { describe, it, expect } from "vitest";
import { computeDetailedRiskPlan, DEFAULT_FEES_PER_RT } from "../lib/risk/sizing";

describe("computeDetailedRiskPlan", () => {
  it("correctly infers LONG direction, sizes MNQ contracts, and factors fees", () => {
    // Entry 21000, Stop 20980 (20 pts stop), Target 21044 (44 pts target = 2.2R)
    // Budget $250. 20 pts * $2 = $40/ct. $250 / 40 = 6 contracts.
    const plan = computeDetailedRiskPlan({
      entryPrice: 21000.0,
      stopPrice: 20980.0,
      targetPrice: 21044.0,
      instrument: "MNQ",
      baseRiskDollars: 250,
      regimeMultiplier: 1.0,
      atr15m: 25.0
    });

    expect(plan.direction).toBe("LONG");
    expect(plan.stopPts).toBe(20.0);
    expect(plan.targetPts).toBe(44.0);
    expect(plan.rawRR).toBe(2.2);
    expect(plan.suggestedContracts).toBe(6);

    // Gross risk = 6 * 20 * $2 = $240
    expect(plan.grossRiskDollars).toBe(240);
    // Gross target = 6 * 44 * $2 = $528
    expect(plan.grossTargetDollars).toBe(528);

    // Total fees for 6 MNQ round-trips = 6 * $1.24 = $7.44
    expect(plan.totalFees).toBe(7.44);
    // Net risk = $240 + $7.44 = $247.44
    expect(plan.netRiskDollars).toBe(247.44);
    // Net target = $528 - $7.44 = $520.56
    expect(plan.netTargetDollars).toBe(520.56);
    // Net R:R = 520.56 / 247.44 = ~2.10R
    expect(plan.netRR).toBeCloseTo(2.10, 1);
    expect(plan.isStopTooTight).toBe(false);
  });

  it("correctly infers SHORT direction and generates target price from targetRR", () => {
    // Entry 21000, Stop 21015 (15 pts stop), targetRR 2.0 -> Target 20970
    const plan = computeDetailedRiskPlan({
      entryPrice: 21000.0,
      stopPrice: 21015.0,
      targetRR: 2.0,
      instrument: "MNQ",
      baseRiskDollars: 250,
      regimeMultiplier: 1.0,
      atr15m: 20.0
    });

    expect(plan.direction).toBe("SHORT");
    expect(plan.stopPts).toBe(15.0);
    expect(plan.targetPts).toBe(30.0);
    expect(plan.targetPrice).toBe(20970.0);
    expect(plan.rawRR).toBe(2.0);
    expect(plan.suggestedContracts).toBe(8); // 250 / 30 = 8 contracts ($240 gross)
  });

  it("triggers isStopTooTight warning when stopPts < 0.5 * atr15m", () => {
    // ATR 30 pts. 0.5 * 30 = 15 pts.
    // Stop distance = 8 pts (< 15 pts).
    const plan = computeDetailedRiskPlan({
      entryPrice: 21000.0,
      stopPrice: 20992.0,
      instrument: "MNQ",
      baseRiskDollars: 250,
      atr15m: 30.0
    });

    expect(plan.stopPts).toBe(8.0);
    expect(plan.isStopTooTight).toBe(true);
    expect(plan.warnings.some((w) => w.includes("STOP TOO TIGHT"))).toBe(true);
  });

  it("respects 0.5x regimeMultiplier during high-volatility / negative VRP days", () => {
    const plan = computeDetailedRiskPlan({
      entryPrice: 21000.0,
      stopPrice: 20980.0,
      instrument: "MNQ",
      baseRiskDollars: 250,
      regimeMultiplier: 0.5, // 0.5x cut -> $125 max risk
      atr15m: 25.0
    });

    // $125 / (20 * 2) = $125 / 40 = 3 contracts
    expect(plan.suggestedContracts).toBe(3);
    expect(plan.warnings.some((w) => w.includes("0.5x REGIME SIZE CUT"))).toBe(true);
  });

  it("handles NQ instrument fees correctly ($4.50/rt)", () => {
    // Stop 12 pts on NQ = $240 gross risk.
    const plan = computeDetailedRiskPlan({
      entryPrice: 21000.0,
      stopPrice: 20988.0,
      targetRR: 2.2,
      instrument: "NQ",
      baseRiskDollars: 250,
      regimeMultiplier: 1.0
    });

    expect(plan.instrument).toBe("NQ");
    expect(plan.suggestedContracts).toBe(1);
    expect(plan.totalFees).toBe(DEFAULT_FEES_PER_RT.NQ);
    expect(plan.grossRiskDollars).toBe(240);
    expect(plan.netRiskDollars).toBe(244.5);
  });
});
