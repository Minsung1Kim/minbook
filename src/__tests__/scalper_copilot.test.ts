import { describe, it, expect } from "vitest";
import {
  computeExpectedMove,
  computeDiurnalExpectedMove,
  diurnalVolatilityClock,
} from "../lib/market/math";
import {
  computeBrownianTouchProbability,
  computeDoubleBarrierHitProbability,
  computeVolatilityScaledStopRange,
} from "../lib/execution/ltfExecution";
import { computeDrawdownExitPolicy, computeDetailedRiskPlan } from "../lib/risk/sizing";
import { PROP_PRESETS } from "../lib/risk/propProfile";
import { computeScalpVerdict } from "../lib/chat/screenshot-quant";
import {
  computeJournalQueryFromTrades,
  parseJournalCsvImport,
  parseJournalJsonImport,
  queryPersonalJournal,
} from "../lib/chat/journal-ingest";
import {
  buildDeterministicAssistantReply,
  getGoogleThinkingOptions,
  isConversationalAssistantQuery,
  isModelFallbackEligibleError,
  isRateLimitError,
  renderScalperCardDeterministic,
  resolveChatMode,
  resolveImageInputForModel,
} from "../lib/chat/scalp-pipeline";
import { getUpcomingCalendarSchedule } from "../lib/market/sessionClock";
import { buildSystemPromptFromContext } from "../lib/chat/build-market-context";
import { clearScalpJournalTrades, upsertScalpJournalTrades } from "../lib/db";
import {
  ChatMarketContextSnapshot,
  ExtractedChartState,
  ScalpJournalTrade,
} from "../types/chat";

function makeSnapshot(overrides?: Partial<ChatMarketContextSnapshot>): ChatMarketContextSnapshot {
  const base: ChatMarketContextSnapshot = {
    capturedAt: new Date().toISOString(),
    instrument: "MNQ",
    underlyingAsset: "MNQ=F",
    quote: {
      price: 25150.0,
      change: -25.0,
      changePercent: -0.1,
      high: 25220.0,
      low: 25100.0,
      open: 25175.0,
      previousClose: 25175.0,
      source: "Yahoo Finance",
      timestamp: new Date().toISOString(),
      status: "DELAYED",
      stalenessSeconds: 30,
      stalenessBadge: "DELAYED",
    },
    session: {
      activeSession: "NY_AM",
      activeSessionLabel: "NY AM Open",
      phase: "NY_OPEN_WINDOW",
      targetTradeDate: "2026-11-25",
      priorTradeDate: "2026-11-24",
      isMarketOpen: true,
      countdown: "00:15:00",
    },
    regime: {
      biasVerdict: "CONTINUATION FAVORED (BULLISH)",
      confidence: "MODERATE",
      htfTrend: "BULLISH",
      chopRisk: "LOW",
      riskMultiplier: 1.0,
      summary: "Bullish continuation above PDC.",
      singleTradeDirective: "Retrace long into VWAP / ON Mid.",
      archetype: "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)",
      activeVetoes: [],
      vwapMode: "VOLUME_WEIGHTED",
      expectedMoveStraddle: 180,
      expectedMove1SD: 225,
      atrOpen15m: 45,
      overnightInventory: "BALANCED",
      inventoryPercent: 55,
    },
    volatilityAndMacro: {
      vxn: 21.0,
      vix: 17.5,
      vix3m: 19.2,
      termRatio: 0.91,
      termStructureRegime: "CONTANGO (NORMAL)",
      vvix: 92,
      vrpRatio: 1.18,
      isNegativeVrp: false,
      macroCorrelationRegime: "DECOUPLED / NEUTRAL",
      rateSource: "CME_ZN_FUTURES_23H",
      dxyPrice: 103.5,
      dxyPercentChange: 0.05,
    },
    gex: {
      available: true,
      netGammaRegime: "NEGATIVE_GAMMA",
      gammaFlipNq: 25050,
      callWallNq: 25350,
      putWallNq: 24950,
      source: "CBOE_NDX_DELAYED",
      lastUpdated: new Date().toISOString(),
      disclaimer: "DELAYED OI-BASED GEX ESTIMATE",
    },
    smt: {
      hasDivergence: false,
      divergenceType: "NONE (SYNCED)",
      direction: "NEUTRAL",
      notes: "Synced",
    },
    footprint: {
      available: true,
      sessionCvd: 1200,
      rthCvd: 450,
      lastUpdated: new Date().toISOString(),
      disclaimer: "1m derived proxy",
    },
    keyLevels: [
      {
        name: "Session VWAP",
        shortName: "VWAP",
        price: 25140.0,
        distancePoints: -10.0,
        role: "RETRACE ZONE",
        timeframe: "INTRADAY",
        source: "Yahoo Finance",
        timestamp: new Date().toISOString(),
        staleness: "DELAYED",
      },
      {
        name: "Overnight High",
        shortName: "ONH",
        price: 25240.0,
        distancePoints: 90.0,
        role: "LIQUIDITY POOL",
        timeframe: "GLOBEX",
        source: "Yahoo Finance",
        timestamp: new Date().toISOString(),
        staleness: "DELAYED",
      },
      {
        name: "Overnight Mid",
        shortName: "ON Mid",
        price: 25120.0,
        distancePoints: -30.0,
        role: "EQUILIBRIUM",
        timeframe: "GLOBEX",
        source: "Yahoo Finance",
        timestamp: new Date().toISOString(),
        staleness: "DELAYED",
      },
      {
        name: "Prior Day Close",
        shortName: "PDC",
        price: 25175.0,
        distancePoints: 25.0,
        role: "EQUILIBRIUM",
        timeframe: "DAILY",
        source: "Yahoo Finance",
        timestamp: new Date().toISOString(),
        staleness: "DELAYED",
      },
    ],
    journal: {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRatePercent: 0,
      totalPnlDollars: 0,
      avgMaeWinningR: 0,
      recentTrades: [],
    },
    honestyNotice: "15m delayed feed.",
  };

  return {
    ...base,
    ...overrides,
    quote: { ...base.quote, ...(overrides?.quote || {}) },
    regime: { ...base.regime, ...(overrides?.regime || {}) },
    gex: { ...base.gex, ...(overrides?.gex || {}) },
  };
}

describe("Scalper Co-Pilot Verification Gate", () => {
  describe("1. Double-Barrier Probability Sanity", () => {
    it("is strictly less than unconstrained Brownian touch under zero drift, and strictly increases with positive drift", () => {
      const atrOpen15m = 60;
      const tpPts = 18;
      const slPts = 14;

      for (const horizon of [5, 10, 15] as const) {
        const unconstrained = computeBrownianTouchProbability(tpPts, horizon, atrOpen15m);
        const zeroDriftDb = computeDoubleBarrierHitProbability({
          tpPts,
          slPts,
          horizonMinutes: horizon,
          atrOpen15m,
          driftPtsPerMin: 0,
        });
        const positiveDriftDb = computeDoubleBarrierHitProbability({
          tpPts,
          slPts,
          horizonMinutes: horizon,
          atrOpen15m,
          driftPtsPerMin: 0.6,
        });

        expect(zeroDriftDb).toBeGreaterThan(0);
        expect(zeroDriftDb).toBeLessThan(unconstrained);
        expect(positiveDriftDb).toBeGreaterThan(zeroDriftDb);
        expect(positiveDriftDb).toBeLessThanOrEqual(1);
      }
    });

    it("forces zero drift on CAUTION regimes inside computeScalpVerdict", () => {
      const chartState: ExtractedChartState = {
        instrument: "MNQ",
        liveSpot: 25150,
        timeframe: "1m",
        orderState: "MARKET_ENTRY_NOW",
        direction: "LONG",
        entryPx: 25150,
        entryZoneLow: null,
        entryZoneHigh: null,
        stopPx: 25136,
        tp1Px: 25170,
        tp2Px: 25190,
        contracts: 2,
        detectedSetupArchetype: "SWEEP_MSS_REVERSAL",
        visibleKeyLevels: [],
      };

      const cautionSnap = makeSnapshot({
        regime: {
          ...makeSnapshot().regime,
          biasVerdict: "CAUTION / CHOP RISK",
        },
      });
      const bullSnap = makeSnapshot({
        regime: {
          ...makeSnapshot().regime,
          biasVerdict: "CONTINUATION FAVORED (BULLISH)",
        },
      });

      const cautionVerdict = computeScalpVerdict(chartState, cautionSnap, {
        accountDrawdownMode: "INTRADAY_UNREALIZED",
        currentMinuteET: 9 * 60 + 38,
      });
      const bullVerdict = computeScalpVerdict(chartState, bullSnap, {
        accountDrawdownMode: "INTRADAY_UNREALIZED",
        currentMinuteET: 9 * 60 + 38,
      });

      expect(cautionVerdict.doubleBarrierOdds?.driftPtsPerMin).toBe(0);
      expect(bullVerdict.doubleBarrierOdds?.driftPtsPerMin).toBeGreaterThan(0);
      expect(bullVerdict.doubleBarrierOdds!.tp1HitBeforeSlPct15m).toBeGreaterThan(
        cautionVerdict.doubleBarrierOdds!.tp1HitBeforeSlPct15m
      );
    });
  });

  describe("2. Diurnal EM Scaling & sqrt(252)", () => {
    it("uses sqrt(252) for EM_1SD and scales 09:30–10:00 ET > 1.4x larger than 11:30–12:30 ET", () => {
      const pdc = 25000;
      const iv = 22.0;

      const em252 = computeExpectedMove(pdc, iv);
      expect(em252.annualizationDays).toBe(252);
      expect(em252.expectedMove1SD).toBeCloseTo((pdc * 0.22) / Math.sqrt(252), 2);

      // Diurnal clock spike at open vs lull at lunch
      expect(diurnalVolatilityClock(0)).toBeGreaterThan(3.5);
      expect(diurnalVolatilityClock(0.4)).toBeLessThan(1.1);

      // 09:30-10:00 ET window (570..600) vs 11:30-12:30 ET window (690..750)
      const openWindow = computeDiurnalExpectedMove(pdc, iv, 9 * 60 + 30, 10 * 60);
      const lunchWindow = computeDiurnalExpectedMove(pdc, iv, 11 * 60 + 30, 12 * 60 + 30);
      expect(openWindow.remainingExpectedMoveStraddle / lunchWindow.remainingExpectedMoveStraddle).toBeGreaterThan(1.4);

      // Remaining RTH from 09:30 (570..960) vs remaining RTH from 11:30 (690..960)
      const remOpen = computeDiurnalExpectedMove(pdc, iv, 9 * 60 + 30);
      const remLunch = computeDiurnalExpectedMove(pdc, iv, 11 * 60 + 30);
      expect(remOpen.remainingExpectedMoveStraddle / remLunch.remainingExpectedMoveStraddle).toBeGreaterThan(1.4);
    });
  });

  describe("3. Prop-Firm Drawdown Exit Policy", () => {
    it("INTRADAY_UNREALIZED with contracts=2 emits 50% @ +1.2R partial + dynamic peak trail", () => {
      const policy = computeDrawdownExitPolicy({
        accountDrawdownMode: "INTRADAY_UNREALIZED",
        direction: "LONG",
        contracts: 2,
        entryPrice: 25150,
        stopPts: 14,
        atr5mPts: 30,
        netGammaRegime: "NEGATIVE_GAMMA",
      });

      expect(policy.tpRecommendation).toBe("TAKE_PARTIALS");
      expect(policy.partialPct).toBe(50);
      expect(policy.partialAtR).toBe(1.2);
      expect(policy.partialPrice).toBeCloseTo(25166.8, 1); // 25150 + 14*1.2 = 25166.8
      expect(policy.trailBehindPeakPts).toBe(10.5); // clip(0.35*30, 8, 14) = 10.5
      expect(policy.trailFormula).toContain("max(entry 25150.00, peakPx - 10.5 pts)");

      const riskPlan = computeDetailedRiskPlan({
        entryPrice: 25150,
        stopPrice: 25136,
        instrument: "MNQ",
        baseRiskDollars: 200,
        propProfile: PROP_PRESETS.Apex_Intraday,
      });
      expect(riskPlan.suggestedContracts).toBeGreaterThanOrEqual(2);
      expect(riskPlan.contractSplitDirective).toContain("+1.2R");
      expect(riskPlan.contractSplitDirective).toContain("peakPx");
    });

    it("INTRADAY_UNREALIZED with contracts=1 emits SINGLE_CONTRACT_TRAIL starting at +1.0R (min 12 pts)", () => {
      const policy = computeDrawdownExitPolicy({
        accountDrawdownMode: "INTRADAY_UNREALIZED",
        direction: "SHORT",
        contracts: 1,
        entryPrice: 25150,
        stopPts: 10,
        atr5mPts: 28,
      });

      expect(policy.tpRecommendation).toBe("SINGLE_CONTRACT_TRAIL");
      expect(policy.partialPrice).toBe(25138); // min 12 pts overrides 10 pts
      expect(policy.trailFormula).toContain("min(entry 25150.00, peakPx + 9.8 pts)");
    });

    it("reserves STICK_WITH_FULL_TP strictly for EOD_TRAILING or CASH_LIVE in unobstructed NEGATIVE_GAMMA trends", () => {
      const eodNegGamma = computeDrawdownExitPolicy({
        accountDrawdownMode: "EOD_TRAILING",
        direction: "LONG",
        contracts: 2,
        entryPrice: 25150,
        stopPts: 14,
        netGammaRegime: "NEGATIVE_GAMMA",
        hasBlockingMagnet: false,
        targetPrice: 25180,
      });
      expect(eodNegGamma.tpRecommendation).toBe("STICK_WITH_FULL_TP");

      const cashNegGamma = computeDrawdownExitPolicy({
        accountDrawdownMode: "CASH_LIVE",
        direction: "LONG",
        contracts: 2,
        entryPrice: 25150,
        stopPts: 14,
        netGammaRegime: "NEGATIVE_GAMMA",
        hasBlockingMagnet: false,
        targetPrice: 25180,
      });
      expect(cashNegGamma.tpRecommendation).toBe("STICK_WITH_FULL_TP");

      // POSITIVE_GAMMA must NOT emit STICK_WITH_FULL_TP even in EOD_TRAILING
      const eodPosGamma = computeDrawdownExitPolicy({
        accountDrawdownMode: "EOD_TRAILING",
        direction: "LONG",
        contracts: 2,
        entryPrice: 25150,
        stopPts: 14,
        netGammaRegime: "POSITIVE_GAMMA",
        hasBlockingMagnet: false,
      });
      expect(eodPosGamma.tpRecommendation).not.toBe("STICK_WITH_FULL_TP");
    });
  });

  describe("4. Journal Shrinkage, Ingestion & Tilt Warning", () => {
    it("falls back to 45% when < 5 trades exist, shrinks when setup n < 10, and raises TILT_WARNING after 2 consecutive losses", () => {
      const makeTrade = (
        idx: number,
        realizedR: number,
        setup: string = "SWEEP_MSS_REVERSAL",
        window: string = "NY_OPEN_0930_1000"
      ): ScalpJournalTrade => ({
        id: `t-${idx}`,
        userId: "test",
        slideNumber: idx,
        tradeDate: `2026-11-${String(10 + idx).padStart(2, "0")}`,
        entryTimeET: "09:36",
        instrument: "MNQ",
        direction: "LONG",
        contracts: 2,
        sessionWindow: window,
        setupArchetype: setup,
        stopPts: 14,
        tp1Pts: 18,
        realizedR,
        mfePts: 22,
        maePts: 6,
        gexRegime: "NEGATIVE_GAMMA",
        playbookArchetype: "OPEN-TEST-DRIVE",
        executionGrade: realizedR > 0 ? "A" : "C",
        mistakeTags: realizedR < 0 ? ["chased_entry"] : [],
        traderNotes: realizedR > 0 ? "Waited for 1m MSS close." : "Entered early before sweep.",
      });

      // Case A: < 5 total trades -> strict 45% fallback
      const smallRes = computeJournalQueryFromTrades(
        [makeTrade(1, 1.5), makeTrade(2, 1.8), makeTrade(3, 1.2)],
        {
          setupArchetype: "SWEEP_MSS_REVERSAL",
          gexRegime: "NEGATIVE_GAMMA",
          sessionWindow: "NY_OPEN_0930_1000",
        }
      );
      expect(smallRes.winRateSource).toBe("BASELINE_45PCT");
      expect(smallRes.shrunkWinRatePct).toBe(45);

      // Case B: >= 5 total trades, setup n < 10 (e.g. 2/2 wins on SWEEP_MSS_REVERSAL, overall 4/8 = 50%)
      // Shrinkage pulls 100% toward 50%: (2 + 5*0.5)/(2 + 5) = 64.3%
      const trades8 = [
        makeTrade(1, 1.5, "SWEEP_MSS_REVERSAL"),
        makeTrade(2, 1.4, "SWEEP_MSS_REVERSAL"),
        makeTrade(3, 1.2, "RETRACE_CONTINUATION"),
        makeTrade(4, 1.1, "RETRACE_CONTINUATION"),
        makeTrade(5, -1.0, "RETRACE_CONTINUATION"),
        makeTrade(6, -1.0, "RETRACE_CONTINUATION"),
        makeTrade(7, -1.0, "VWAP_ONMID_PULLBACK"),
        makeTrade(8, -1.0, "VWAP_ONMID_PULLBACK"),
      ];
      const shrunkRes = computeJournalQueryFromTrades(trades8, {
        setupArchetype: "SWEEP_MSS_REVERSAL",
        gexRegime: "NEGATIVE_GAMMA",
        sessionWindow: "NY_OPEN_0930_1000",
      });
      expect(shrunkRes.winRateSource).toBe("JOURNAL_SHRUNK");
      expect(shrunkRes.shrunkWinRatePct).toBeCloseTo(64.3, 1);
      expect(shrunkRes.shrunkWinRatePct).toBeLessThan(100);
      expect(shrunkRes.relevantTrades.length).toBeGreaterThanOrEqual(2);
      expect(shrunkRes.relevantTrades.length).toBeLessThanOrEqual(3);
      expect(shrunkRes.tiltWarning).toBe(false);

      // Case C: 2 consecutive losses at top of recent trades -> raises TILT_WARNING
      const tiltTrades = [
        makeTrade(9, -1.0, "SWEEP_MSS_REVERSAL"),
        makeTrade(10, -1.0, "SWEEP_MSS_REVERSAL"),
        ...trades8,
      ];
      const tiltRes = computeJournalQueryFromTrades(tiltTrades, {
        setupArchetype: "SWEEP_MSS_REVERSAL",
        gexRegime: "NEGATIVE_GAMMA",
        sessionWindow: "NY_OPEN_0930_1000",
      });
      expect(tiltRes.tiltWarning).toBe(true);
      expect(tiltRes.consecutiveLosses).toBeGreaterThanOrEqual(2);
    });

    it("parses CSV/JSON imports and persists them to SQLite journal_trades", async () => {
      const csv = [
        "slideNumber,tradeDate,entryTimeET,instrument,direction,contracts,setupArchetype,stopPts,tp1Pts,realizedR,mfePts,maePts,gexRegime,playbookArchetype,executionGrade,mistakeTags,traderNotes",
        '1,2026-11-20,09:36,MNQ,LONG,2,SWEEP_MSS_REVERSAL,14,18,1.3,24,5,NEGATIVE_GAMMA,OPEN-TEST-DRIVE,A,"none","Clean ORL sweep and 1m MSS"',
        '2,2026-11-21,09:41,MNQ,SHORT,2,RETRACE_CONTINUATION,12,16,-1.0,6,12,POSITIVE_GAMMA,OPEN-AUCTION,C,"chased;chop","Shorted mid-range chop"',
      ].join("\n");

      const testUser = "vitest-journal-ingest";
      clearScalpJournalTrades(testUser);
      try {
        const parsedCsv = parseJournalCsvImport(csv, testUser);
        expect(parsedCsv).toHaveLength(2);
        expect(parsedCsv[0].sessionWindow).toBe("NY_OPEN_0930_1000");

        const parsedJson = parseJournalJsonImport(
          [
            {
              slideNumber: 3,
              tradeDate: "2026-11-22",
              entryTimeET: "09:44",
              instrument: "MNQ",
              direction: "LONG",
              contracts: 2,
              setupArchetype: "VWAP_ONMID_PULLBACK",
              stopPts: 13,
              tp1Pts: 19,
              realizedR: 1.45,
              mfePts: 25,
              maePts: 4,
              gexRegime: "NEGATIVE_GAMMA",
              traderNotes: "VWAP absorption bounce.",
            },
          ],
          testUser
        );

        upsertScalpJournalTrades([...parsedCsv, ...parsedJson]);
        const queried = await queryPersonalJournal({
          setupArchetype: "SWEEP_MSS_REVERSAL",
          gexRegime: "NEGATIVE_GAMMA",
          sessionWindow: "NY_OPEN_0930_1000",
          userId: testUser,
        });
        expect(queried.overallTotalTrades).toBe(3);
        expect(queried.matchedCount).toBe(1);
        expect(queried.relevantTrades[0].shortNote).toContain("Clean ORL sweep");
      } finally {
        clearScalpJournalTrades(testUser);
      }
    });
  });

  describe("5. 5-Line Scalper Card, Mode Router & Stale Feed Guard", () => {
    it("strictly produces 5 lines in LIVE_SCALP mode under token cap, and suppresses stale 1m flow when feedLagSeconds > 90", () => {
      // Mode router checks
      expect(resolveChatMode({ userText: "Check this setup", minutesET: 9 * 60 + 38 })).toBe(
        "LIVE_SCALP"
      );
      expect(
        resolveChatMode({
          userText: "Please explain why this failed",
          modePreference: "LIVE_SCALP",
          minutesET: 9 * 60 + 38,
        })
      ).toBe("DEEP_DIVE");

      // Stale backend feed (>90s)
      const staleTs = new Date(Date.now() - 180 * 1000).toISOString();
      const staleSnapshot = makeSnapshot({
        quote: {
          ...makeSnapshot().quote,
          price: 25100,
          timestamp: staleTs,
          stalenessSeconds: 180,
          stalenessBadge: "STALE",
        },
        footprint: {
          available: true,
          sessionCvd: -9999,
          rthCvd: -5000,
          lastUpdated: staleTs,
          disclaimer: "Stale 1m flow",
        },
      });

      const chartState: ExtractedChartState = {
        instrument: "MNQ",
        liveSpot: 25165.0,
        timeframe: "1m",
        orderState: "MARKET_ENTRY_NOW",
        direction: "LONG",
        entryPx: 25165.0,
        entryZoneLow: null,
        entryZoneHigh: null,
        stopPx: 25151.0,
        tp1Px: 25185.0,
        tp2Px: 25205.0,
        contracts: 2,
        detectedSetupArchetype: "SWEEP_MSS_REVERSAL",
        visibleKeyLevels: [{ label: "ORL_3m", price: 25153.0 }],
      };

      const verdict = computeScalpVerdict(chartState, staleSnapshot, {
        accountDrawdownMode: "INTRADAY_UNREALIZED",
        currentMinuteET: 9 * 60 + 38,
      });

      expect(verdict.isStaleBackendFeed).toBe(true);
      expect(verdict.suppressedStaleLtfFlow).toBe(true);
      expect(verdict.feedDeltaPts).toBe(65); // 25165 - 25100
      expect(verdict.exitDirective.action).toBe("TAKE_PARTIALS");
      // PDC (25175) sits 10 pts (0.71R) ahead of entry (25165), so INTRADAY_UNREALIZED snaps partial before 1.2R
      expect(verdict.blockingMagnet?.shortName).toBe("PDC");
      expect(verdict.exitDirective.partialAtR).toBeCloseTo(0.71, 2);

      // Volatility-scaled stop range check at spot 25165
      const stopRange = computeVolatilityScaledStopRange(25165, 34);
      expect(stopRange.minPts).toBeCloseTo(10.1, 1);
      expect(stopRange.maxPts).toBeCloseTo(30.2, 1);
      expect(stopRange.recommendedPts).toBeCloseTo(11.9, 1);

      const journalCtx = computeJournalQueryFromTrades([], {
        setupArchetype: "SWEEP_MSS_REVERSAL",
        gexRegime: "NEGATIVE_GAMMA",
        sessionWindow: "NY_OPEN_0930_1000",
      });

      const rendered = renderScalperCardDeterministic(verdict, journalCtx, "LIVE_SCALP");
      const lines = rendered.text.split("\n").filter((l) => l.trim().length > 0);
      expect(lines).toHaveLength(5);
      expect(rendered.maxOutputTokens).toBe(280);
      expect(lines[0]).toContain("Verdict & Re-Anchor");
      expect(lines[0]).toContain("STALE 180s");
      expect(lines[1]).toContain("Double-Barrier Edge");
      expect(lines[2]).toContain("Structure & Regime");
      expect(lines[2]).toContain("1m suppressed");
      expect(lines[3]).toContain("Journal Precedent");
      expect(lines[4]).toContain("Exit Directive (INTRADAY_UNREALIZED)");
    });

    it("detects Thanksgiving holiday / Black Friday half-day schedule and routes conversational questions to Assistant mode", async () => {
      const wedEveningET = new Date("2026-11-25T23:18:00Z"); // Wed Nov 25, 2026 18:18 ET
      const schedule = getUpcomingCalendarSchedule(wedEveningET, 4);
      const thu = schedule.find((d) => d.date === "2026-11-26");
      const fri = schedule.find((d) => d.date === "2026-11-27");

      expect(thu?.status).toBe("HOLIDAY");
      expect(thu?.note).toContain("Thanksgiving");
      expect(fri?.status).toBe("HALF_DAY");
      expect(fri?.note).toContain("13:15 ET");

      expect(isConversationalAssistantQuery("worth trading thurs and fri or no?", false)).toBe(true);
      expect(isConversationalAssistantQuery("long 25150 sl 14 tp 25180", false)).toBe(false);
      expect(isConversationalAssistantQuery("worth trading thurs and fri or no?", true)).toBe(false);

      const snap = makeSnapshot({
        session: {
          ...makeSnapshot().session,
          currentETDateTime: "Wed 2026-11-25 18:18:00 ET",
          upcomingSchedule: schedule,
        },
        upcomingEvents: [
          {
            date: "2026-11-25",
            timeET: "08:30 AM",
            event: "Core PCE Price Index (m/m)",
            impact: "HIGH",
            folderColor: "RED",
          },
        ],
      });
      const prompt = buildSystemPromptFromContext(snap);
      expect(prompt).toContain("Thanksgiving Day");
      expect(prompt).toContain("Day After Thanksgiving (Black Friday)");
      expect(prompt).toContain("Core PCE Price Index");
      expect(prompt).toContain("Answer the user's actual question directly");

      // Rate-limit & model-deprecation detector & deterministic assistant fallback
      expect(isRateLimitError(new Error("429 RESOURCE_EXHAUSTED quota exceeded"))).toBe(true);
      expect(isRateLimitError(new Error("SyntaxError"))).toBe(false);
      expect(
        isModelFallbackEligibleError(
          new Error("This model models/gemini-2.5-flash-lite is no longer available to new users.")
        )
      ).toBe(true);
      expect(isModelFallbackEligibleError(new Error("API_KEY_INVALID"))).toBe(false);

      const fallbackReply = buildDeterministicAssistantReply({
        userText: "worth trading thurs and fri or no?",
        snapshot: snap,
      });
      expect(fallbackReply).toContain("Thanksgiving Day");
      expect(fallbackReply).toContain("Black Friday");
      expect(fallbackReply).toContain("Action Plan");

      // Gemini 3 vs 2.5 thinking config, inline image conversion, and invalid-argument fallback
      expect(getGoogleThinkingOptions("gemini-3.5-flash-lite")?.google.thinkingConfig).toEqual({
        thinkingLevel: "minimal",
        includeThoughts: false,
      });
      expect(getGoogleThinkingOptions("gemini-2.5-flash")?.google.thinkingConfig).toEqual({
        thinkingBudget: 0,
        includeThoughts: false,
      });
      expect(getGoogleThinkingOptions("gemini-flash-latest")).toBeUndefined();

      expect(
        isModelFallbackEligibleError(new Error("Request contains an invalid argument."))
      ).toBe(true);

      const tinyPng =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      const resolved = await resolveImageInputForModel(tinyPng);
      expect(resolved?.mediaType).toBe("image/png");
      expect(resolved?.data).toBeInstanceOf(Uint8Array);
      expect(resolved?.data.byteLength).toBeGreaterThan(0);
    });
  });
});
