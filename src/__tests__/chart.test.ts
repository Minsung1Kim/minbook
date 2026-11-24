import { describe, it, expect } from "vitest";
import {
  sanitizeCandleBars,
  computeCumulativeVWAP,
  formatETTime,
  formatETDateTime
} from "../components/chart/MinBookChart";
import { isEventPassed } from "../components/EconomicNewsCard";
import {
  timeSecToLogicalIndex,
  logicalIndexToTimeSec,
  DRAWING_COLOR_PALETTE
} from "../components/chart/primitives";
import { OHLCVBar } from "../types/market";

describe("MinBookChart Unit Tests", () => {
  const sampleBars: OHLCVBar[] = [
    {
      timestamp: "2026-11-23T14:30:00.000Z", // 09:30 AM ET
      open: 26800,
      high: 26820,
      low: 26790,
      close: 26815,
      volume: 5000
    },
    {
      timestamp: "2026-11-23T14:45:00.000Z", // 09:45 AM ET
      open: 26815,
      high: 26830,
      low: 26810,
      close: 26825,
      volume: 4000
    },
    {
      timestamp: "2026-11-23T15:00:00.000Z", // 10:00 AM ET
      open: 26825,
      high: 26840,
      low: 26815,
      close: 26835,
      volume: 6000
    }
  ];

  it("sanitizes bar timestamps into ascending Unix seconds without duplicates", () => {
    // Add out-of-order and duplicate bar
    const barsWithDupes: OHLCVBar[] = [
      sampleBars[1],
      sampleBars[0],
      {
        timestamp: "2026-11-23T14:30:00.000Z", // duplicate of 09:30
        open: 26802,
        high: 26822,
        low: 26792,
        close: 26816,
        volume: 5100
      },
      sampleBars[2]
    ];

    const result = sanitizeCandleBars(barsWithDupes);

    // Must have exactly 3 unique bars
    expect(result.length).toBe(3);

    // Timestamps must be strictly ascending numbers (Unix seconds)
    expect((result[0].time as number) < (result[1].time as number)).toBe(true);
    expect((result[1].time as number) < (result[2].time as number)).toBe(true);

    // Verify values match valid bar
    expect(result[0].open).toBeGreaterThan(0);
    expect(result[0].close).toBeGreaterThan(0);
  });

  it("computes cumulative volume-weighted VWAP correctly", () => {
    const vwapData = computeCumulativeVWAP(sampleBars, false);

    expect(vwapData.length).toBe(3);

    // Bar 1 typPrice = (high + low + close) / 3 = (26820 + 26790 + 26815) / 3 = 26808.33
    const bar1Typ = (sampleBars[0].high + sampleBars[0].low + sampleBars[0].close) / 3;
    expect(vwapData[0].value).toBeCloseTo(bar1Typ, 1);

    // Bar 2 cumulative calculation
    const bar2Typ = (sampleBars[1].high + sampleBars[1].low + sampleBars[1].close) / 3;
    const expectedVwap2 = (bar1Typ * 5000 + bar2Typ * 4000) / (5000 + 4000);
    expect(vwapData[1].value).toBeCloseTo(expectedVwap2, 1);
  });

  it("falls back to TWAP when in fallback mode or volume is 0", () => {
    const zeroVolBars: OHLCVBar[] = sampleBars.map((b) => ({ ...b, volume: 0 }));
    const twapData = computeCumulativeVWAP(zeroVolBars, true);

    expect(twapData.length).toBe(3);

    const b1 = (sampleBars[0].high + sampleBars[0].low + sampleBars[0].close) / 3;
    const b2 = (sampleBars[1].high + sampleBars[1].low + sampleBars[1].close) / 3;
    const expectedTwap2 = (b1 + b2) / 2;

    expect(twapData[1].value).toBeCloseTo(expectedTwap2, 1);
  });

  it("formats timestamps accurately in America/New_York (ET)", () => {
    // 2026-11-23T14:30:00.000Z corresponds to 09:30 AM EST
    const tsSec = Math.floor(new Date("2026-11-23T14:30:00.000Z").getTime() / 1000);

    const etTimeStr = formatETTime(tsSec);
    expect(etTimeStr).toBe("09:30");

    const etDateTimeStr = formatETDateTime(tsSec);
    expect(etDateTimeStr).toContain("09:30");
    expect(etDateTimeStr).toContain("ET");
    expect(etDateTimeStr).toContain("Nov");
  });

  it("detects passed economic news events correctly", () => {
    // 1. If actual figure is already reported, it is passed
    expect(isEventPassed("2026-11-23", "08:30 AM", true)).toBe(true);

    // 2. Event in the past (e.g. yesterday)
    expect(isEventPassed("2020-01-01", "08:30 AM", false)).toBe(true);

    // 3. Event far in the future
    expect(isEventPassed("2035-12-31", "10:00 AM", false)).toBe(false);
  });

  it("maps custom drawing coordinates cleanly between timestamps and logical indices (including future whitespace)", () => {
    const barTimes = [1000, 1900, 2800]; // 15m (900s) spacing
    const intervalSec = 900;

    // Exact bar match
    expect(timeSecToLogicalIndex(barTimes, intervalSec, 1900)).toBe(1);

    // Midpoint between bar 1 and bar 2 (e.g., 5m sub-bar mapped onto 15m chart)
    expect(timeSecToLogicalIndex(barTimes, intervalSec, 2350)).toBeCloseTo(1.5, 4);

    // Future whitespace beyond last bar (e.g., 2 bars to the right)
    expect(timeSecToLogicalIndex(barTimes, intervalSec, 4600)).toBeCloseTo(4.0, 4);
    expect(logicalIndexToTimeSec(barTimes, intervalSec, 4.0)).toBe(4600);

    // Drawing color palette contains all 4 colors
    expect(Object.keys(DRAWING_COLOR_PALETTE)).toEqual(["CYAN", "EMERALD", "ROSE", "AMBER"]);
  });
});
