import { describe, it, expect } from "vitest";
import { buildPlainEnglishBrief } from "../lib/market/plainEnglishBrief";
import { build12HourReplayFrames } from "../lib/market/replay";
import { getCMESessionInfo } from "../lib/market/sessionClock";
import { evaluateBiasAndRegime } from "../lib/market/regime";
import { generateTacticalPlaybook } from "../lib/market/playbook";
import { OHLCVBar, OpenBriefData, SessionMetrics, VolatilitySurface } from "../types/market";

function makeSyntheticBars(startMs: number, count: number, startPrice: number): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const ms = startMs + i * 15 * 60_000;
    const wave = Math.sin(i / 4) * 12 + (i % 3 === 0 ? -4 : 3);
    const open = Math.round(price * 100) / 100;
    const close = Math.round((open + wave) * 100) / 100;
    const high = Math.round((Math.max(open, close) + 8) * 100) / 100;
    const low = Math.round((Math.min(open, close) - 7) * 100) / 100;
    bars.push({
      timestamp: new Date(ms).toISOString(),
      open,
      high,
      low,
      close,
      volume: 1500 + i * 25,
    });
    price = close;
  }
  return bars;
}

describe("Whipsaw removal, Horizon Outlook sanity, and 12H Hourly Replay", () => {
  const anchorIso = "2026-11-24T04:30:00.000Z"; // 11:30 PM ET Nov 23
  const anchorDate = new Date(anchorIso);
  const bars = makeSyntheticBars(
    Date.parse("2026-11-22T23:00:00.000Z"), // Sunday Nov 22 18:00 ET
    118, // ~29.5 hours of 15m bars
    26050
  );
  const lastBar = bars[bars.length - 1];
  const spot = 25981.5;

  const sessionMetrics: SessionMetrics = {
    pdh: 26240,
    pdl: 25880,
    pdc: 26100,
    pdMid: 26060,
    onh: 26095,
    onl: 25905.25,
    onMid: 26000.13,
    asiaHigh: 26095,
    asiaLow: 25905.25,
    sessionVwap: 26010,
    globexVwap: 26010,
    priorDayRthVwap: 26090,
    rthSessionVwap: 26010,
    vwapCalculationMode: "VOLUME_WEIGHTED",
    htf50Retrace: 26040,
    htf618Retrace: 26000,
    htf705Retrace: 25960,
    htfImpulseDirection: "BEARISH",
    htfImpulseHigh: 26240,
    htfImpulseLow: 25840,
    expectedMove1SD: 160,
    expectedMoveStraddle: 110,
    upper1SD: 26141.5,
    lower1SD: 25821.5,
    upperStraddle: 26091.5,
    lowerStraddle: 25871.5,
    overnightRangeConsumedPercent: 75,
    atr14Daily: 240,
    atr15mIntraday: 28,
    atrOpen15m: 32,
    pdcSource: "CME_1600_SETTLEMENT",
    straddleCoveragePercent: 57.5,
    coverageLabel: "1x Straddle (~57.5% range coverage)",
    overnightRange: 189.75,
    overnightInventory: "BEARISH_IMBALANCE",
    inventoryPercent: 35,
    openingGap: -118.5,
    openingLocation: "INSIDE_LOWER_GLOBEX",
    targetTradeDate: "2026-11-24",
    priorTradeDate: "2026-11-23",
    globexStatus: "ACTIVE",
  };

  const volSurface: VolatilitySurface = {
    vxn: 28,
    vix: 25,
    vix3m: 24.27,
    vix9d: 26,
    vix1d: 25.5,
    vvix: 114,
    termRatio: 1.03,
    termStructureRegime: "BACKWARDATION (STRESS)",
    shortTermShockRatio: 1.04,
    isShortTermShock: false,
    vvixRegime: "HIGH TAIL / SHARP REVERSAL RISK (>=110)",
    realizedVolYZ20d: 24,
    realizedVolYZ10d: 26,
    realizedVolGK: 25,
    realizedVol5m: 31,
    vrp: -3,
    vrpRatio: 0.9,
    isNegativeVrp: true,
  };

  const gex = {
    netGammaRegime: "NEGATIVE_GAMMA" as const,
    totalNetGex: -100_000_000,
    totalCallGex: 200_000_000,
    totalPutGex: -300_000_000,
    zeroDteNetGex: -50_000_000,
    gammaFlipNq: spot, // Exact same price as current spot!
    callWallNq: 26150,
    putWallNq: 25850,
    topGammaStrikes: [],
    underlyingPrice: 520,
    nqSpotPrice: spot,
    basisRatio: spot / 520,
    source: "YF_QQQ_MODEL_BS" as const,
    disclaimer: "DELAYED OI-BASED GEX ESTIMATE (NOT LIVE DEALER INVENTORY)" as const,
    lastUpdated: anchorIso,
  };

  const keyLevels = [
    {
      id: "lvl-gf",
      name: "GEX Gamma Flip",
      shortName: "Gamma Flip",
      price: 25981.5,
      role: "EQUILIBRIUM" as const,
      timeframe: "VOLATILITY" as const,
      distancePoints: 0,
      distancePercent: 0,
      note: "Gamma Flip equals spot",
    },
    {
      id: "lvl-vwap",
      name: "Session VWAP",
      shortName: "Session VWAP",
      price: 26010,
      role: "RETRACE ZONE" as const,
      timeframe: "INTRADAY" as const,
      distancePoints: 28.5,
      distancePercent: 0.11,
      note: "Session VWAP",
    },
    {
      id: "lvl-onl",
      name: "Overnight Low",
      shortName: "ONL",
      price: 25905.25,
      role: "LIQUIDITY POOL" as const,
      timeframe: "GLOBEX" as const,
      distancePoints: -76.25,
      distancePercent: -0.29,
      note: "Downside target",
    },
  ];

  const vixIndicator = {
    name: "VIX",
    symbol: "^VIX",
    value: 25,
    change: 1.2,
    changePercent: 5,
    regime: "ELEVATED",
    note: "Elevated VIX",
    source: "Yahoo",
    status: "DELAYED" as const,
  };

  const bias = evaluateBiasAndRegime(
    spot,
    sessionMetrics,
    vixIndicator,
    false,
    volSurface,
    undefined,
    gex
  );

  const sessionInfo = getCMESessionInfo(anchorDate);
  const tacticalPlan = generateTacticalPlaybook(spot, sessionMetrics, bias, {
    isDelayed: true,
    economicEvents: [],
    sessionInfo,
    intradayBars: bars,
    keyLevels,
  });

  const baseBrief: OpenBriefData = {
    tradeDate: "2026-11-24",
    targetTradeDate: "2026-11-24",
    priorTradeDate: "2026-11-23",
    sessionInfo,
    generatedAt: anchorIso,
    instrument: "NQ",
    underlyingAsset: "NQ=F",
    quote: {
      symbol: "NQ=F",
      displaySymbol: "NQ",
      price: spot,
      change: -290,
      changePercent: -1.12,
      high: 26120,
      low: 25905.25,
      open: 26080,
      previousClose: 26100,
      volume: 55000,
      timestamp: lastBar.timestamp,
      source: "Yahoo Finance (CME Globex)",
      status: "DELAYED",
      stalenessSeconds: 600,
    },
    sessionMetrics,
    keyLevels,
    bias,
    tacticalPlan,
    macro: {
      vix: vixIndicator,
      us10y: {
        name: "US 10Y",
        symbol: "^TNX",
        value: 4.3,
        change: 0.02,
        changePercent: 0.4,
        regime: "NEUTRAL",
        note: "Steady",
        source: "Yahoo",
        status: "DELAYED",
      },
      dxy: {
        name: "DXY",
        symbol: "DX-Y.NYB",
        value: 106.5,
        change: 0.1,
        changePercent: 0.1,
        regime: "NEUTRAL",
        note: "Steady",
        source: "Yahoo",
        status: "DELAYED",
      },
      volatilitySurface: volSurface,
      megaCaps: [],
      events: [],
      dealerGammaTilt: {
        regime: "NEGATIVE_GAMMA",
        source: "DERIVED_HEURISTIC",
        note: "Test",
      },
    },
    dataSource: {
      providerName: "Yahoo Finance (CME Globex)",
      quoteStatus: "DELAYED",
      levelsStatus: "DERIVED",
      lastUpdated: lastBar.timestamp,
      cacheExpiresAt: anchorIso,
      notice: "Test",
    },
    intradayBars: bars,
    gex,
  };

  it("removes whipsaw wording in favor of plain-English risk explanations and supports both pullback and direct dump/pump predictions", () => {
    const highVolOut = buildPlainEnglishBrief(baseBrief, anchorDate);
    expect(JSON.stringify(highVolOut).toLowerCase()).not.toContain("whipsaw");
    expect(JSON.stringify(highVolOut).toLowerCase()).not.toContain("wipsaw");
    expect(highVolOut.verdictTitle).not.toContain("Whipsaw");

    // 1. Moderate bearish pullback setup (+Gamma, -2 score): never picks spot Gamma Flip as retrace
    const bearishPullbackBrief: OpenBriefData = {
      ...baseBrief,
      bias: {
        ...baseBrief.bias,
        verdict: "CONTINUATION FAVORED (BEARISH)",
        regimeRiskMultiplier: 0.5,
      },
      gex: {
        ...baseBrief.gex!,
        netGammaRegime: "POSITIVE_GAMMA",
      },
    };
    const bearishPullbackOut = buildPlainEnglishBrief(bearishPullbackBrief, anchorDate);
    const h1Pullback = bearishPullbackOut.horizonPredictions.find((p) => p.horizon === "1H");
    expect(h1Pullback).toBeDefined();
    expect(h1Pullback?.summary).not.toContain("25,981.50 (Gamma Flip)");
    expect(h1Pullback?.summary).toContain("26,000.13 (ON Mid)");

    // 2. Strong bearish / runaway Open-Drive -> predicts direct dump without deep bounce
    const directDumpBrief: OpenBriefData = {
      ...bearishPullbackBrief,
      tacticalPlan: {
        ...bearishPullbackBrief.tacticalPlan,
        retraceAnalysis: {
          ...bearishPullbackBrief.tacticalPlan.retraceAnalysis,
          archetype: "OPEN-DRIVE (RUNAWAY / SHALLOW RETRACE ONLY)",
          isRetraceProbable: false,
        },
      },
    };
    const directDumpOut = buildPlainEnglishBrief(directDumpBrief, anchorDate);
    const h1Dump = directDumpOut.horizonPredictions.find((p) => p.horizon === "1H");
    expect(h1Dump?.summary.toLowerCase()).toContain("direct dump");

    // 3. Strong bullish / runaway Open-Drive -> predicts direct pump without deep pullback
    const directPumpBrief: OpenBriefData = {
      ...directDumpBrief,
      bias: {
        ...directDumpBrief.bias,
        verdict: "CONTINUATION FAVORED (BULLISH)",
      },
    };
    const directPumpOut = buildPlainEnglishBrief(directPumpBrief, anchorDate);
    const h1Pump = directPumpOut.horizonPredictions.find((p) => p.horizon === "1H");
    expect(h1Pump?.summary.toLowerCase()).toContain("direct pump");
  });

  it("builds up to 12 causal hour-by-hour replay frames without lookahead leakage and computes realized outcomes", () => {
    const frames = build12HourReplayFrames(baseBrief, 12);
    expect(frames.length).toBeGreaterThanOrEqual(8);
    expect(frames.length).toBeLessThanOrEqual(12);

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      if (i > 0) {
        expect(f.anchorTimeMs).toBeGreaterThan(frames[i - 1].anchorTimeMs);
      }
      expect(f.replayBrief.dataSource.quoteStatus).toBe("DERIVED");
      expect(f.replayBrief.intradayBars?.length).toBeGreaterThan(0);
      for (const bar of f.replayBrief.intradayBars || []) {
        expect(Date.parse(bar.timestamp)).toBeLessThan(f.anchorTimeMs);
      }
      const lastSlice = f.replayBrief.intradayBars![f.replayBrief.intradayBars!.length - 1];
      expect(f.replayBrief.quote.price).toBe(lastSlice.close);
      expect(f.plainBrief.horizonPredictions).toHaveLength(3);
    }

    const earlyFrame = frames[0];
    expect(earlyFrame.outcome1h).not.toBeNull();
    expect(typeof earlyFrame.outcome1h?.deltaPts).toBe("number");
  });
});
