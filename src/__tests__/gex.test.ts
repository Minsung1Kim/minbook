import { describe, it, expect } from "vitest";
import {
  normalPdf,
  computeBlackScholesGamma,
  computeStrikeGex,
  finalizeGEXData
} from "../lib/market/gex";

describe("Delayed GEX Engine", () => {
  describe("normalPdf", () => {
    it("evaluates standard normal density at zero", () => {
      const val = normalPdf(0);
      expect(val).toBeCloseTo(0.39894, 4);
    });

    it("is symmetric around zero", () => {
      expect(normalPdf(1.5)).toBeCloseTo(normalPdf(-1.5), 6);
    });
  });

  describe("computeBlackScholesGamma", () => {
    it("computes positive gamma for ATM options", () => {
      const S = 500;
      const K = 500;
      const T = 30 / 365;
      const sigma = 0.22;
      const gamma = computeBlackScholesGamma(S, K, T, sigma);
      expect(gamma).toBeGreaterThan(0);
      expect(Number.isFinite(gamma)).toBe(true);
    });

    it("has peak gamma ATM and lower gamma OTM", () => {
      const S = 500;
      const T = 15 / 365;
      const sigma = 0.20;
      const atmGamma = computeBlackScholesGamma(S, 500, T, sigma);
      const otmGamma = computeBlackScholesGamma(S, 540, T, sigma);
      expect(atmGamma).toBeGreaterThan(otmGamma);
    });

    it("clamps T to 1/252 to prevent division by zero for 0DTE", () => {
      const S = 500;
      const K = 500;
      const zeroDteGamma = computeBlackScholesGamma(S, K, 0.0000001, 0.20);
      expect(Number.isFinite(zeroDteGamma)).toBe(true);
      expect(zeroDteGamma).toBeGreaterThan(0);
    });

    it("handles boundary zero inputs gracefully", () => {
      expect(computeBlackScholesGamma(0, 500, 0.1, 0.2)).toBe(0);
      expect(computeBlackScholesGamma(500, 0, 0.1, 0.2)).toBe(0);
      expect(computeBlackScholesGamma(500, 500, 0, 0.2)).toBeGreaterThan(0); // clamped T
      expect(computeBlackScholesGamma(500, 500, 0.1, 0)).toBe(0);
    });
  });

  describe("computeStrikeGex", () => {
    it("returns positive dollar GEX for calls and negative for puts", () => {
      const gamma = 0.005;
      const oi = 1000;
      const spot = 500;

      const callGex = computeStrikeGex(gamma, oi, spot, true);
      const putGex = computeStrikeGex(gamma, oi, spot, false);

      expect(callGex).toBeGreaterThan(0);
      expect(putGex).toBeLessThan(0);
      expect(callGex).toBeCloseTo(-putGex, 4);
    });

    it("returns zero when open interest or gamma is zero", () => {
      expect(computeStrikeGex(0, 1000, 500, true)).toBe(0);
      expect(computeStrikeGex(0.005, 0, 500, true)).toBe(0);
    });
  });

  describe("finalizeGEXData", () => {
    it("identifies Call Wall, Put Wall, regime tilt, and basis translation to NQ points", () => {
      const underlyingSpot = 500;
      const nqSpot = 21000; // basisRatio = 42.0

      const strikeMap = new Map();
      // Strike 480: Heavy Put OI
      strikeMap.set(480, {
        strike: 480,
        callGex: 5000000,
        putGex: -80000000,
        netGex: -75000000,
        callOi: 2000,
        putOi: 32000
      });
      // Strike 490: Moderate Put OI
      strikeMap.set(490, {
        strike: 490,
        callGex: 15000000,
        putGex: -25000000,
        netGex: -10000000,
        callOi: 4000,
        putOi: 7000
      });
      // Strike 500 (ATM): Net Positive
      strikeMap.set(500, {
        strike: 500,
        callGex: 40000000,
        putGex: -20000000,
        netGex: 20000000,
        callOi: 10000,
        putOi: 5000
      });
      // Strike 510: Heavy Call OI (Call Wall)
      strikeMap.set(510, {
        strike: 510,
        callGex: 95000000,
        putGex: -5000000,
        netGex: 90000000,
        callOi: 25000,
        putOi: 1200
      });

      const totalCallGex = 155000000;
      const totalPutGex = -130000000;
      const zeroDteNetGex = 25000000;

      const result = finalizeGEXData(
        strikeMap,
        underlyingSpot,
        nqSpot,
        totalCallGex,
        totalPutGex,
        zeroDteNetGex,
        "YF_QQQ_MODEL_BS"
      );

      // Total net GEX = +25,000,000 >= 0 -> POSITIVE_GAMMA
      expect(result.netGammaRegime).toBe("POSITIVE_GAMMA");
      expect(result.totalNetGex).toBe(25000000);

      // Basis ratio = 21000 / 500 = 42
      expect(result.basisRatio).toBeCloseTo(42.0, 2);

      // Call Wall at 510 -> translated to NQ: 510 * 42 = 21420
      expect(result.callWallNq).toBe(21420);

      // Put Wall at 480 -> translated to NQ: 480 * 42 = 20160
      expect(result.putWallNq).toBe(20160);

      // Gamma flip crosses between 490 (running net -85M) and 500 (running net -65M) -> around ~490-500
      expect(result.gammaFlipNq).toBeGreaterThan(20160);
      expect(result.gammaFlipNq).toBeLessThan(21420);

      // Disclaimer matches contract
      expect(result.disclaimer).toBe("DELAYED OI-BASED GEX ESTIMATE (NOT LIVE DEALER INVENTORY)");
    });
  });
});
