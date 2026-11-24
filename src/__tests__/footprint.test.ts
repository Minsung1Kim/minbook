import { describe, it, expect } from "vitest";
import {
  computeCLV,
  computeIntrabarDelta,
  buildFootprintSummary
} from "../lib/market/footprint";
import { OHLCVBar, KeyLevel, SessionMetrics } from "../types/market";

describe("Footprint & Absorption Engine", () => {
  describe("computeCLV", () => {
    it("returns +1.0 when close equals candle high (strong bullish close)", () => {
      expect(computeCLV(21000, 20950, 21000, 20960)).toBe(1.0);
    });

    it("returns -1.0 when close equals candle low (strong bearish close)", () => {
      expect(computeCLV(21000, 20950, 20950, 20990)).toBe(-1.0);
    });

    it("returns 0.0 when close equals the exact midpoint of range", () => {
      expect(computeCLV(21000, 20900, 20950, 20920)).toBe(0.0);
    });

    it("clamps values strictly within [-1.0, 1.0]", () => {
      const clv = computeCLV(21000, 20950, 20980, 20960);
      expect(clv).toBeGreaterThanOrEqual(-1.0);
      expect(clv).toBeLessThanOrEqual(1.0);
    });

    it("handles zero range without NaN or division by zero", () => {
      expect(computeCLV(21000, 21000, 21000, 20990)).toBe(1.0);
      expect(computeCLV(21000, 21000, 21000, 21010)).toBe(-1.0);
      expect(computeCLV(21000, 21000, 21000, 21000)).toBe(0.0);
    });
  });

  describe("computeIntrabarDelta", () => {
    it("returns zero metrics for empty sub-bars", () => {
      const res = computeIntrabarDelta([], 21000, 20950);
      expect(res.netDelta).toBe(0);
      expect(res.totalVolume).toBe(0);
      expect(res.deltaRatio).toBe(0);
      expect(res.pocPrice).toBe(20975);
    });

    it("aggregates positive net delta when 1m sub-bars close at highs", () => {
      const m1Bars: OHLCVBar[] = [
        {
          timestamp: "2026-11-23T14:30:00.000Z",
          open: 20950,
          high: 20960,
          low: 20948,
          close: 20960, // CLV = +1.0
          volume: 500
        },
        {
          timestamp: "2026-11-23T14:31:00.000Z",
          open: 20960,
          high: 20970,
          low: 20958,
          close: 20970, // CLV = +1.0
          volume: 500
        }
      ];

      const res = computeIntrabarDelta(m1Bars, 20970, 20948);
      expect(res.netDelta).toBe(1000);
      expect(res.totalVolume).toBe(1000);
      expect(res.deltaRatio).toBe(1.0);
      // POC price rounded to 2.5 pt bin
      expect(res.pocPrice % 2.5).toBe(0);
    });
  });

  describe("buildFootprintSummary", () => {
    const mockMetrics = {
      pdh: 21200,
      pdl: 20800,
      pdc: 21000,
      pdMid: 21000,
      onh: 21100,
      onl: 20900,
      onMid: 21000,
      overnightInventory: "BALANCED" as const,
      inventoryPercent: 50,
      sessionVwap: 21000,
      globexVwap: 21000,
      priorDayRthVwap: 21000,
      rthSessionVwap: 21000,
      vwapCalculationMode: "VOLUME_WEIGHTED" as const,
      htf50Retrace: 21000,
      htf618Retrace: 20950,
      htf705Retrace: 20925,
      htfImpulseDirection: "BULLISH" as const,
      htfImpulseHigh: 21200,
      htfImpulseLow: 20800,
      expectedMove1SD: 120,
      expectedMoveStraddle: 100,
      upper1SD: 21120,
      lower1SD: 20880,
      upperStraddle: 21100,
      lowerStraddle: 20900,
      overnightRangeConsumedPercent: 30,
      atr14Daily: 250,
      atr15mIntraday: 25,
      overnightRange: 200,
      openingGap: 0,
      openingLocation: "AROUND_EQUILIBRIUM" as const
    } as SessionMetrics;

    const mockKeyLevels: KeyLevel[] = [
      {
        id: "onl",
        name: "Overnight Low",
        shortName: "ONL",
        price: 20900,
        role: "LIQUIDITY POOL",
        distancePoints: 0,
        distancePercent: 0,
        timeframe: "GLOBEX",
        note: "Overnight Low"
      },
      {
        id: "onh",
        name: "Overnight High",
        shortName: "ONH",
        price: 21100,
        role: "LIQUIDITY POOL",
        distancePoints: 0,
        distancePercent: 0,
        timeframe: "GLOBEX",
        note: "Overnight High"
      }
    ];

    it("detects Passive Absorption (ABS BUY) at support with high volume and long lower wick", () => {
      // 20 normal baseline parent bars
      const parentBars: OHLCVBar[] = [];
      const m1Bars: OHLCVBar[] = [];

      for (let i = 0; i < 20; i++) {
        const time = new Date(Date.UTC(2026, 10, 23, 14, i * 5)).toISOString();
        parentBars.push({
          timestamp: time,
          open: 21000,
          high: 21020,
          low: 20990,
          close: 21010,
          volume: 1000
        });
        m1Bars.push({
          timestamp: time,
          open: 21000,
          high: 21020,
          low: 20990,
          close: 21010,
          volume: 1000
        });
      }

      // Bar 21: High volume (3500 vs avg 1000), body ratio small, lower rejection wick, near ONL 20900
      const absTime = new Date(Date.UTC(2026, 10, 23, 15, 45)).toISOString();
      parentBars.push({
        timestamp: absTime,
        open: 20905,
        high: 20910,
        low: 20890, // lower wick: 20905 - 20890 = 15 pts
        close: 20907, // body: 2 pts, total range: 20 pts -> bodyRatio = 0.10, lowerWick = 15/20 = 0.75
        volume: 3500
      });
      m1Bars.push({
        timestamp: absTime,
        open: 20905,
        high: 20910,
        low: 20890,
        close: 20907,
        volume: 3500
      });

      const summary = buildFootprintSummary(
        parentBars,
        m1Bars,
        300,
        mockKeyLevels,
        mockMetrics
      );

      expect(summary.bars.length).toBe(21);
      const lastBar = summary.bars[20];
      expect(lastBar.signal).toBe("ABS_BUY");
      expect(lastBar.signalLabel).toBe("ABS BUY");
      expect(summary.disclaimer).toBe("Free 1m-Derived Intrabar Delta Proxy (Delayed — Not CME L2 Tick Flow)");
    });

    it("detects Aggressive Impulsive Sweep (IMP+) when volume and delta ratio are extreme", () => {
      const parentBars: OHLCVBar[] = [];
      const m1Bars: OHLCVBar[] = [];

      for (let i = 0; i < 20; i++) {
        const time = new Date(Date.UTC(2026, 10, 23, 14, i * 5)).toISOString();
        parentBars.push({
          timestamp: time,
          open: 21000,
          high: 21015,
          low: 20995,
          close: 21005,
          volume: 1000
        });
        m1Bars.push({
          timestamp: time,
          open: 21000,
          high: 21015,
          low: 20995,
          close: 21005,
          volume: 1000
        });
      }

      // Bar 21: High volume (2500) and closing at the absolute high (deltaRatio ~ +1.0)
      const sweepTime = new Date(Date.UTC(2026, 10, 23, 15, 45)).toISOString();
      parentBars.push({
        timestamp: sweepTime,
        open: 21020,
        high: 21060,
        low: 21018,
        close: 21060,
        volume: 2500
      });
      // 5 1m constituent bars closing at high
      for (let m = 0; m < 5; m++) {
        m1Bars.push({
          timestamp: new Date(Date.UTC(2026, 10, 23, 15, 45 + m)).toISOString(),
          open: 21020 + m * 8,
          high: 21028 + m * 8,
          low: 21018 + m * 8,
          close: 21028 + m * 8,
          volume: 500
        });
      }

      const summary = buildFootprintSummary(
        parentBars,
        m1Bars,
        300,
        mockKeyLevels,
        mockMetrics
      );

      const lastBar = summary.bars[summary.bars.length - 1];
      expect(lastBar.signal).toBe("IMP_BUY");
      expect(lastBar.signalLabel).toBe("IMP+");
    });
  });
});
