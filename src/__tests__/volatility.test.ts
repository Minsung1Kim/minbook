import { describe, it, expect } from "vitest";
import {
  computeGarmanKlassVol,
  computeYangZhangVol,
  computeExpectedMove,
  computeDimensionlessVRP,
  computeIntradayRealizedVol5m
} from "../lib/market/math";
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

  it("computes Variance Risk Premium (VRP) accurately in dimensionless ratio form", () => {
    const iv = 22.0;
    const rv = 18.0;
    const res = computeDimensionlessVRP(iv, rv);

    expect(res.vrpRatio).toBeCloseTo(1.22, 2);
    expect(res.isNegativeVrp).toBe(false);

    // Negative VRP when RV > IV
    const inverted = computeDimensionlessVRP(16.0, 20.0);
    expect(inverted.vrpRatio).toBeCloseTo(0.80, 2);
    expect(inverted.isNegativeVrp).toBe(true);
  });

  it("computes 5-minute intraday realized volatility", () => {
    const bars5m: OHLCVBar[] = [];
    let p = 21000;
    for (let i = 0; i < 78; i++) {
      const step = (i % 2 === 0 ? 1 : -1) * 15;
      p += step;
      bars5m.push({
        timestamp: new Date(Date.UTC(2026, 10, 24, 14, 30 + i * 5)).toISOString(),
        open: p - step,
        high: p + 5,
        low: p - 5,
        close: p,
        volume: 2000
      });
    }
    const rv5m = computeIntradayRealizedVol5m(bars5m);
    expect(rv5m).toBeGreaterThan(0);
    expect(rv5m).toBeLessThan(100);
  });

  it("computes 252-trading-day annualized Implied Move and honest Straddle coverage", () => {
    const pdc = 21000;
    const iv = 20.0; // 20% annualized IV
    const move = computeExpectedMove(pdc, iv);

    // 1-SD daily move = 21000 * 0.20 / sqrt(252) ≈ 21000 * 0.20 / 15.8745 ≈ 264.58 pts
    expect(move.expectedMove1SD).toBeCloseTo(264.58, 1);

    // Straddle move = 1-SD * sqrt(2/pi) ≈ 264.58 * 0.79788 ≈ 211.10 pts
    expect(move.expectedMoveStraddle).toBeCloseTo(211.10, 1);

    expect(move.upper1SD).toBe(pdc + move.expectedMove1SD);
    expect(move.lower1SD).toBe(pdc - move.expectedMove1SD);
    expect(move.upperStraddle).toBe(pdc + move.expectedMoveStraddle);
    expect(move.lowerStraddle).toBe(pdc - move.expectedMoveStraddle);

    // Coverage metadata
    expect(move.annualizationDays).toBe(252);
    expect(move.straddleCoveragePercent).toBe(57.5);
    expect(move.coverageLabel).toContain("~57.5% Normal Coverage (0.7979 SD)");
  });

  it("prioritizes VOLQ over VXN when volq option is supplied", () => {
    const pdc = 21000;
    const vxn = 24.0;
    const volq = 20.0;
    const moveWithVolq = computeExpectedMove(pdc, vxn, { volq });
    const moveWithoutVolq = computeExpectedMove(pdc, vxn);

    expect(moveWithVolq.volatilityUsed).toBe(20.0);
    expect(moveWithoutVolq.volatilityUsed).toBe(24.0);
    expect(moveWithVolq.expectedMove1SD).toBeLessThan(moveWithoutVolq.expectedMove1SD);
  });
});
