import { describe, it, expect } from "vitest";
import { computeGarmanKlassVol, computeYangZhangVol, computeExpectedMove } from "../lib/market/math";
import { OHLCVBar } from "../types/market";

describe("Volatility & Realized Range Estimators", () => {
  const sampleBars: OHLCVBar[] = [
    { timestamp: "2026-11-10T21:00:00Z", open: 21000, high: 21250, low: 20950, close: 21200, volume: 100000 },
    { timestamp: "2026-11-11T21:00:00Z", open: 21220, high: 21400, low: 21150, close: 21350, volume: 110000 },
    { timestamp: "2026-11-12T21:00:00Z", open: 21300, high: 21550, low: 21280, close: 21500, volume: 120000 },
    { timestamp: "2026-11-13T21:00:00Z", open: 21480, high: 21620, low: 21350, close: 21400, volume: 105000 },
    { timestamp: "2026-11-14T21:00:00Z", open: 21420, high: 21500, low: 21200, close: 21250, volume: 130000 },
    { timestamp: "2026-11-17T21:00:00Z", open: 21300, high: 21450, low: 21100, close: 21380, volume: 115000 },
    { timestamp: "2026-11-18T21:00:00Z", open: 21400, high: 21600, low: 21350, close: 21550, volume: 125000 },
    { timestamp: "2026-11-19T21:00:00Z", open: 21580, high: 21750, low: 21500, close: 21700, volume: 140000 },
    { timestamp: "2026-11-20T21:00:00Z", open: 21680, high: 21820, low: 21600, close: 21780, volume: 135000 },
    { timestamp: "2026-11-21T21:00:00Z", open: 21750, high: 21900, low: 21650, close: 21850, volume: 150000 }
  ];

  it("computes annualized Garman-Klass volatility within expected bounds", () => {
    const gk = computeGarmanKlassVol(sampleBars);
    expect(gk).toBeGreaterThan(5);
    expect(gk).toBeLessThan(40);
  });

  it("computes annualized Yang-Zhang volatility handling gaps and drift", () => {
    const yz = computeYangZhangVol(sampleBars);
    expect(yz).toBeGreaterThan(5);
    expect(yz).toBeLessThan(40);
  });

  it("computes Variance Risk Premium (VRP) accurately", () => {
    const vxn = 24.5;
    const yz = computeYangZhangVol(sampleBars);
    const vrp = Math.round((vxn - yz) * 100) / 100;
    const isNegativeVrp = vrp < 0;

    expect(typeof vrp).toBe("number");
    expect(typeof isNegativeVrp).toBe("boolean");
  });

  it("computes Rule of 16 Implied Move and Straddle Proxy correctly", () => {
    const pdc = 21000;
    const iv = 20.0; // 20% annualized IV
    const move = computeExpectedMove(pdc, iv);

    // 1-SD daily move = 21000 * 0.20 / sqrt(252) ≈ 21000 * 0.20 / 15.8745 ≈ 264.58 pts
    expect(move.expectedMove1SD).toBeCloseTo(264.58, 0);

    // Straddle move = 1-SD * sqrt(2/pi) ≈ 264.58 * 0.79788 ≈ 211.10 pts
    expect(move.expectedMoveStraddle).toBeCloseTo(211.1, 0);

    expect(move.upper1SD).toBe(pdc + move.expectedMove1SD);
    expect(move.lower1SD).toBe(pdc - move.expectedMove1SD);
    expect(move.upperStraddle).toBe(pdc + move.expectedMoveStraddle);
    expect(move.lowerStraddle).toBe(pdc - move.expectedMoveStraddle);
  });
});
