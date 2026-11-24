import { describe, it, expect } from "vitest";
import { computeSessionLevels } from "../lib/market/levels";
import { OHLCVBar } from "../types/market";

describe("SMT (Smart Money Technique) Divergence Engine", () => {
  const mockDailyBars: OHLCVBar[] = [
    {
      timestamp: "2026-11-20T00:00:00.000Z",
      open: 21000,
      high: 21200,
      low: 20900,
      close: 21100,
      volume: 100000
    }
  ];

  const mockNqIntradayBars: OHLCVBar[] = [
    {
      timestamp: "2026-11-23T04:00:00.000Z",
      open: 21100,
      high: 21250, // ONH = 21250
      low: 21050,  // ONL = 21050
      close: 21150,
      volume: 5000
    }
  ];

  it("detects BULLISH SMT when NQ sweeps low but ES holds higher low", () => {
    // NQ sweeps low: currentPrice = 21000 (< ONL 21050)
    // ES holds higher low: ES low = 5900, ES currentPrice = 5920 (> 5900)
    const mockEsData = {
      quote: { price: 5920 },
      intradayBars: [
        {
          timestamp: "2026-11-23T04:00:00.000Z",
          open: 5910,
          high: 5950,
          low: 5900, // ES ONL = 5900
          close: 5920,
          volume: 20000
        }
      ]
    };

    const { sessionMetrics } = computeSessionLevels(
      21000, // NQ swept below ONL 21050
      mockDailyBars,
      mockNqIntradayBars,
      24.0,
      mockEsData,
      "2026-11-23"
    );

    const smt = sessionMetrics.smtDivergence;
    expect(smt).toBeDefined();
    if (!smt) throw new Error("smt is undefined");
    expect(smt.hasDivergence).toBe(true);
    expect(smt.direction).toBe("BULLISH");
    expect(smt.leadingAsset).toBe("ES");
    expect(smt.sweptAsset).toBe("NQ");
    expect(smt.nqMadeNewLow).toBe(true);
    expect(smt.esMadeNewLow).toBe(false);
    expect(smt.divergenceType).toContain("NQ SWEPT LOW, ES HELD");
    expect(smt.mssTriggerInstruction).toContain("Market Structure Shift");
    expect(smt.nqSwingPoints).toBeDefined();
    expect(smt.nqSwingPoints?.length).toBe(2);
  });

  it("detects BULLISH SMT when ES sweeps low but NQ holds higher low", () => {
    // NQ holds: currentPrice = 21100 (> ONL 21050)
    // ES sweeps: ES ONL = 5900, ES currentPrice = 5890 (< 5900)
    const mockEsData = {
      quote: { price: 5890 },
      intradayBars: [
        {
          timestamp: "2026-11-23T04:00:00.000Z",
          open: 5910,
          high: 5950,
          low: 5900,
          close: 5890,
          volume: 20000
        }
      ]
    };

    const { sessionMetrics } = computeSessionLevels(
      21100, // NQ held above 21050
      mockDailyBars,
      mockNqIntradayBars,
      24.0,
      mockEsData,
      "2026-11-23"
    );

    const smt = sessionMetrics.smtDivergence;
    expect(smt).toBeDefined();
    if (!smt) throw new Error("smt is undefined");
    expect(smt.hasDivergence).toBe(true);
    expect(smt.direction).toBe("BULLISH");
    expect(smt.leadingAsset).toBe("NQ");
    expect(smt.sweptAsset).toBe("ES");
    expect(smt.nqMadeNewLow).toBe(false);
    expect(smt.esMadeNewLow).toBe(true);
    expect(smt.divergenceType).toContain("ES SWEPT LOW, NQ HELD");
    expect(smt.nqSwingPoints).toBeDefined();
  });

  it("detects BEARISH SMT when NQ sweeps high but ES holds lower high", () => {
    // NQ sweeps high: currentPrice = 21300 (> ONH 21250)
    // ES holds lower high: ES ONH = 5950, ES currentPrice = 5930 (< 5950)
    const mockEsData = {
      quote: { price: 5930 },
      intradayBars: [
        {
          timestamp: "2026-11-23T04:00:00.000Z",
          open: 5910,
          high: 5950,
          low: 5900,
          close: 5930,
          volume: 20000
        }
      ]
    };

    const { sessionMetrics } = computeSessionLevels(
      21300, // NQ swept above ONH 21250
      mockDailyBars,
      mockNqIntradayBars,
      24.0,
      mockEsData,
      "2026-11-23"
    );

    const smt = sessionMetrics.smtDivergence;
    expect(smt).toBeDefined();
    if (!smt) throw new Error("smt is undefined");
    expect(smt.hasDivergence).toBe(true);
    expect(smt.direction).toBe("BEARISH");
    expect(smt.leadingAsset).toBe("ES");
    expect(smt.sweptAsset).toBe("NQ");
    expect(smt.nqMadeNewHigh).toBe(true);
    expect(smt.esMadeNewHigh).toBe(false);
    expect(smt.divergenceType).toContain("NQ SWEPT HIGH, ES HELD");
    expect(smt.nqSwingPoints).toBeDefined();
  });

  it("detects BEARISH SMT when ES sweeps high but NQ holds lower high", () => {
    // NQ holds lower high: currentPrice = 21200 (< ONH 21250)
    // ES sweeps high: ES ONH = 5950, ES currentPrice = 5960 (> 5950)
    const mockEsData = {
      quote: { price: 5960 },
      intradayBars: [
        {
          timestamp: "2026-11-23T04:00:00.000Z",
          open: 5910,
          high: 5950,
          low: 5900,
          close: 5960,
          volume: 20000
        }
      ]
    };

    const { sessionMetrics } = computeSessionLevels(
      21200, // NQ held below ONH 21250
      mockDailyBars,
      mockNqIntradayBars,
      24.0,
      mockEsData,
      "2026-11-23"
    );

    const smt = sessionMetrics.smtDivergence;
    expect(smt).toBeDefined();
    if (!smt) throw new Error("smt is undefined");
    expect(smt.hasDivergence).toBe(true);
    expect(smt.direction).toBe("BEARISH");
    expect(smt.leadingAsset).toBe("NQ");
    expect(smt.sweptAsset).toBe("ES");
    expect(smt.nqMadeNewHigh).toBe(false);
    expect(smt.esMadeNewHigh).toBe(true);
    expect(smt.divergenceType).toContain("ES SWEPT HIGH, NQ HELD");
    expect(smt.nqSwingPoints).toBeDefined();
  });

  it("reports SYNCED (no divergence) when both or neither assets sweep", () => {
    // Inside range: NQ 21150 (between 21050 and 21250), ES 5925 (between 5900 and 5950)
    const mockEsData = {
      quote: { price: 5925 },
      intradayBars: [
        {
          timestamp: "2026-11-23T04:00:00.000Z",
          open: 5910,
          high: 5950,
          low: 5900,
          close: 5925,
          volume: 20000
        }
      ]
    };

    const { sessionMetrics } = computeSessionLevels(
      21150,
      mockDailyBars,
      mockNqIntradayBars,
      24.0,
      mockEsData,
      "2026-11-23"
    );

    const smt = sessionMetrics.smtDivergence;
    expect(smt).toBeDefined();
    if (!smt) throw new Error("smt is undefined");
    expect(smt.hasDivergence).toBe(false);
    expect(smt.direction).toBe("NEUTRAL");
    expect(smt.leadingAsset).toBe("NEUTRAL");
    expect(smt.sweptAsset).toBe("NONE");
    expect(smt.divergenceType).toBe("NONE (SYNCED)");
  });
});
