import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { parsePnlFromText } from "../lib/journal/pnlOverlayReader";
import { buildPlainEnglishBrief } from "../lib/market/plainEnglishBrief";
import {
  SqliteCalibrationRepository,
  isLegacySyntheticSeedPrediction
} from "../lib/calibration/store";
import {
  computePredictionGrade,
  mapScorecardToFactorKeys
} from "../lib/calibration/grader";
import { computeCalibrationSummary } from "../lib/calibration/optimizer";
import { OpenBriefData, OHLCVBar } from "../types/market";
import { DailyPrediction } from "../types/calibration";

describe("Revamped MinBook Features & Audit Integrity", () => {
  describe("1. Screenshot Green/Red P&L Overlay Parser", () => {
    it("parses green profit overlay strings accurately", () => {
      const res1 = parsePnlFromText("+$420.00", "GREEN");
      expect(res1?.pnlDollars).toBe(420);
      expect(res1?.overlayColor).toBe("GREEN");
      expect(res1?.confidence).toBe("HIGH");

      const res2 = parsePnlFromText("Open P&L +$1,250.50 (+2.15%)", "GREEN");
      expect(res2?.pnlDollars).toBe(1250.5);
      expect(res2?.overlayColor).toBe("GREEN");
    });

    it("parses red loss overlay strings including parentheses and missing minus sign", () => {
      const res1 = parsePnlFromText("-$250.00", "RED");
      expect(res1?.pnlDollars).toBe(-250);
      expect(res1?.overlayColor).toBe("RED");

      const res2 = parsePnlFromText("($185.75)", "RED");
      expect(res2?.pnlDollars).toBe(-185.75);
      expect(res2?.overlayColor).toBe("RED");

      // If OCR drops the '-' on a confirmed RED overlay, colorHint enforces negative sign
      const res3 = parsePnlFromText("$310.00", "RED");
      expect(res3?.pnlDollars).toBe(-310);
      expect(res3?.overlayColor).toBe("RED");
    });

    it("ignores NQ index prices, percentages, and timestamps", () => {
      const noisy = "09:34:15 26276.75 +1.25% Realized: +$540.00";
      const res = parsePnlFromText(noisy, "GREEN");
      expect(res?.pnlDollars).toBe(540);
    });
  });

  describe("2. Plain-English Quant Bias, Bounce Areas & Target Areas", () => {
    const sampleBrief: OpenBriefData = {
      tradeDate: "2026-11-24",
      generatedAt: "2026-11-24T14:25:00.000Z",
      instrument: "NQ",
      underlyingAsset: "NQ=F",
      quote: {
        symbol: "NQ=F",
        displaySymbol: "NQ",
        price: 26300,
        change: 80,
        changePercent: 0.3,
        high: 26320,
        low: 26180,
        open: 26220,
        previousClose: 26220,
        volume: 100000,
        timestamp: "2026-11-24T14:25:00.000Z",
        source: "Yahoo Finance",
        status: "DELAYED",
        stalenessSeconds: 900
      },
      sessionMetrics: {
        pdh: 26420,
        pdl: 26100,
        pdc: 26220,
        pdMid: 26260,
        onh: 26350,
        onl: 26180,
        onMid: 26265,
        sessionVwap: 26270,
        globexVwap: 26270,
        priorDayRthVwap: 26240,
        rthSessionVwap: 26270,
        vwapCalculationMode: "VOLUME_WEIGHTED",
        htf50Retrace: 26250,
        htf618Retrace: 26210,
        htf705Retrace: 26175,
        htfImpulseDirection: "BULLISH",
        htfImpulseHigh: 26450,
        htfImpulseLow: 26050,
        expectedMove1SD: 220,
        expectedMoveStraddle: 175,
        upper1SD: 26440,
        lower1SD: 26000,
        upperStraddle: 26395,
        lowerStraddle: 26045,
        overnightRangeConsumedPercent: 48,
        atr14Daily: 250,
        atr15mIntraday: 28,
        atrOpen15m: 30,
        overnightRange: 170,
        overnightInventory: "BULLISH_IMBALANCE",
        inventoryPercent: 72,
        openingGap: 80,
        openingLocation: "INSIDE_UPPER_GLOBEX"
      },
      keyLevels: [
        {
          id: "lvl-vwap",
          name: "Session VWAP",
          shortName: "Session VWAP",
          price: 26270,
          role: "RETRACE ZONE",
          distancePoints: -30,
          distancePercent: -0.11,
          timeframe: "INTRADAY",
          note: "VWAP"
        },
        {
          id: "lvl-onmid",
          name: "Overnight Midpoint",
          shortName: "ON Mid",
          price: 26265,
          role: "RETRACE ZONE",
          distancePoints: -35,
          distancePercent: -0.13,
          timeframe: "GLOBEX",
          note: "ON Mid"
        },
        {
          id: "lvl-pdc",
          name: "Prior Day Close",
          shortName: "PDC",
          price: 26220,
          role: "EQUILIBRIUM",
          distancePoints: -80,
          distancePercent: -0.3,
          timeframe: "DAILY",
          note: "PDC"
        },
        {
          id: "lvl-onh",
          name: "Overnight High",
          shortName: "ONH",
          price: 26350,
          role: "TARGET",
          distancePoints: 50,
          distancePercent: 0.19,
          timeframe: "GLOBEX",
          note: "ONH"
        },
        {
          id: "lvl-pdh",
          name: "Prior Day High",
          shortName: "PDH",
          price: 26420,
          role: "TARGET",
          distancePoints: 120,
          distancePercent: 0.46,
          timeframe: "DAILY",
          note: "PDH"
        }
      ],
      bias: {
        verdict: "CONTINUATION FAVORED (BULLISH)",
        confidence: "HIGH",
        htfTrend: "BULLISH",
        chopRisk: "LOW",
        regimeRiskMultiplier: 1.0,
        summary: "Bullish",
        drivers: [],
        risks: [],
        idealRetraceZone: {
          startPrice: 26265,
          endPrice: 26275,
          description: "VWAP/ON Mid"
        }
      },
      tacticalPlan: {
        singleTradeDirective: "Buy pullback",
        trader5Answers: {} as any,
        retraceAnalysis: {} as any,
        scenarios: [],
        sessionPhase: "PRE_MARKET_LOCK",
        executionSubPhase: "PRE_BELL",
        isDelayedFeedWarningActive: false,
        delayedFeedBannerText: "",
        layer2DirectionalScore: {
          signals: [
            { id: "compositeLocation", name: "Location", score: 1, impact: "BULLISH", weight: 1, detail: "" },
            { id: "smtBreadth", name: "SMT", score: 1, impact: "BULLISH", weight: 1, detail: "" },
            { id: "macroImpulse", name: "Macro", score: 1, impact: "BULLISH", weight: 1, detail: "" },
            { id: "openingFlow", name: "Flow", score: 0, impact: "NEUTRAL", weight: 1, detail: "" }
          ],
          totalScore: 3,
          direction: "BULLISH",
          verdict: "CONTINUATION FAVORED (BULLISH)",
          confidence: "HIGH",
          summary: ""
        },
        timelineGuide: {} as any,
        vwapPlaybook: {} as any
      },
      macro: {
        vix: { symbol: "^VIX", name: "VIX", value: 18, change: -0.5, status: "LIVE", source: "YF", regime: "NORMAL", note: "" },
        us10y: { symbol: "^TNX", name: "10Y", value: 4.2, change: -0.02, status: "LIVE", source: "YF", regime: "NORMAL", note: "" },
        dxy: { symbol: "DX-Y.NYB", name: "DXY", value: 105, change: -0.1, status: "LIVE", source: "YF", regime: "NORMAL", note: "" },
        megaCaps: [],
        events: [],
        dealerGammaTilt: { regime: "POSITIVE", source: "DERIVED_HEURISTIC", note: "" }
      },
      dataSource: {
        providerName: "Yahoo Finance",
        quoteStatus: "DELAYED",
        levelsStatus: "DERIVED",
        lastUpdated: "2026-11-24T14:25:00.000Z",
        cacheExpiresAt: "2026-11-24T14:26:00.000Z",
        notice: ""
      }
    };

    it("produces plain-English quant facts, bounce areas, and target areas", () => {
      const result = buildPlainEnglishBrief(sampleBrief);
      expect(result.direction).toBe("BULLISH");
      expect(result.scoreSummary).toContain("3 of 4");
      expect(result.quantFacts.length).toBeGreaterThanOrEqual(3);
      expect(result.bounceAreas.some((b) => b.price === 26270)).toBe(true);
      expect(result.targetAreas.some((t) => t.price === 26350)).toBe(true);
      expect(result.targetAreas.every((t) => t.price > sampleBrief.quote.price)).toBe(true);
    });
  });

  describe("3. Clean & True Audit Invariants", () => {
    it("never seeds fake synthetic predictions on an empty audit database", async () => {
      const memoryDb = new DatabaseSync(":memory:");
      const repo = new SqliteCalibrationRepository(memoryDb);

      const summary = await computeCalibrationSummary(repo);
      expect(summary.totalPredictions).toBe(0);
      expect(summary.gradedSessions).toBe(0);
      expect(summary.history.length).toBe(0);
      expect(summary.overallBiasAccuracy).toBe(0);
    });

    it("identifies pre-launch synthetic seed rows while keeping real frozen predictions", () => {
      expect(isLegacySyntheticSeedPrediction("2026-11-20", "2026-11-20T09:25:00.000Z")).toBe(true);
      expect(isLegacySyntheticSeedPrediction("2026-11-24", "2026-11-24T14:32:03.834Z")).toBe(false);
      expect(isLegacySyntheticSeedPrediction("2026-11-25", "2026-11-25T09:25:00.000Z")).toBe(false);
    });

    it("maps all 4 orthogonal Layer 2 signals including openingFlow", () => {
      const mapped = mapScorecardToFactorKeys([
        { factor: "Composite HTF / Auction Location", score: 1 },
        { factor: "Cross-Index SMT + Breadth", score: -1 },
        { factor: "23h Macro Impulse via ZN/DX", score: 1 },
        { factor: "Opening Flow (VWWR)", score: 1 }
      ]);
      expect(mapped.compositeLocation).toBe(1);
      expect(mapped.smtBreadth).toBe(-1);
      expect(mapped.macroImpulse).toBe(1);
      expect(mapped.openingFlow).toBe(1);
    });

    it("grades STAND ASIDE / HIGH VOL as TRUE when a violent two-way whipsaw occurs", () => {
      const cautionPred: DailyPrediction = {
        id: "pred_2026-11-24",
        targetTradeDate: "2026-11-24",
        frozenAtEt: "2026-11-24T14:32:03.834Z",
        modelVersion: "v1.0",
        spotAtFreeze: 26276.75,
        biasVerdict: "STAND ASIDE / HIGH VOL",
        confidenceTier: "HIGH",
        archetype: "OPEN-TEST-DRIVE",
        stopHuntLikelihood: "MODERATE",
        stopHuntTargetLevel: null,
        primaryRetraceLevels: { vwap: 26592, onMid: 26589, pdc: 26808, htf50: 26407, htf618: 26744 },
        liquidityDraws: { onh: 27036, onl: 26142, pdh: 27137, pdl: 25426 },
        regimeInputs: { factorScores: {}, atr15m: 35 },
        status: "PENDING_GRADE",
        createdAt: "2026-11-24T14:32:03.834Z"
      };

      // Open 26364, flushes -172 pts to 26192, rips +145 pts to 26509 -> classic two-way whipsaw
      const bars: OHLCVBar[] = [
        { timestamp: "2026-11-24T14:30:00.000Z", open: 26364, high: 26380, low: 26192, close: 26250, volume: 5000 },
        { timestamp: "2026-11-24T14:40:00.000Z", open: 26250, high: 26509, low: 26240, close: 26480, volume: 6000 },
        { timestamp: "2026-11-24T15:00:00.000Z", open: 26480, high: 26490, low: 26410, close: 26431, volume: 4000 }
      ];

      const grade = computePredictionGrade(cautionPred, bars, 35);
      expect(grade).not.toBeNull();
      expect(grade?.biasCorrect).toBe(true);
      expect(grade?.chopWarningCorrect).toBe(true);
    });
  });
});
