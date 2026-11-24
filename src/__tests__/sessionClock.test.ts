import { describe, it, expect } from "vitest";
import {
  getCMESessionInfo,
  getETParts,
  isTradingDay,
  isCMEHoliday,
  getNextTradingDay,
  getPriorTradingDay
} from "../lib/market/sessionClock";
import { computeSessionLevels, getBarDateET } from "../lib/market/levels";
import { generateTacticalPlaybook } from "../lib/market/playbook";
import { OHLCVBar, BiasRegime } from "../types/market";

describe("CME Futures Session Clock (sessionClock.ts)", () => {
  it("1. Mon 20:20 ET -> targetTradeDate = Tue, phase = DEVELOPING_OVERNIGHT (ASIA)", () => {
    // 2026-11-23 20:20:00 ET (Monday evening Globex)
    const d = new Date("2026-11-23T20:20:00-05:00");
    const info = getCMESessionInfo(d);

    expect(info.targetTradeDate).toBe("2026-11-24"); // Tuesday
    expect(info.priorTradeDate).toBe("2026-11-23"); // Monday
    expect(info.phase).toBe("DEVELOPING_OVERNIGHT");
    expect(info.subPhase).toBe("ASIA");
    expect(info.statusBadge).toBe("DEVELOPING");
    expect(info.isWindowActive).toBe(false);
    expect(info.isDeveloping).toBe(true);
    expect(info.targetTradeDateFormatted).toContain("TUE NOV 24");
    expect(info.phaseTitle).toContain("DEVELOPING — PREP FOR Tue, Nov 24");
  });

  it("2. Tue 09:15 ET -> targetTradeDate = Tue, phase = PRE_MARKET_LOCK", () => {
    // 2026-11-24 09:15:00 ET (Tuesday pre-market)
    const d = new Date("2026-11-24T09:15:00-05:00");
    const info = getCMESessionInfo(d);

    expect(info.targetTradeDate).toBe("2026-11-24");
    expect(info.priorTradeDate).toBe("2026-11-23");
    expect(info.phase).toBe("PRE_MARKET_LOCK");
    expect(info.statusBadge).toBe("FINALIZED");
    expect(info.isWindowActive).toBe(false);
    expect(info.phaseTitle).toContain("FINAL PRE-MARKET BRIEF — TUE");
  });

  it("3. Tue 09:40 ET -> targetTradeDate = Tue, phase = NY_OPEN_WINDOW", () => {
    // 2026-11-24 09:40:00 ET (Tuesday active execution window)
    const d = new Date("2026-11-24T09:40:00-05:00");
    const info = getCMESessionInfo(d);

    expect(info.targetTradeDate).toBe("2026-11-24");
    expect(info.priorTradeDate).toBe("2026-11-23");
    expect(info.phase).toBe("NY_OPEN_WINDOW");
    expect(info.statusBadge).toBe("ACTIVE");
    expect(info.isWindowActive).toBe(true);
    expect(info.phaseTitle).toContain("NY OPEN WINDOW ACTIVE — TUE");
    expect(info.countdownHuman).toContain("left in Window");
  });

  it("4. Tue 13:00 ET -> targetTradeDate = Tue, phase = POST_WINDOW_RECAP", () => {
    // 2026-11-24 13:00:00 ET (Tuesday afternoon post-window)
    const d = new Date("2026-11-24T13:00:00-05:00");
    const info = getCMESessionInfo(d);

    expect(info.targetTradeDate).toBe("2026-11-24");
    expect(info.priorTradeDate).toBe("2026-11-23");
    expect(info.phase).toBe("POST_WINDOW_RECAP");
    expect(info.statusBadge).toBe("RECAP");
    expect(info.isWindowActive).toBe(false);
    expect(info.phaseTitle).toContain("TUE 9:30 AM WINDOW COMPLETE — STAY FLAT / LOG TRADE");
    expect(info.countdownHuman).toContain("to 6:00 PM Rollover");
  });

  it("5. Fri 18:30 ET and Sun 14:00 ET -> targetTradeDate = Mon, phase = CME_BREAK_OR_WEEKEND", () => {
    // Friday after 17:00 ET
    const fri = new Date("2026-11-27T18:30:00-05:00");
    const friInfo = getCMESessionInfo(fri);
    expect(friInfo.targetTradeDate).toBe("2026-11-30"); // Upcoming Monday
    expect(friInfo.priorTradeDate).toBe("2026-11-27"); // Friday
    expect(friInfo.phase).toBe("CME_BREAK_OR_WEEKEND");
    expect(friInfo.statusBadge).toBe("WEEKEND");

    // Sunday before 18:00 ET
    const sun = new Date("2026-11-29T14:00:00-05:00");
    const sunInfo = getCMESessionInfo(sun);
    expect(sunInfo.targetTradeDate).toBe("2026-11-30");
    expect(sunInfo.priorTradeDate).toBe("2026-11-27");
    expect(sunInfo.phase).toBe("CME_BREAK_OR_WEEKEND");
    expect(sunInfo.statusBadge).toBe("WEEKEND");
  });

  it("6. Sun 20:00 ET -> targetTradeDate = Mon, phase = DEVELOPING_OVERNIGHT (ASIA)", () => {
    // Sunday 20:00 ET (Globex open for Monday's session)
    const sun = new Date("2026-11-29T20:00:00-05:00");
    const info = getCMESessionInfo(sun);

    expect(info.targetTradeDate).toBe("2026-11-30"); // Monday
    expect(info.priorTradeDate).toBe("2026-11-27"); // Friday
    expect(info.phase).toBe("DEVELOPING_OVERNIGHT");
    expect(info.subPhase).toBe("ASIA");
    expect(info.statusBadge).toBe("DEVELOPING");
  });

  it("handles CME holidays cleanly when rolling over (Thanksgiving 2026)", () => {
    expect(isCMEHoliday("2026-11-26")).toBe(true);
    expect(isTradingDay("2026-11-26")).toBe(false);

    // Wednesday evening before Thanksgiving
    const wedEve = new Date("2026-11-25T17:30:00-05:00");
    const info = getCMESessionInfo(wedEve);
    // Skips Thursday (Thanksgiving), rolls to Friday 2026-11-27
    expect(info.targetTradeDate).toBe("2026-11-27");
    expect(info.priorTradeDate).toBe("2026-11-25");
  });
});

describe("Prior-Day & Globex Bar Slicing (levels.ts)", () => {
  const fridayBar: OHLCVBar = {
    timestamp: "2026-11-20T00:00:00.000Z",
    open: 21100,
    high: 21250,
    low: 21050,
    close: 21200,
    volume: 500000
  };

  const mondayBar: OHLCVBar = {
    timestamp: "2026-11-23T00:00:00.000Z",
    open: 21200,
    high: 21320,
    low: 21150,
    close: 21280,
    volume: 480000
  };

  const inProgressTuesdayBar: OHLCVBar = {
    timestamp: "2026-11-24T00:00:00.000Z",
    open: 21280,
    high: 21380,
    low: 21260,
    close: 21350,
    volume: 12000
  };

  it("7. Resolves Monday bar as PDH/PDL/PDC at Monday 20:20 ET both with and without in-progress Tuesday bar", () => {
    const targetTradeDate = "2026-11-24"; // Target session is Tuesday

    // Scenario A: Yahoo created an in-progress Tuesday daily bar
    const dailyBarsWithInProgress = [fridayBar, mondayBar, inProgressTuesdayBar];
    const resWithInProgress = computeSessionLevels(
      21300,
      dailyBarsWithInProgress,
      [],
      24.0,
      undefined,
      targetTradeDate
    );

    expect(resWithInProgress.sessionMetrics.pdh).toBe(mondayBar.high); // 21320
    expect(resWithInProgress.sessionMetrics.pdl).toBe(mondayBar.low); // 21150
    expect(resWithInProgress.sessionMetrics.pdc).toBe(mondayBar.close); // 21280
    expect(resWithInProgress.sessionMetrics.targetTradeDate).toBe("2026-11-24");

    // Scenario B: Yahoo has NOT yet created Tuesday daily bar (stops at Monday)
    const dailyBarsWithoutInProgress = [fridayBar, mondayBar];
    const resWithoutInProgress = computeSessionLevels(
      21300,
      dailyBarsWithoutInProgress,
      [],
      24.0,
      undefined,
      targetTradeDate
    );

    expect(resWithoutInProgress.sessionMetrics.pdh).toBe(mondayBar.high); // 21320
    expect(resWithoutInProgress.sessionMetrics.pdl).toBe(mondayBar.low); // 21150
    expect(resWithoutInProgress.sessionMetrics.pdc).toBe(mondayBar.close); // 21280
  });

  it("8. Early-Globex Guard: handles < 2 Globex bars without crashing or dividing by zero", () => {
    const targetTradeDate = "2026-11-24";
    const dailyBars = [fridayBar, mondayBar];

    // Only 1 Globex bar generated so far at 18:15 ET Monday
    const singleGlobexBar: OHLCVBar = {
      timestamp: "2026-11-23T18:15:00-05:00",
      open: 21280,
      high: 21295,
      low: 21275,
      close: 21290,
      volume: 1500
    };

    const res = computeSessionLevels(
      21290,
      dailyBars,
      [singleGlobexBar],
      24.0,
      undefined,
      targetTradeDate
    );

    expect(res.sessionMetrics.globexStatus).toBe("INITIALIZING");
    expect(res.sessionMetrics.inventoryPercent).toBe(50);
    expect(res.sessionMetrics.overnightInventory).toBe("BALANCED");
    expect(res.sessionMetrics.globexVwap).toBeDefined();
    expect(isNaN(res.sessionMetrics.globexVwap)).toBe(false);
  });
});

describe("Phase-Aware Tactical Playbook Directives (playbook.ts)", () => {
  const mockBias: BiasRegime = {
    verdict: "CONTINUATION FAVORED (BULLISH)",
    confidence: "HIGH",
    htfTrend: "BULLISH",
    chopRisk: "LOW",
    regimeRiskMultiplier: 1.0,
    summary: "Strong HTF trend",
    drivers: ["Above VWAP"],
    risks: [],
    idealRetraceZone: { startPrice: 21250, endPrice: 21270, description: "VWAP Test" }
  };

  it("produces developing prep directive during overnight session", () => {
    const mondayNight = new Date("2026-11-23T20:20:00-05:00");
    const sessionInfo = getCMESessionInfo(mondayNight);
    const { sessionMetrics } = computeSessionLevels(21280, [], [], 24.0, undefined, sessionInfo.targetTradeDate);

    const plan = generateTacticalPlaybook(21280, sessionMetrics, mockBias, { sessionInfo });

    expect(plan.singleTradeDirective).toContain("DEVELOPING — PREP FOR Tue, Nov 24 9:30 AM OPEN");
    expect(plan.singleTradeDirective).toContain("London session (03:00 ET)");
    expect(plan.singleTradeDirective).toContain("8:30 AM macro releases have not finalized yet");
    expect(plan.sessionPhase).toBe("DEVELOPING_OVERNIGHT");
    expect(plan.retraceAnalysis.verdictHeadline).toContain("DEVELOPING — PREP FOR Tue, Nov 24 9:30 AM OPEN");
  });

  it("produces final pre-market directive during pre-market lock", () => {
    const tuesdayPreMarket = new Date("2026-11-24T09:00:00-05:00");
    const sessionInfo = getCMESessionInfo(tuesdayPreMarket);
    const { sessionMetrics } = computeSessionLevels(21280, [], [], 24.0, undefined, sessionInfo.targetTradeDate);

    const plan = generateTacticalPlaybook(21280, sessionMetrics, mockBias, { sessionInfo });

    expect(plan.singleTradeDirective).toContain("FINAL PRE-MARKET BRIEF — TUE 9:30 AM OPEN");
    expect(plan.sessionPhase).toBe("PRE_MARKET_LOCK");
  });

  it("produces stay-flat recap directive with /journal recommendation during post-window", () => {
    const tuesdayAfternoon = new Date("2026-11-24T13:30:00-05:00");
    const sessionInfo = getCMESessionInfo(tuesdayAfternoon);
    const { sessionMetrics } = computeSessionLevels(21280, [], [], 24.0, undefined, sessionInfo.targetTradeDate);

    const plan = generateTacticalPlaybook(21280, sessionMetrics, mockBias, { sessionInfo });

    expect(plan.singleTradeDirective).toContain("TUE 9:30 AM WINDOW COMPLETE — STAY FLAT / LOG TRADE");
    expect(plan.singleTradeDirective).toContain("/journal");
    expect(plan.singleTradeDirective).toContain("6:00 PM ET Globex open");
    expect(plan.sessionPhase).toBe("POST_WINDOW_RECAP");
    expect(plan.executionSubPhase).toBe("WINDOW_CLOSED");
  });

  it("produces market closed directive during weekend break", () => {
    const saturday = new Date("2026-11-28T14:00:00-05:00");
    const sessionInfo = getCMESessionInfo(saturday);
    const { sessionMetrics } = computeSessionLevels(21280, [], [], 24.0, undefined, sessionInfo.targetTradeDate);

    const plan = generateTacticalPlaybook(21280, sessionMetrics, mockBias, { sessionInfo });

    expect(plan.singleTradeDirective).toContain("MARKET CLOSED — PREPARING FOR Mon, Nov 30 9:30 AM OPEN");
    expect(plan.singleTradeDirective).toContain("18:00 ET Globex open");
    expect(plan.sessionPhase).toBe("CME_BREAK_OR_WEEKEND");
  });
});
