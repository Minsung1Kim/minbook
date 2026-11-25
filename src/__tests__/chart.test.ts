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
  DRAWING_COLOR_PALETTE,
  hitTestScreenBoxes,
  applyDrawingDrag,
  applyDrawingDragLogical,
  ChartDrawing
} from "../components/chart/primitives";
import { aggregate1hTo4hBars } from "../lib/market/yahoo";
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

  it("supports hit-testing, dragging, and corner resizing of chart drawings", () => {
    const line: ChartDrawing = { id: "d-line", type: "hline", price: 26250, color: "CYAN" };
    const rect: ChartDrawing = {
      id: "d-rect",
      type: "rect",
      timeSec1: 1000,
      price1: 26300,
      timeSec2: 1900,
      price2: 26260,
      color: "EMERALD"
    };
    const note: ChartDrawing = {
      id: "d-note",
      type: "text",
      timeSec: 1500,
      price: 26320,
      text: "Sweep",
      color: "AMBER"
    };

    const boxes = [
      { drawing: line, y1: 220 },
      { drawing: rect, x1: 100, y1: 120, x2: 200, y2: 180 },
      { drawing: note, x1: 300, y1: 80 }
    ];

    // Corner resize hit on SE corner of rect
    expect(hitTestScreenBoxes(202, 179, boxes)).toEqual({
      id: "d-rect",
      type: "rect",
      mode: "SE"
    });
    // Body move hit inside rect
    expect(hitTestScreenBoxes(150, 150, boxes)).toEqual({
      id: "d-rect",
      type: "rect",
      mode: "MOVE"
    });
    // Line hit within tolerance
    expect(hitTestScreenBoxes(50, 224, boxes)).toEqual({
      id: "d-line",
      type: "hline",
      mode: "MOVE"
    });
    // Empty space returns null
    expect(hitTestScreenBoxes(40, 40, boxes)).toBeNull();

    // Drag line (+12.13 -> snapped to 0.25 -> +12.25)
    const movedLine = applyDrawingDrag(line, "MOVE", 0, 12.13, 0.25);
    expect(movedLine.type === "hline" && movedLine.price).toBe(26262.25);

    // Resize SE corner of rect
    const resizedRect = applyDrawingDrag(rect, "SE", 900, -10, 0.25);
    expect(resizedRect.type).toBe("rect");
    if (resizedRect.type === "rect") {
      expect(resizedRect.timeSec2).toBe(2800);
      expect(resizedRect.price2).toBe(26250);
    }

    // Edge handles (N, S, E, W) hit detection
    expect(hitTestScreenBoxes(150, 121, boxes)).toEqual({
      id: "d-rect",
      type: "rect",
      mode: "N"
    });
    expect(hitTestScreenBoxes(150, 179, boxes)).toEqual({
      id: "d-rect",
      type: "rect",
      mode: "S"
    });
    expect(hitTestScreenBoxes(101, 150, boxes)).toEqual({
      id: "d-rect",
      type: "rect",
      mode: "W"
    });
    expect(hitTestScreenBoxes(199, 150, boxes)).toEqual({
      id: "d-rect",
      type: "rect",
      mode: "E"
    });
  });

  it("preserves rect bar-width across CME session gaps using applyDrawingDragLogical", () => {
    // 1h bars with a 49-hour weekend gap between index 1 (Fri 16:00 ET) and index 2 (Sun 18:00 ET)
    const barsTimes = [
      1000,
      4600,
      181000,
      184600,
      188200
    ];
    const rect: ChartDrawing = {
      id: "r-gap",
      type: "rect",
      timeSec1: 1000, // bar index 0
      price1: 26300,
      timeSec2: 4600, // bar index 1 (1 bar wide)
      price2: 26250,
      color: "AMBER"
    };

    // Move right by +2 bars across the weekend gap
    const movedAcrossGap = applyDrawingDragLogical(rect, "MOVE", 2, 10, barsTimes, 3600, 0.25);
    expect(movedAcrossGap.type).toBe("rect");
    if (movedAcrossGap.type === "rect") {
      expect(movedAcrossGap.timeSec1).toBe(181000); // index 2
      expect(movedAcrossGap.timeSec2).toBe(184600); // index 3 (still 1 bar wide)
      expect(movedAcrossGap.price1).toBe(26310);
      expect(movedAcrossGap.price2).toBe(26260);
    }

    // Resize East edge by +1 bar while keeping West edge anchored
    const widened = applyDrawingDragLogical(movedAcrossGap, "E", 1, 0, barsTimes, 3600, 0.25);
    expect(widened.type).toBe("rect");
    if (widened.type === "rect") {
      expect(widened.timeSec1).toBe(181000);
      expect(widened.timeSec2).toBe(188200); // index 4
    }
  });

  it("aggregates 1h bars into CME Globex 18:00 ET aligned 4h candles", () => {
    // 2026-11-23 is EST (UTC-5): 18:00 ET = 23:00 UTC (Nov 22), 21:00 ET = 02:00 UTC (Nov 23)
    const hourlyBars: OHLCVBar[] = [
      { timestamp: "2026-11-22T23:00:00.000Z", open: 26000, high: 26020, low: 25990, close: 26010, volume: 100 },
      { timestamp: "2026-11-23T00:00:00.000Z", open: 26010, high: 26050, low: 26005, close: 26040, volume: 150 },
      { timestamp: "2026-11-23T01:00:00.000Z", open: 26040, high: 26045, low: 26015, close: 26025, volume: 120 },
      // Next 4h bucket starts at 22:00 ET (03:00 UTC)
      { timestamp: "2026-11-23T03:00:00.000Z", open: 26025, high: 26060, low: 26020, close: 26055, volume: 200 },
      { timestamp: "2026-11-23T04:00:00.000Z", open: 26055, high: 26080, low: 26045, close: 26070, volume: 180 }
    ];

    const bars4h = aggregate1hTo4hBars(hourlyBars);
    expect(bars4h).toHaveLength(2);
    expect(bars4h[0]).toEqual({
      timestamp: "2026-11-22T23:00:00.000Z",
      open: 26000,
      high: 26050,
      low: 25990,
      close: 26025,
      volume: 370
    });
    expect(bars4h[1]).toEqual({
      timestamp: "2026-11-23T03:00:00.000Z",
      open: 26025,
      high: 26080,
      low: 26020,
      close: 26070,
      volume: 380
    });
  });
});
