import { describe, it, expect } from "vitest";
import { computeHTFFibonacci } from "../lib/market/math";
import { OHLCVBar } from "../types/market";

describe("HTF Fibonacci Retracement Engine", () => {
  it("computes bullish impulse retracements correctly when low precedes high", () => {
    // 5 daily bars where low is on day 1 (20,000) and high is on day 4 (21,000)
    const bars: OHLCVBar[] = [
      {
        timestamp: "2026-11-17T21:00:00Z",
        open: 20100,
        high: 20250,
        low: 20000, // Swing low
        close: 20200,
        volume: 100000
      },
      {
        timestamp: "2026-11-18T21:00:00Z",
        open: 20200,
        high: 20500,
        low: 20180,
        close: 20450,
        volume: 120000
      },
      {
        timestamp: "2026-11-19T21:00:00Z",
        open: 20450,
        high: 20750,
        low: 20400,
        close: 20700,
        volume: 130000
      },
      {
        timestamp: "2026-11-20T21:00:00Z",
        open: 20700,
        high: 21000, // Swing high
        low: 20650,
        close: 20950,
        volume: 140000
      },
      {
        timestamp: "2026-11-21T21:00:00Z",
        open: 20950,
        high: 20980,
        low: 20700,
        close: 20750,
        volume: 90000
      }
    ];

    const res = computeHTFFibonacci(bars);

    expect(res.impulseDirection).toBe("BULLISH");
    expect(res.swingHigh).toBe(21000);
    expect(res.swingLow).toBe(20000);
    expect(res.range).toBe(1000);

    // Bullish retrace pulls down from 21000 into discount:
    // 0.382: 21000 - 382 = 20618
    expect(res.fib382).toBe(20618);
    // 0.500: 21000 - 500 = 20500
    expect(res.fib500).toBe(20500);
    // 0.618: 21000 - 618 = 20382
    expect(res.fib618).toBe(20382);
    // 0.705: 21000 - 705 = 20295
    expect(res.fib705).toBe(20295);
  });

  it("computes bearish impulse retracements correctly when high precedes low", () => {
    // 5 daily bars where high is on day 1 (21,500) and low is on day 4 (20,500)
    const bars: OHLCVBar[] = [
      {
        timestamp: "2026-11-17T21:00:00Z",
        open: 21400,
        high: 21500, // Swing high
        low: 21250,
        close: 21300,
        volume: 150000
      },
      {
        timestamp: "2026-11-18T21:00:00Z",
        open: 21300,
        high: 21350,
        low: 20950,
        close: 21000,
        volume: 160000
      },
      {
        timestamp: "2026-11-19T21:00:00Z",
        open: 21000,
        high: 21100,
        low: 20750,
        close: 20800,
        volume: 140000
      },
      {
        timestamp: "2026-11-20T21:00:00Z",
        open: 20800,
        high: 20850,
        low: 20500, // Swing low
        close: 20550,
        volume: 180000
      },
      {
        timestamp: "2026-11-21T21:00:00Z",
        open: 20550,
        high: 20700,
        low: 20520,
        close: 20680,
        volume: 95000
      }
    ];

    const res = computeHTFFibonacci(bars);

    expect(res.impulseDirection).toBe("BEARISH");
    expect(res.swingHigh).toBe(21500);
    expect(res.swingLow).toBe(20500);
    expect(res.range).toBe(1000);

    // Bearish retrace bounces up from 20500 into premium:
    // 0.382: 20500 + 382 = 20882
    expect(res.fib382).toBe(20882);
    // 0.500: 20500 + 500 = 21000
    expect(res.fib500).toBe(21000);
    // 0.618: 20500 + 618 = 21118
    expect(res.fib618).toBe(21118);
    // 0.705: 20500 + 705 = 21205
    expect(res.fib705).toBe(21205);
  });
});
