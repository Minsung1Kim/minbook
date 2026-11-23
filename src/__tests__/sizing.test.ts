import { describe, it, expect } from "vitest";
import { computePositionSizing } from "../lib/risk/sizing";

describe("Position Sizing & Contract Calculator", () => {
  it("sizes MNQ contracts with 1.0x normal regime scaling", () => {
    // Risk budget: $250, Stop: 25 pts ($50/contract on MNQ at $2/pt)
    // Suggested contracts = floor(250 / 50) = 5 MNQ
    const res = computePositionSizing({
      realPropDrawdown: 2000,
      baseRiskDollars: 250,
      targetRR: 2.2,
      instrument: "MNQ",
      stopDistancePts: 25,
      regimeRiskMultiplier: 1.0,
      atr15m: 24.5
    });

    expect(res.suggestedContracts).toBe(5);
    expect(res.actualDollarRisk).toBe(250);
    expect(res.targetPoints).toBe(55); // 25 * 2.2
    expect(res.actualTargetDollars).toBe(550); // 5 * 55 * 2
    expect(res.drawdownRiskPercent).toBe(12.5); // 250 / 2000 * 100
    expect(res.isStopTooTight).toBe(false);
  });

  it("scales risk down to 0.5x under backwardation or negative VRP regime", () => {
    // Risk budget: $250 -> 0.5x scaled = $125
    // Stop: 25 pts ($50/contract)
    // Suggested contracts = floor(125 / 50) = 2 MNQ
    const res = computePositionSizing({
      realPropDrawdown: 2000,
      baseRiskDollars: 250,
      targetRR: 2.2,
      instrument: "MNQ",
      stopDistancePts: 25,
      regimeRiskMultiplier: 0.5,
      atr15m: 24.5
    });

    expect(res.adjustedRiskDollars).toBe(125);
    expect(res.suggestedContracts).toBe(2);
    expect(res.actualDollarRisk).toBe(100); // 2 * 25 * 2
    expect(res.warnings.some((w) => w.includes("REGIME SIZE CUT"))).toBe(true);
  });

  it("flags STOP-TOO-TIGHT warning when stop is narrower than 0.5x ATR_15m", () => {
    // 15m ATR = 30 pts. Stop distance = 10 pts (< 15 pts = 0.5 * ATR_15m)
    const res = computePositionSizing({
      realPropDrawdown: 2000,
      baseRiskDollars: 250,
      targetRR: 2.2,
      instrument: "MNQ",
      stopDistancePts: 10,
      regimeRiskMultiplier: 1.0,
      atr15m: 30.0
    });

    expect(res.isStopTooTight).toBe(true);
    expect(res.warnings.some((w) => w.includes("STOP TOO TIGHT"))).toBe(true);
  });

  it("handles stand-aside regime multiplier (0.0x)", () => {
    const res = computePositionSizing({
      realPropDrawdown: 2000,
      baseRiskDollars: 250,
      targetRR: 2.2,
      instrument: "MNQ",
      stopDistancePts: 25,
      regimeRiskMultiplier: 0.0,
      atr15m: 25.0
    });

    expect(res.suggestedContracts).toBe(0);
    expect(res.actualDollarRisk).toBe(0);
    expect(res.warnings.some((w) => w.includes("STAND ASIDE"))).toBe(true);
  });
});
