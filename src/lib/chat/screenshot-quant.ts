import {
  ChatMarketContextSnapshot,
  ContractSizingUnit,
  DoubleBarrierOdds,
  ExtractedChartState,
  ScalpAccountProfile,
  ScalpSetupArchetype,
  SessionWindow,
} from "@/types/chat";
import { AccountDrawdownMode } from "@/types/market";
import { isTier1Event } from "@/lib/market/economicCalendar";
import { computeDiurnalExpectedMove, RTH_CLOSE_MINUTE_ET } from "@/lib/market/math";
import {
  computeDoubleBarrierHitProbability,
  computeVolatilityScaledStopRange,
} from "@/lib/execution/ltfExecution";
import { computeDrawdownExitPolicy } from "@/lib/risk/sizing";
import { getETParts } from "@/lib/market/sessionClock";

export interface ScreenshotQuantInput {
  instrument?: "NQ" | "MNQ";
  timeframe?: string;
  screenshotCurrentPrice: number;
  direction?: "LONG" | "SHORT" | "NONE";
  orderType?: "LIMIT" | "MARKET" | "STOP" | "UNKNOWN";
  positionStatus?: "OPEN" | "PLANNED_FLAT" | "UNKNOWN";
  entryPrice?: number;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  stopLossPrice?: number;
  targetPrice?: number;
  contracts?: number;
  accountBalance?: number;
  openPnlDollars?: number;
  newsCountdownMinutes?: number;
  newsImpact?: "RED_HIGH" | "ORANGE_MEDIUM" | "YELLOW_LOW" | "UNKNOWN";
  newsEventName?: string;
  candleOpen?: number;
  candleHigh?: number;
  candleLow?: number;
  candleClose?: number;
}

export interface AnchoredLevelDistance {
  shortName: string;
  name: string;
  price: number;
  distanceFromScreenshotPts: number;
  role: string;
  source: string;
  timestamp: string;
  staleness: string;
}

export type SetupState =
  | "OPEN_POSITION"
  | "PENDING_LIMIT_ORDER"
  | "MARKET_ENTRY_NOW"
  | "ANALYSIS_ONLY";

export type LimitSetupVerdict =
  | "VALID"
  | "VALID_WITH_ADJUSTMENTS"
  | "STRETCHED_LOW_FILL_ODDS"
  | "INVALID"
  | "NOT_APPLICABLE";

export interface ScreenshotQuantResult {
  instrument: "NQ" | "MNQ";
  timeframe: string;
  pointValueDollars: number;
  tickValueDollars: number;
  contracts: number;
  screenshotCurrentPrice: number;
  minBookQuotePrice: number;
  feedDeltaPts: number;
  quoteSource: string;
  quoteTimestamp: string;
  quoteStaleness: string;

  // Position / Order Classification
  direction: "LONG" | "SHORT" | "NONE";
  orderType: "LIMIT" | "MARKET" | "STOP" | "UNKNOWN";
  positionStatus: "OPEN" | "PLANNED_FLAT" | "UNKNOWN";
  setupState: SetupState;
  limitSetupVerdict: LimitSetupVerdict;
  limitSetupReasons: string[];

  // Entry, Zone, Stop & Target Math
  entryPrice: number | null;
  entryZoneLow: number | null;
  entryZoneHigh: number | null;
  stopLossPrice: number | null;
  stopLossSource: "CHART_EXPLICIT" | "SUGGESTED_STRUCTURAL" | "NONE";
  targetPrice: number | null;
  stopDistancePts: number | null;
  targetDistancePts: number | null;
  plannedRewardToRisk: number | null;
  breakEvenWinRatePct: number | null;
  dollarRiskPlanned: number | null;
  dollarRewardPlanned: number | null;
  pctAccountRisk: number | null;
  expectedValueR: number | null;
  expectedValueDollars: number | null;
  winRateAssumedPct: number;
  winRateSource: "JOURNAL" | "BASELINE_45PCT";

  // Limit Pullback / Fill Reachability & Market Alternative Math
  pullbackNeededToFillPts: number | null;
  pullbackNeededPctOfStraddle: number | null;
  levelsBlockingLimitFill: AnchoredLevelDistance[];
  marketEntryNowStopPts: number | null;
  marketEntryNowTargetPts: number | null;
  marketEntryNowRewardToRisk: number | null;
  marketEntryNowDollarRisk: number | null;
  openTradeUnrealizedPts: number | null;
  openTradeUnrealizedDollars: number | null;
  openTradeCurrentR: number | null;

  // Objective Per-Contract Risk & Layer 1 Quant Sizing (no hardcoded user limits)
  dollarRiskPerContract: number | null;
  dollarRewardPerContract: number | null;
  layer1RiskMultiplier: number;

  // Deterministic Trade Management (Break Even + Partials vs Full TP)
  tradeManagement: {
    breakevenTriggerPrice: number | null;
    breakevenTriggerPts: number | null;
    breakevenCondition: string;
    tpRecommendation: "TAKE_PARTIALS" | "STICK_WITH_FULL_TP" | "SINGLE_CONTRACT_TRAIL";
    partialTpPrice: number | null;
    partialTpLabel: string | null;
    tpRationale: string;
  };

  // Volatility, ATR & Straddle Calibration
  atrOpen15m: number;
  stopInAtr15m: number | null;
  stopSizingAssessment: "TOO_TIGHT_SWEEP_RISK" | "OPTIMAL" | "WIDE" | "UNSPECIFIED";
  expectedMoveStraddle: number;
  expectedMove1SD: number;
  targetPctOfDailyStraddle: number | null;
  vrpRatio: number;
  isNegativeVrp: boolean;
  vixTermRatio: number;
  termStructureRegime: string;
  vvix: number;
  netGammaRegime: string;
  gammaFlipNq: number | null;

  // News Severity Classification
  newsSeverity: "RED_HIGH" | "ORANGE_MEDIUM" | "YELLOW_LOW" | "NONE";
  newsShouldVetoTrade: boolean;
  newsGuidance: string | null;

  // Candle structure read from OHLC if present
  candleStats: {
    rangePts: number;
    bodyPts: number;
    upperWickPts: number;
    lowerWickPts: number;
    closeInRangePct: number;
    biasNote: string;
  } | null;

  // Live Empty-Chart Catch-Up Prediction Anchors
  liveBiasAtScreenshot: {
    direction: "BULLISH" | "BEARISH" | "NEUTRAL";
    reason: string;
  };
  retraceZones: AnchoredLevelDistance[];
  takeProfitTargets: Array<AnchoredLevelDistance & { tpLabel: "TP1" | "TP2" | "TP3" }>;
  watchOutFor: string[];

  // Structural Level Anchoring relative to screenshot live price
  nearestLevelsAbove: AnchoredLevelDistance[];
  nearestLevelsBelow: AnchoredLevelDistance[];
  obstaclesBeforeTarget: AnchoredLevelDistance[];
  protectingLevelsBetweenEntryAndStop: AnchoredLevelDistance[];

  // Synthesized Verdict & Warnings
  actionStance: string;
  warnings: string[];
  quantHighlights: string[];
}

export interface ScalpVerdictResult extends ScreenshotQuantResult {
  verdictAction: "GO" | "HALF-SIZE" | "VETO";
  detectedSetupArchetype: ScalpSetupArchetype;
  sessionWindow: SessionWindow;
  accountDrawdownMode: AccountDrawdownMode;
  feedLagSeconds: number;
  isStaleBackendFeed: boolean;
  suppressedStaleLtfFlow: boolean;
  diurnalEm: {
    annualizationDays: 252;
    fullDay1SD: number;
    fullDayStraddle: number;
    remainingStraddle: number;
    diurnalScaleFactor: number;
    pullbackStretchPct: number | null;
    targetStretchPct: number | null;
  };
  doubleBarrierOdds: DoubleBarrierOdds | null;
  volatilityScaledStop: {
    minPts: number;
    maxPts: number;
    recommendedPts: number;
    atr5mDiurnalPts: number;
    status: "TOO_TIGHT" | "OPTIMAL" | "WIDE" | "UNSPECIFIED";
  };
  mnqSizingTable: ContractSizingUnit[];
  exitDirective: {
    action: "TAKE_PARTIALS" | "SINGLE_CONTRACT_TRAIL" | "STICK_WITH_FULL_TP";
    partialPct: number | null;
    partialAtR: number | null;
    partialPrice: number | null;
    trailBehindPeakPts: number | null;
    trailFormula: string;
    antiChaseInvalidation: string;
    summaryLine: string;
  };
  blockingMagnet: AnchoredLevelDistance | null;
  nextRedNewsLabel: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function classifyNewsSeverity(
  input: ScreenshotQuantInput
): "RED_HIGH" | "ORANGE_MEDIUM" | "YELLOW_LOW" | "NONE" {
  if (typeof input.newsCountdownMinutes !== "number") return "NONE";
  if (input.newsImpact === "RED_HIGH") return "RED_HIGH";
  if (input.newsEventName && isTier1Event(input.newsEventName)) return "RED_HIGH";
  if (input.newsImpact === "YELLOW_LOW") return "YELLOW_LOW";
  if (input.newsImpact === "ORANGE_MEDIUM") return "ORANGE_MEDIUM";
  // Known medium/low US housing & weekly data should never trigger Red vetoes
  const evLower = (input.newsEventName || "").toLowerCase();
  if (
    evLower.includes("home sales") ||
    evLower.includes("housing") ||
    evLower.includes("mortgage") ||
    evLower.includes("building permits") ||
    evLower.includes("inventories") ||
    evLower.includes("pmi")
  ) {
    return "ORANGE_MEDIUM";
  }
  return "ORANGE_MEDIUM";
}

export function computeScreenshotQuantMetrics(
  input: ScreenshotQuantInput,
  snapshot: ChatMarketContextSnapshot
): ScreenshotQuantResult {
  const instrument: "NQ" | "MNQ" =
    input.instrument === "MNQ" || input.instrument === "NQ"
      ? input.instrument
      : snapshot.instrument;
  const timeframe = input.timeframe?.trim() || "Unknown";
  const pointValueDollars = instrument === "MNQ" ? 2 : 20;
  const tickValueDollars = pointValueDollars * 0.25;
  const contracts =
    typeof input.contracts === "number" && Number.isFinite(input.contracts) && input.contracts > 0
      ? Math.round(input.contracts)
      : 1;

  const px = input.screenshotCurrentPrice;
  const direction = input.direction || "NONE";
  const positionStatus = input.positionStatus || "UNKNOWN";
  const orderType = input.orderType || "UNKNOWN";

  const zLow =
    typeof input.entryZoneLow === "number" && Number.isFinite(input.entryZoneLow)
      ? input.entryZoneLow
      : null;
  const zHigh =
    typeof input.entryZoneHigh === "number" && Number.isFinite(input.entryZoneHigh)
      ? input.entryZoneHigh
      : null;
  const zoneLow = zLow !== null && zHigh !== null ? Math.min(zLow, zHigh) : zLow;
  const zoneHigh = zLow !== null && zHigh !== null ? Math.max(zLow, zHigh) : zHigh;

  const explicitEntry =
    typeof input.entryPrice === "number" && Number.isFinite(input.entryPrice)
      ? input.entryPrice
      : zoneLow !== null && zoneHigh !== null
      ? round2((zoneLow + zoneHigh) / 2)
      : zoneLow ?? zoneHigh;

  const target =
    typeof input.targetPrice === "number" && Number.isFinite(input.targetPrice)
      ? input.targetPrice
      : null;

  const atrOpen15m = snapshot.regime.atrOpen15m || 25;
  const expectedMoveStraddle = snapshot.regime.expectedMoveStraddle || 80;
  const expectedMove1SD = snapshot.regime.expectedMove1SD || 120;

  // Determine whether entry is a resting Pending Limit waiting to be filled vs an Open Trade vs Market Entry
  const isRestingShortLimit =
    direction === "SHORT" && explicitEntry !== null && explicitEntry >= px + 3;
  const isRestingLongLimit =
    direction === "LONG" && explicitEntry !== null && explicitEntry <= px - 3;

  let setupState: SetupState = "ANALYSIS_ONLY";
  if (positionStatus === "OPEN") {
    setupState = "OPEN_POSITION";
  } else if (
    orderType !== "MARKET" &&
    (isRestingShortLimit || isRestingLongLimit)
  ) {
    setupState = "PENDING_LIMIT_ORDER";
  } else if (direction !== "NONE" && explicitEntry !== null) {
    setupState = "MARKET_ENTRY_NOW";
  }

  const effectiveEntry = explicitEntry ?? px;

  // Resolve Stop Loss: explicit or suggested structural bracket stop outside zone/entry
  let stopLossPrice: number | null =
    typeof input.stopLossPrice === "number" && Number.isFinite(input.stopLossPrice)
      ? input.stopLossPrice
      : null;
  let stopLossSource: ScreenshotQuantResult["stopLossSource"] =
    stopLossPrice !== null ? "CHART_EXPLICIT" : "NONE";

  if (stopLossPrice === null && direction !== "NONE") {
    // Clean structural buffer beyond the drawn box/entry: bounded [12, 45] pts so suggested SL stays realistic
    const bufferPts = Math.min(45, Math.max(12, Math.round(atrOpen15m * 0.5 * 4) / 4));
    if (direction === "SHORT") {
      const anchorHigh = zoneHigh ?? effectiveEntry;
      stopLossPrice = round2(anchorHigh + bufferPts);
      stopLossSource = "SUGGESTED_STRUCTURAL";
    } else if (direction === "LONG") {
      const anchorLow = zoneLow ?? effectiveEntry;
      stopLossPrice = round2(anchorLow - bufferPts);
      stopLossSource = "SUGGESTED_STRUCTURAL";
    }
  }

  const stopDistancePts =
    stopLossPrice !== null ? round2(Math.abs(effectiveEntry - stopLossPrice)) : null;
  const targetDistancePts =
    target !== null ? round2(Math.abs(target - effectiveEntry)) : null;
  const plannedRewardToRisk =
    stopDistancePts && targetDistancePts && stopDistancePts > 0
      ? round2(targetDistancePts / stopDistancePts)
      : null;
  const breakEvenWinRatePct =
    plannedRewardToRisk !== null && plannedRewardToRisk > 0
      ? round2((1 / (1 + plannedRewardToRisk)) * 100)
      : null;

  const dollarRiskPlanned =
    stopDistancePts !== null ? round2(stopDistancePts * pointValueDollars * contracts) : null;
  const dollarRewardPlanned =
    targetDistancePts !== null ? round2(targetDistancePts * pointValueDollars * contracts) : null;

  const pctAccountRisk =
    dollarRiskPlanned !== null &&
    typeof input.accountBalance === "number" &&
    input.accountBalance > 0
      ? round2((dollarRiskPlanned / input.accountBalance) * 100)
      : null;

  // Journal Expectancy Calculation
  const hasRealJournalSample = snapshot.journal.totalTrades >= 5;
  const winRateAssumedPct = hasRealJournalSample ? snapshot.journal.winRatePercent : 45;
  const winRateSource = hasRealJournalSample ? "JOURNAL" : "BASELINE_45PCT";
  const winProb = winRateAssumedPct / 100;
  const expectedValueR =
    plannedRewardToRisk !== null
      ? round2(winProb * plannedRewardToRisk - (1 - winProb) * 1)
      : null;
  const expectedValueDollars =
    expectedValueR !== null && dollarRiskPlanned !== null
      ? round2(expectedValueR * dollarRiskPlanned)
      : null;

  // Distance needed for pending limit fill vs market-at-current alternative
  const pullbackNeededToFillPts =
    setupState === "PENDING_LIMIT_ORDER" && explicitEntry !== null
      ? round2(Math.abs(explicitEntry - px))
      : null;
  const pullbackNeededPctOfStraddle =
    pullbackNeededToFillPts !== null
      ? round2((pullbackNeededToFillPts / expectedMoveStraddle) * 100)
      : null;

  let marketEntryNowStopPts: number | null = null;
  let marketEntryNowTargetPts: number | null = null;
  if (stopLossPrice !== null) {
    marketEntryNowStopPts = round2(
      direction === "SHORT"
        ? stopLossPrice - px
        : direction === "LONG"
        ? px - stopLossPrice
        : Math.abs(stopLossPrice - px)
    );
  }
  if (target !== null) {
    marketEntryNowTargetPts = round2(
      direction === "SHORT"
        ? px - target
        : direction === "LONG"
        ? target - px
        : Math.abs(target - px)
    );
  }
  const marketEntryNowRewardToRisk =
    marketEntryNowStopPts &&
    marketEntryNowTargetPts &&
    marketEntryNowStopPts > 0 &&
    marketEntryNowTargetPts > 0
      ? round2(marketEntryNowTargetPts / marketEntryNowStopPts)
      : null;
  const marketEntryNowDollarRisk =
    marketEntryNowStopPts !== null && marketEntryNowStopPts > 0
      ? round2(marketEntryNowStopPts * pointValueDollars * contracts)
      : null;

  let openTradeUnrealizedPts: number | null = null;
  let openTradeUnrealizedDollars: number | null = null;
  let openTradeCurrentR: number | null = null;
  if (setupState === "OPEN_POSITION" && explicitEntry !== null && direction !== "NONE") {
    openTradeUnrealizedPts = round2(
      direction === "SHORT" ? explicitEntry - px : px - explicitEntry
    );
    openTradeUnrealizedDollars = round2(
      openTradeUnrealizedPts * pointValueDollars * contracts
    );
    if (stopDistancePts && stopDistancePts > 0) {
      openTradeCurrentR = round2(openTradeUnrealizedPts / stopDistancePts);
    }
  }

  // Objective Per-Contract Risk & Layer 1 Regime Gate
  const layer1RiskMultiplier = snapshot.regime.riskMultiplier;
  const dollarRiskPerContract =
    stopDistancePts !== null ? round2(stopDistancePts * pointValueDollars) : null;
  const dollarRewardPerContract =
    targetDistancePts !== null ? round2(targetDistancePts * pointValueDollars) : null;

  const stopInAtr15m =
    stopDistancePts !== null ? round2(stopDistancePts / atrOpen15m) : null;
  const stopSizingAssessment: ScreenshotQuantResult["stopSizingAssessment"] =
    stopInAtr15m === null
      ? "UNSPECIFIED"
      : stopInAtr15m < 0.5
      ? "TOO_TIGHT_SWEEP_RISK"
      : stopInAtr15m > 2.5
      ? "WIDE"
      : "OPTIMAL";
  const targetPctOfDailyStraddle =
    targetDistancePts !== null ? round2((targetDistancePts / expectedMoveStraddle) * 100) : null;

  // Candle structure stats
  let candleStats: ScreenshotQuantResult["candleStats"] = null;
  if (
    typeof input.candleOpen === "number" &&
    typeof input.candleHigh === "number" &&
    typeof input.candleLow === "number" &&
    typeof input.candleClose === "number"
  ) {
    const rangePts = round2(Math.max(0.25, input.candleHigh - input.candleLow));
    const bodyPts = round2(Math.abs(input.candleClose - input.candleOpen));
    const upperWickPts = round2(
      Math.max(0, input.candleHigh - Math.max(input.candleOpen, input.candleClose))
    );
    const lowerWickPts = round2(
      Math.max(0, Math.min(input.candleOpen, input.candleClose) - input.candleLow)
    );
    const closeInRangePct = round2(((input.candleClose - input.candleLow) / rangePts) * 100);
    let biasNote = "Balanced bar";
    if (lowerWickPts > bodyPts * 1.3 && closeInRangePct >= 60) {
      biasNote = "Lower-wick buying response inside bar";
    } else if (upperWickPts > bodyPts * 1.3 && closeInRangePct <= 40) {
      biasNote = "Upper-wick selling rejection inside bar";
    } else if (closeInRangePct >= 75) {
      biasNote = "Bullish close near high";
    } else if (closeInRangePct <= 25) {
      biasNote = "Bearish close near low";
    }
    candleStats = {
      rangePts,
      bodyPts,
      upperWickPts,
      lowerWickPts,
      closeInRangePct,
      biasNote,
    };
  }

  // Re-anchor all MinBook structural levels relative to screenshot live price
  const anchoredLevels: AnchoredLevelDistance[] = snapshot.keyLevels.map((l) => ({
    shortName: l.shortName,
    name: l.name,
    price: l.price,
    distanceFromScreenshotPts: round2(l.price - px),
    role: l.role,
    source: l.source,
    timestamp: l.timestamp,
    staleness: l.staleness,
  }));

  const nearestLevelsAbove = anchoredLevels
    .filter((l) => l.distanceFromScreenshotPts >= 0)
    .sort((a, b) => a.distanceFromScreenshotPts - b.distanceFromScreenshotPts)
    .slice(0, 5);

  const nearestLevelsBelow = anchoredLevels
    .filter((l) => l.distanceFromScreenshotPts < 0)
    .sort((a, b) => b.distanceFromScreenshotPts - a.distanceFromScreenshotPts)
    .slice(0, 5);

  const pathAnchor = explicitEntry ?? px;
  const obstaclesBeforeTarget =
    target !== null && direction !== "NONE"
      ? anchoredLevels
          .filter((l) =>
            direction === "SHORT"
              ? l.price < pathAnchor - 3 && l.price > target + 3
              : l.price > pathAnchor + 3 && l.price < target - 3
          )
          .sort((a, b) => (direction === "SHORT" ? b.price - a.price : a.price - b.price))
      : [];

  const protectingLevelsBetweenEntryAndStop =
    stopLossPrice !== null && direction !== "NONE"
      ? anchoredLevels
          .filter((l) =>
            direction === "SHORT"
              ? l.price > effectiveEntry + 2 && l.price < stopLossPrice - 2
              : l.price < effectiveEntry - 2 && l.price > stopLossPrice + 2
          )
          .sort((a, b) => (direction === "SHORT" ? a.price - b.price : b.price - a.price))
      : [];

  // Levels between live price and pending limit entry that could block fill
  const levelsBlockingLimitFill =
    setupState === "PENDING_LIMIT_ORDER" && explicitEntry !== null
      ? anchoredLevels
          .filter((l) =>
            direction === "SHORT"
              ? l.price > px + 5 && l.price < (zoneLow ?? explicitEntry) - 3
              : l.price < px - 5 && l.price > (zoneHigh ?? explicitEntry) + 3
          )
          .sort((a, b) => (direction === "SHORT" ? a.price - b.price : b.price - a.price))
      : [];

  // News classification (Red = real veto/flatten threat; Orange/Yellow = noise note only!)
  const newsSeverity = classifyNewsSeverity(input);
  const newsShouldVetoTrade =
    newsSeverity === "RED_HIGH" &&
    typeof input.newsCountdownMinutes === "number" &&
    input.newsCountdownMinutes <= 20;

  let newsGuidance: string | null = null;
  if (typeof input.newsCountdownMinutes === "number") {
    const evLabel = input.newsEventName || "scheduled news";
    if (newsSeverity === "RED_HIGH") {
      newsGuidance = `HIGH-IMPACT RED-FOLDER (${evLabel} in ${input.newsCountdownMinutes}m): High spike/slippage risk — pause new entries inside ±15m and protect open positions.`;
    } else {
      newsGuidance = `ORANGE/YELLOW FOLDER (${evLabel} in ${input.newsCountdownMinutes}m): Medium/low-impact release only — NOT strong enough to veto a valid Limit setup; just expect brief 5–15 pt spread noise at print.`;
    }
  }

  // Evaluate Pending Limit Setup Validity
  let limitSetupVerdict: LimitSetupVerdict = "NOT_APPLICABLE";
  const limitSetupReasons: string[] = [];
  if (setupState === "PENDING_LIMIT_ORDER" && explicitEntry !== null) {
    const targetWrongSide =
      target !== null &&
      ((direction === "SHORT" && target >= effectiveEntry) ||
        (direction === "LONG" && target <= effectiveEntry));
    const targetAlreadyBrokenBeforeFill =
      target !== null &&
      ((direction === "SHORT" && px <= target) || (direction === "LONG" && px >= target));

    if (targetWrongSide) {
      limitSetupVerdict = "INVALID";
      limitSetupReasons.push("Target lies on the wrong side of the planned limit entry.");
    } else if (targetAlreadyBrokenBeforeFill) {
      limitSetupVerdict = "INVALID";
      limitSetupReasons.push(
        `Target (${target?.toFixed(2)}) has already been reached before the limit fill; cancel stale limit order.`
      );
    } else if (
      plannedRewardToRisk !== null &&
      plannedRewardToRisk < 1.3
    ) {
      limitSetupVerdict = "INVALID";
      limitSetupReasons.push(
        `Limit R:R is only ${plannedRewardToRisk.toFixed(2)}R (< 1.3R minimum threshold).`
      );
    } else if (
      pullbackNeededPctOfStraddle !== null &&
      pullbackNeededPctOfStraddle > 85
    ) {
      limitSetupVerdict = "STRETCHED_LOW_FILL_ODDS";
      limitSetupReasons.push(
        `Entry sits ${pullbackNeededToFillPts?.toFixed(1)} pts (${pullbackNeededPctOfStraddle.toFixed(0)}% of daily Straddle) away — valid structural zone, but lower probability of filling if momentum stays heavy.`
      );
    } else {
      limitSetupVerdict =
        stopLossSource === "SUGGESTED_STRUCTURAL" || layer1RiskMultiplier === 0.5
          ? "VALID_WITH_ADJUSTMENTS"
          : "VALID";
    }

    if (stopLossSource === "SUGGESTED_STRUCTURAL" && stopLossPrice !== null) {
      limitSetupReasons.push(
        `No bracket stop shown on chart — pair this limit with a structural invalidation stop near ${stopLossPrice.toFixed(2)} (${stopDistancePts?.toFixed(1)} pts = $${dollarRiskPlanned?.toFixed(2)}).`
      );
    }
    if (levelsBlockingLimitFill.length > 0) {
      limitSetupReasons.push(
        `${levelsBlockingLimitFill.map((l) => `${l.shortName} (${l.price.toFixed(2)})`).slice(0, 2).join(", ")} sit between live spot (${px.toFixed(2)}) and your limit zone (${effectiveEntry.toFixed(2)}) — rallies could stall there before filling you.`
      );
    }
    if (plannedRewardToRisk !== null && plannedRewardToRisk >= 1.5) {
      limitSetupReasons.push(
        `Limit math clears ${plannedRewardToRisk.toFixed(2)}R (${breakEvenWinRatePct?.toFixed(1)}% break-even WR, +${expectedValueR?.toFixed(2)}R EV at ${winRateAssumedPct.toFixed(0)}% WR).`
      );
    }
  }

  // Warnings & Quant Highlights
  const warnings: string[] = [];
  const quantHighlights: string[] = [];

  if (snapshot.quote.stalenessBadge === "DELAYED" || snapshot.quote.stalenessBadge === "STALE") {
    const feedDeltaPts = round2(px - snapshot.quote.price);
    warnings.push(
      `MinBook quote is ${snapshot.quote.stalenessBadge} (${snapshot.quote.price.toFixed(2)}, delta vs screenshot ${feedDeltaPts >= 0 ? "+" : ""}${feedDeltaPts.toFixed(2)} pts); structural levels below are anchored to your live screenshot price ${px.toFixed(2)}.`
    );
  }

  if (layer1RiskMultiplier === 0) {
    warnings.push(
      `LAYER 1 RISK VETO (0x SIZE): ${snapshot.regime.activeVetoes.join("; ") || snapshot.regime.biasVerdict}. Volatility surface is stressed — either stand aside or reduce contract size.`
    );
  } else if (layer1RiskMultiplier === 0.5) {
    warnings.push(
      `LAYER 1 HALF-SIZE GATE (0.5x): Volatility regime favors scaling down size (~0.5x normal risk) and taking partials earlier around 1.5R–1.8R.`
    );
  }

  if (newsGuidance) {
    if (newsShouldVetoTrade) {
      warnings.push(newsGuidance);
    } else {
      quantHighlights.push(newsGuidance);
    }
  }

  if (setupState === "PENDING_LIMIT_ORDER" && explicitEntry !== null) {
    quantHighlights.push(
      `Pending ${direction} Limit Zone (${zoneLow && zoneHigh ? `${zoneLow.toFixed(2)}–${zoneHigh.toFixed(2)}` : explicitEntry.toFixed(2)}) needs a ${pullbackNeededToFillPts?.toFixed(2)} pt (${pullbackNeededPctOfStraddle?.toFixed(0)}% Straddle) bounce to fill. Do not front-run at market (${px.toFixed(2)}).`
    );
  }

  if (stopSizingAssessment === "TOO_TIGHT_SWEEP_RISK" && stopDistancePts !== null) {
    warnings.push(
      `STOP TOO TIGHT (${stopDistancePts.toFixed(2)} pts = ${stopInAtr15m}x ATR_Open_15m): Below 0.5x 15m ATR (~${(atrOpen15m * 0.5).toFixed(1)} pts) risks normal wiggle tagging you.`
    );
  } else if (stopSizingAssessment === "WIDE" && stopDistancePts !== null) {
    warnings.push(
      `WIDE STOP (${stopDistancePts.toFixed(2)} pts = ${stopInAtr15m}x ATR_Open_15m): Wider than 2.5x 15m ATR; consider tightening invalidation or sizing down contracts.`
    );
  }

  if (targetPctOfDailyStraddle !== null && targetPctOfDailyStraddle > 120) {
    warnings.push(
      `EXTENDED TARGET (${targetPctOfDailyStraddle.toFixed(0)}% of daily expected Straddle ${expectedMoveStraddle.toFixed(1)} pts): Take partial profits at nearer MinBook magnets before final TP.`
    );
  }

  if (plannedRewardToRisk !== null && breakEvenWinRatePct !== null) {
    quantHighlights.push(
      `Limit/Planned R:R ${plannedRewardToRisk.toFixed(2)}R (${stopDistancePts?.toFixed(2)} pt SL${stopLossSource === "SUGGESTED_STRUCTURAL" ? " suggested" : ""} / ${targetDistancePts?.toFixed(2)} pt TP) | Break-even WR ${breakEvenWinRatePct.toFixed(1)}% | EV ${expectedValueR !== null && expectedValueR >= 0 ? "+" : ""}${expectedValueR?.toFixed(2)}R at ${winRateAssumedPct.toFixed(0)}% WR`
    );
  }
  quantHighlights.push(
    `15m ATR_Open ${atrOpen15m.toFixed(1)} pts | Daily Straddle ±${expectedMoveStraddle.toFixed(1)} pts | 1-SD ±${expectedMove1SD.toFixed(1)} pts`
  );
  quantHighlights.push(
    `Vol Surface: VIX/VIX3M ${snapshot.volatilityAndMacro.termRatio.toFixed(2)} (${snapshot.volatilityAndMacro.termStructureRegime}), VRP ${snapshot.volatilityAndMacro.vrpRatio.toFixed(2)} (${snapshot.volatilityAndMacro.isNegativeVrp ? "RV > IV" : "Normal"}), VVIX ${snapshot.volatilityAndMacro.vvix.toFixed(1)}`
  );

  // Live Catch-Up Bias, Retrace Zones, TPs & Watch-Out-For (especially for empty chart screenshots)
  const findLevelPrice = (needle: string): number | null => {
    const match = anchoredLevels.find((l) => l.shortName.toLowerCase().includes(needle));
    return match ? match.price : null;
  };
  const vwapPx = findLevelPrice("vwap");
  const pdcPx = findLevelPrice("pdc");
  const onMidPx = findLevelPrice("on mid");

  let locationScore = 0;
  const locationFacts: string[] = [];
  if (vwapPx !== null) {
    if (px >= vwapPx) {
      locationScore += 1;
      locationFacts.push(`above Session VWAP (${vwapPx.toFixed(2)})`);
    } else {
      locationScore -= 1;
      locationFacts.push(`below Session VWAP (${vwapPx.toFixed(2)})`);
    }
  }
  if (pdcPx !== null) {
    if (px >= pdcPx) {
      locationScore += 1;
      locationFacts.push(`above PDC (${pdcPx.toFixed(2)})`);
    } else {
      locationScore -= 1;
      locationFacts.push(`below PDC (${pdcPx.toFixed(2)})`);
    }
  }
  if (onMidPx !== null) {
    if (px >= onMidPx) {
      locationScore += 1;
    } else {
      locationScore -= 1;
    }
  }

  const macroTiltBull = snapshot.regime.biasVerdict.includes("BULLISH");
  const macroTiltBear = snapshot.regime.biasVerdict.includes("BEARISH");
  const liveBiasDirection: "BULLISH" | "BEARISH" | "NEUTRAL" =
    direction === "LONG"
      ? "BULLISH"
      : direction === "SHORT"
      ? "BEARISH"
      : locationScore >= 2
      ? "BULLISH"
      : locationScore <= -2
      ? "BEARISH"
      : macroTiltBull && locationScore >= 0
      ? "BULLISH"
      : macroTiltBear && locationScore <= 0
      ? "BEARISH"
      : macroTiltBull
      ? "BULLISH"
      : macroTiltBear
      ? "BEARISH"
      : "NEUTRAL";

  const liveBiasReason = `At live screenshot spot ${px.toFixed(2)} (${
    locationFacts.length > 0 ? locationFacts.join(", ") : "anchored to snapshot"
  }), HTF trend is ${snapshot.regime.htfTrend} and MinBook verdict is ${snapshot.regime.biasVerdict}.`;

  const dedupeByGap = (items: AnchoredLevelDistance[], minGap: number): AnchoredLevelDistance[] => {
    const out: AnchoredLevelDistance[] = [];
    for (const item of items) {
      if (!out.some((k) => Math.abs(k.price - item.price) < minGap)) {
        out.push(item);
      }
    }
    return out;
  };

  const retraceRaw =
    liveBiasDirection === "BEARISH"
      ? anchoredLevels
          .filter(
            (l) =>
              l.distanceFromScreenshotPts >= 5 &&
              !l.shortName.toLowerCase().includes("gamma flip") &&
              !l.shortName.toLowerCase().includes("1-sd")
          )
          .sort((a, b) => a.distanceFromScreenshotPts - b.distanceFromScreenshotPts)
      : liveBiasDirection === "BULLISH"
      ? anchoredLevels
          .filter(
            (l) =>
              l.distanceFromScreenshotPts <= -5 &&
              !l.shortName.toLowerCase().includes("gamma flip") &&
              !l.shortName.toLowerCase().includes("1-sd")
          )
          .sort((a, b) => b.distanceFromScreenshotPts - a.distanceFromScreenshotPts)
      : [...nearestLevelsAbove.slice(0, 2), ...nearestLevelsBelow.slice(0, 2)];

  const retraceZones = dedupeByGap(retraceRaw, 5).slice(0, 3);

  const tpRaw =
    liveBiasDirection === "BEARISH"
      ? anchoredLevels
          .filter((l) => l.distanceFromScreenshotPts <= -8)
          .sort((a, b) => b.distanceFromScreenshotPts - a.distanceFromScreenshotPts)
      : liveBiasDirection === "BULLISH"
      ? anchoredLevels
          .filter((l) => l.distanceFromScreenshotPts >= 8)
          .sort((a, b) => a.distanceFromScreenshotPts - b.distanceFromScreenshotPts)
      : [];

  const tpLabels: Array<"TP1" | "TP2" | "TP3"> = ["TP1", "TP2", "TP3"];
  const takeProfitTargets = dedupeByGap(tpRaw, 8)
    .slice(0, 3)
    .map((item, idx) => ({ ...item, tpLabel: tpLabels[idx] }));

  const watchOutFor: string[] = [];
  if (layer1RiskMultiplier === 0) {
    watchOutFor.push(
      `Layer 1 Volatility Veto (0x size active): ${snapshot.regime.activeVetoes[0] || "High two-way swing risk — protect capital or stay flat."}`
    );
  } else if (layer1RiskMultiplier === 0.5) {
    watchOutFor.push(
      `0.5x Size Gate (${snapshot.volatilityAndMacro.termStructureRegime}, VRP ${snapshot.volatilityAndMacro.vrpRatio.toFixed(2)}): demand extra stop buffer (~5–8 pts beyond wick).`
    );
  }
  if (newsGuidance) {
    watchOutFor.push(newsGuidance);
  }
  if (Math.abs(px - snapshot.quote.price) >= 5) {
    watchOutFor.push(
      `MinBook quote lags by ${(px - snapshot.quote.price) >= 0 ? "+" : ""}${(px - snapshot.quote.price).toFixed(1)} pts (${snapshot.quote.stalenessBadge}); execute off your live chart.`
    );
  }
  if (snapshot.smt.hasDivergence) {
    watchOutFor.push(`SMT Divergence active: ${snapshot.smt.divergenceType}.`);
  }
  if (watchOutFor.length === 0) {
    watchOutFor.push(
      `15m ATR is ~${atrOpen15m.toFixed(0)} pts; avoid chasing mid-range candles without a clear retrace or break.`
    );
  }

  // Deterministic Break-Even & Partials vs Full TP Trade Management
  const dirSign =
    liveBiasDirection === "BEARISH" ? -1 : liveBiasDirection === "BULLISH" ? 1 : 0;
  const beAnchor = explicitEntry ?? px;
  const refStopPts = stopDistancePts ?? Math.max(15, round2(atrOpen15m));
  const netGammaRegime =
    snapshot.gex.available && snapshot.gex.netGammaRegime
      ? snapshot.gex.netGammaRegime
      : "UNAVAILABLE";
  const isMeanRevertingOrStressed =
    netGammaRegime === "POSITIVE_GAMMA" ||
    snapshot.volatilityAndMacro.isNegativeVrp ||
    snapshot.volatilityAndMacro.termRatio > 1.0 ||
    snapshot.volatilityAndMacro.vvix >= 110;

  let breakevenTriggerPrice: number | null = null;
  let breakevenTriggerPts: number | null = null;
  let breakevenCondition =
    "Wait for range expansion & confirm direction before moving stops to entry.";

  if (dirSign !== 0) {
    const firstMagnet = obstaclesBeforeTarget[0] ?? takeProfitTargets[0] ?? null;
    const rawRTriggerPts = isMeanRevertingOrStressed
      ? round2(Math.max(12, refStopPts * 0.75))
      : round2(Math.max(15, refStopPts * 1.0));
    const magnetDistPts = firstMagnet ? round2(Math.abs(firstMagnet.price - beAnchor)) : null;

    if (magnetDistPts !== null && magnetDistPts >= Math.max(12, atrOpen15m * 0.5) && magnetDistPts <= rawRTriggerPts * 1.15) {
      breakevenTriggerPts = magnetDistPts;
      breakevenTriggerPrice = firstMagnet!.price;
      breakevenCondition = `Move SL to Break Even (${beAnchor.toFixed(2)}) once price breaks/closes past ${firstMagnet!.shortName} (${firstMagnet!.price.toFixed(2)}, ${isMeanRevertingOrStressed ? "+0.75R+" : "~1.0R"} / +${magnetDistPts.toFixed(1)} pts) — avoid moving to BE inside initial noise.`;
    } else {
      breakevenTriggerPts = rawRTriggerPts;
      breakevenTriggerPrice = round2(beAnchor + dirSign * rawRTriggerPts);
      breakevenCondition = `Move SL to Break Even (${beAnchor.toFixed(2)}) once price clears ${isMeanRevertingOrStressed ? "+0.75R" : "+1.0R"} at ${breakevenTriggerPrice.toFixed(2)} (+${rawRTriggerPts.toFixed(1)} pts in profit).`;
    }
  }

  const isExtendedTarget =
    (plannedRewardToRisk !== null && plannedRewardToRisk >= 2.3) ||
    (targetPctOfDailyStraddle !== null && targetPctOfDailyStraddle >= 80);
  const hasBlockingMagnet = obstaclesBeforeTarget.length > 0;
  const shouldScalePartials = isExtendedTarget || hasBlockingMagnet || isMeanRevertingOrStressed;
  const partialMagnet = obstaclesBeforeTarget[0] ?? takeProfitTargets[0] ?? null;
  const partialTpPrice =
    partialMagnet?.price ??
    (dirSign !== 0 ? round2(beAnchor + dirSign * Math.max(25, round2(refStopPts * 1.6))) : null);
  const partialTpLabel = partialMagnet ? partialMagnet.shortName : "~1.6R Structural Target";

  let tpRecommendation: ScreenshotQuantResult["tradeManagement"]["tpRecommendation"] =
    "STICK_WITH_FULL_TP";
  let tpRationale = "";

  if (dirSign === 0) {
    tpRecommendation = "TAKE_PARTIALS";
    tpRationale =
      "Range-bound bias: lock profits at opposing range edges/VWAP instead of holding for breakouts.";
  } else if (contracts === 1 && shouldScalePartials) {
    tpRecommendation = "SINGLE_CONTRACT_TRAIL";
    const drivers = [
      isMeanRevertingOrStressed ? `${netGammaRegime === "POSITIVE_GAMMA" ? "+Gamma mean reversion" : "elevated volatility stress"}` : "",
      hasBlockingMagnet ? `magnet ${obstaclesBeforeTarget[0].shortName} (${obstaclesBeforeTarget[0].price.toFixed(2)}) sits ahead of full TP` : "",
      isExtendedTarget ? `full TP stretches ${plannedRewardToRisk ? `${plannedRewardToRisk.toFixed(2)}R` : `>${targetPctOfDailyStraddle?.toFixed(0)}% Straddle`}` : "",
    ].filter(Boolean);
    tpRationale = `On 1 contract you cannot split partials: either take Full TP at ${partialTpLabel} (${partialTpPrice?.toFixed(2)}) OR trail stop tightly behind 5m swings once past ${partialTpPrice?.toFixed(2)} (${drivers.join("; ")}).`;
  } else if (shouldScalePartials) {
    tpRecommendation = "TAKE_PARTIALS";
    const drivers = [
      isMeanRevertingOrStressed ? `${netGammaRegime === "POSITIVE_GAMMA" ? "+Gamma dampening" : "elevated VRP/volatility"}` : "",
      hasBlockingMagnet ? `${obstaclesBeforeTarget[0].shortName} (${obstaclesBeforeTarget[0].price.toFixed(2)}) sits in the path` : "",
      isExtendedTarget ? `target >2.3R / >80% Daily Straddle` : "",
    ].filter(Boolean);
    tpRationale = `TAKE PARTIALS (scale 50–70% at ${partialTpLabel} ${partialTpPrice?.toFixed(2)}, trail runner to full TP with SL at BE) because ${drivers.join(" & ")}.`;
  } else {
    tpRecommendation = "STICK_WITH_FULL_TP";
    tpRationale = `STICK WITH FULL TP (${target ? target.toFixed(2) : partialTpPrice?.toFixed(2)}): clear path with no major blocking magnets ahead, R:R fits inside daily expected move, and ${netGammaRegime === "NEGATIVE_GAMMA" ? "-Gamma favors clean trend follow-through" : "normal vol supports full target"}.`;
  }

  const tradeManagement = {
    breakevenTriggerPrice,
    breakevenTriggerPts,
    breakevenCondition,
    tpRecommendation,
    partialTpPrice,
    partialTpLabel,
    tpRationale,
  };

  // Action Stance
  let actionStance = "ANALYZE STRUCTURE BEFORE ENTRY";
  if (newsShouldVetoTrade) {
    actionStance = `WAIT FOR RED-FOLDER NEWS (${input.newsCountdownMinutes}m)`;
  } else if (setupState === "OPEN_POSITION" && openTradeUnrealizedPts !== null) {
    actionStance =
      openTradeUnrealizedPts > 0
        ? `IN PROFIT — TRAIL STOP / PARTIAL AT MAGNET (${openTradeCurrentR !== null ? `+${openTradeCurrentR.toFixed(2)}R` : `+${openTradeUnrealizedPts.toFixed(1)} pts`})`
        : `OPEN IN DRAWDOWN (${openTradeUnrealizedPts.toFixed(1)} pts) — HONOR HARD STOP`;
  } else if (setupState === "PENDING_LIMIT_ORDER") {
    if (limitSetupVerdict === "INVALID") {
      actionStance = `CANCEL / REVISE LIMIT ORDER — INVALID SETUP GEOMETRY`;
    } else if (limitSetupVerdict === "STRETCHED_LOW_FILL_ODDS") {
      actionStance = `LIMIT ZONE VALID BUT FAR (+${pullbackNeededToFillPts?.toFixed(1)} pts away) — KEEP LIMIT OR WATCH CLOSER REJECTION LEVEL`;
    } else if (limitSetupVerdict === "VALID_WITH_ADJUSTMENTS") {
      actionStance = `RESTING LIMIT SETUP VALID WITH ADJUSTMENTS — SET BRACKET SL @ ${stopLossPrice?.toFixed(2)} & WAIT FOR FILL`;
    } else {
      actionStance = `VALID LIMIT SETUP — KEEP LIMIT ORDER AT ${effectiveEntry.toFixed(2)} & WAIT FOR FILL`;
    }
  } else if (layer1RiskMultiplier === 0) {
    actionStance = "STAND ASIDE / STAY FLAT (LAYER 1 VOLATILITY VETO)";
  } else if (setupState === "ANALYSIS_ONLY") {
    const firstRetrace = retraceZones[0];
    const firstTp = takeProfitTargets[0];
    actionStance =
      liveBiasDirection === "NEUTRAL"
        ? `RANGE-BOUND — WAIT FOR EDGE SWEEP BEFORE ENTERING`
        : `${liveBiasDirection} BIAS CAUGHT UP @ ${px.toFixed(2)}${firstRetrace ? ` — WATCH RETRACE ${firstRetrace.price.toFixed(2)} (${firstRetrace.shortName})` : ""}${firstTp ? ` → TP1 ${firstTp.price.toFixed(2)}` : ""}`;
  } else if (direction !== "NONE") {
    actionStance =
      layer1RiskMultiplier === 0.5
        ? `WAIT FOR CONFIRMATION — MAX 0.5x SIZE (${direction})`
        : `LOOK FOR TRIGGER ON RETRACE / BREAK (${direction})`;
  }

  return {
    instrument,
    timeframe,
    pointValueDollars,
    tickValueDollars,
    contracts,
    screenshotCurrentPrice: px,
    minBookQuotePrice: snapshot.quote.price,
    feedDeltaPts: round2(px - snapshot.quote.price),
    quoteSource: snapshot.quote.source,
    quoteTimestamp: snapshot.quote.timestamp,
    quoteStaleness: snapshot.quote.stalenessBadge,
    direction,
    orderType,
    positionStatus,
    setupState,
    limitSetupVerdict,
    limitSetupReasons,
    entryPrice: explicitEntry,
    entryZoneLow: zoneLow,
    entryZoneHigh: zoneHigh,
    stopLossPrice,
    stopLossSource,
    targetPrice: target,
    stopDistancePts,
    targetDistancePts,
    plannedRewardToRisk,
    breakEvenWinRatePct,
    dollarRiskPlanned,
    dollarRewardPlanned,
    pctAccountRisk,
    expectedValueR,
    expectedValueDollars,
    winRateAssumedPct,
    winRateSource,
    pullbackNeededToFillPts,
    pullbackNeededPctOfStraddle,
    levelsBlockingLimitFill,
    marketEntryNowStopPts,
    marketEntryNowTargetPts,
    marketEntryNowRewardToRisk,
    marketEntryNowDollarRisk,
    openTradeUnrealizedPts,
    openTradeUnrealizedDollars,
    openTradeCurrentR,
    dollarRiskPerContract,
    dollarRewardPerContract,
    layer1RiskMultiplier,
    tradeManagement,
    atrOpen15m,
    stopInAtr15m,
    stopSizingAssessment,
    expectedMoveStraddle,
    expectedMove1SD,
    targetPctOfDailyStraddle,
    vrpRatio: snapshot.volatilityAndMacro.vrpRatio,
    isNegativeVrp: snapshot.volatilityAndMacro.isNegativeVrp,
    vixTermRatio: snapshot.volatilityAndMacro.termRatio,
    termStructureRegime: snapshot.volatilityAndMacro.termStructureRegime,
    vvix: snapshot.volatilityAndMacro.vvix,
    netGammaRegime:
      snapshot.gex.available && snapshot.gex.netGammaRegime
        ? snapshot.gex.netGammaRegime
        : "UNAVAILABLE",
    gammaFlipNq: snapshot.gex.gammaFlipNq ?? null,
    newsSeverity,
    newsShouldVetoTrade,
    newsGuidance,
    candleStats,
    liveBiasAtScreenshot: {
      direction: liveBiasDirection,
      reason: liveBiasReason,
    },
    retraceZones,
    takeProfitTargets,
    watchOutFor,
    nearestLevelsAbove,
    nearestLevelsBelow,
    obstaclesBeforeTarget,
    protectingLevelsBetweenEntryAndStop,
    actionStance,
    warnings,
    quantHighlights,
  };
}

export function resolveSessionWindowFromMinutesET(minutesET: number): SessionWindow {
  if (minutesET >= 570 && minutesET < 600) return "NY_OPEN_0930_1000";
  if (minutesET >= 600 && minutesET < 690) return "NY_AM_1000_1130";
  if (minutesET >= 690 && minutesET < 810) return "NY_LUNCH_1130_1330";
  if (minutesET >= 810 && minutesET < 960) return "NY_PM_1330_1600";
  return "OVERNIGHT_GLOBEX";
}

function getCurrentMinutesET(): number {
  const et = getETParts(new Date());
  return et.hour * 60 + et.minute;
}

export function chartStateToQuantInput(chartState: ExtractedChartState): ScreenshotQuantInput {
  const orderType: ScreenshotQuantInput["orderType"] =
    chartState.orderState === "PENDING_LIMIT_ORDER"
      ? "LIMIT"
      : chartState.orderState === "MARKET_ENTRY_NOW"
      ? "MARKET"
      : "UNKNOWN";
  const positionStatus: ScreenshotQuantInput["positionStatus"] =
    chartState.orderState === "OPEN_POSITION"
      ? "OPEN"
      : chartState.orderState === "PENDING_LIMIT_ORDER" ||
        chartState.orderState === "MARKET_ENTRY_NOW"
      ? "PLANNED_FLAT"
      : "UNKNOWN";

  return {
    instrument: chartState.instrument,
    timeframe: chartState.timeframe,
    screenshotCurrentPrice: chartState.liveSpot,
    direction: chartState.direction,
    orderType,
    positionStatus,
    entryPrice: chartState.entryPx ?? undefined,
    entryZoneLow: chartState.entryZoneLow ?? undefined,
    entryZoneHigh: chartState.entryZoneHigh ?? undefined,
    stopLossPrice: chartState.stopPx ?? undefined,
    targetPrice: chartState.tp1Px ?? chartState.tp2Px ?? undefined,
    contracts: chartState.contracts,
    accountBalance: chartState.accountBalance ?? undefined,
    openPnlDollars: chartState.openPnlDollars ?? undefined,
    newsCountdownMinutes: chartState.newsCountdownMinutes ?? undefined,
    newsImpact: chartState.newsImpact,
    newsEventName: chartState.newsEventName ?? undefined,
    candleOpen: chartState.candleOHLC?.open,
    candleHigh: chartState.candleOHLC?.high,
    candleLow: chartState.candleOHLC?.low,
    candleClose: chartState.candleOHLC?.close,
  };
}

/**
 * Step 2 of the deterministic 4-tool /chat pipeline:
 * Re-anchors all levels to liveSpot, enforces >90s backend lag guard,
 * computes diurnal sqrt(252) EM, absorbing double-barrier hit probabilities,
 * volatility-scaled stop sanity + MNQ sizing, and prop-firm drawdown-aware exit rules.
 */
export function computeScalpVerdict(
  chartState: ExtractedChartState,
  marketSnapshot: ChatMarketContextSnapshot,
  accountProfile: ScalpAccountProfile = { accountDrawdownMode: "INTRADAY_UNREALIZED" }
): ScalpVerdictResult {
  const quoteTsMs = Date.parse(marketSnapshot.quote.timestamp);
  const ageFromTs = Number.isFinite(quoteTsMs)
    ? Math.max(0, Math.round((Date.now() - quoteTsMs) / 1000))
    : 0;
  const feedLagSeconds = Math.max(marketSnapshot.quote.stalenessSeconds ?? 0, ageFromTs);
  const isStaleBackendFeed = feedLagSeconds > 90;

  // Lag Guard (>90s): suppress stale 1m openingFlow / ltfExecution overrides
  const sanitizedSnapshot: ChatMarketContextSnapshot = isStaleBackendFeed
    ? {
        ...marketSnapshot,
        footprint: {
          available: false,
          disclaimer:
            "Suppressed stale 1m openingFlow/footprint (>90s backend lag); governed by live screenshot spot + delay-tolerant macro/GEX/HTF.",
        },
        regime: {
          ...marketSnapshot.regime,
          biasVerdict: marketSnapshot.regime.biasVerdict.includes("CAUTION")
            ? marketSnapshot.regime.biasVerdict
            : `MACRO/HTF ${marketSnapshot.regime.htfTrend} (1m Flow Suppressed — Feed Lag ${feedLagSeconds}s)`,
        },
      }
    : marketSnapshot;

  // Merge any chart-visible key levels (e.g. ORH_3m, ORL_3m, VWAP) into snapshot levels before anchoring
  const mergedKeyLevels = [...sanitizedSnapshot.keyLevels];
  for (const vis of chartState.visibleKeyLevels || []) {
    if (
      Number.isFinite(vis.price) &&
      vis.price > 0 &&
      !mergedKeyLevels.some(
        (l) =>
          l.shortName.toLowerCase() === vis.label.toLowerCase() ||
          Math.abs(l.price - vis.price) < 0.75
      )
    ) {
      mergedKeyLevels.push({
        name: vis.label,
        shortName: vis.label,
        price: vis.price,
        distancePoints: round2(vis.price - chartState.liveSpot),
        role: "CHART_VISIBLE",
        timeframe: chartState.timeframe || "1m",
        source: "CHART_SCREENSHOT",
        timestamp: new Date().toISOString(),
        staleness: "FRESH",
      });
    }
  }

  const effectiveSnapshot: ChatMarketContextSnapshot = {
    ...sanitizedSnapshot,
    keyLevels: mergedKeyLevels,
  };

  const baseQuant = computeScreenshotQuantMetrics(
    chartStateToQuantInput(chartState),
    effectiveSnapshot
  );

  // Diurnal Expected Move (sqrt(252) + remaining RTH window)
  const currentMinuteET = accountProfile.currentMinuteET ?? getCurrentMinutesET();
  const sessionWindow = resolveSessionWindowFromMinutesET(currentMinuteET);
  const pdc = marketSnapshot.quote.previousClose || chartState.liveSpot;
  const ivPct = marketSnapshot.volatilityAndMacro.vxn || marketSnapshot.volatilityAndMacro.vix || 20;
  const diurnalEmCalc = computeDiurnalExpectedMove(
    pdc,
    ivPct,
    currentMinuteET,
    RTH_CLOSE_MINUTE_ET
  );

  const safeRemainingStraddle = Math.max(10, diurnalEmCalc.remainingExpectedMoveStraddle);
  const pullbackStretchPct =
    baseQuant.pullbackNeededToFillPts !== null
      ? round2((baseQuant.pullbackNeededToFillPts / safeRemainingStraddle) * 100)
      : null;
  const targetStretchPct =
    baseQuant.targetDistancePts !== null
      ? round2((baseQuant.targetDistancePts / safeRemainingStraddle) * 100)
      : null;

  // Re-evaluate STRETCHED_LOW_FILL_ODDS against diurnal remaining Straddle instead of flat full-day Straddle
  let limitSetupVerdict = baseQuant.limitSetupVerdict;
  const limitSetupReasons = [...baseQuant.limitSetupReasons];
  if (
    baseQuant.setupState === "PENDING_LIMIT_ORDER" &&
    pullbackStretchPct !== null &&
    limitSetupVerdict !== "INVALID"
  ) {
    if (pullbackStretchPct > 85 && limitSetupVerdict !== "STRETCHED_LOW_FILL_ODDS") {
      limitSetupVerdict = "STRETCHED_LOW_FILL_ODDS";
      limitSetupReasons.unshift(
        `Entry sits ${baseQuant.pullbackNeededToFillPts?.toFixed(1)} pts (${pullbackStretchPct.toFixed(0)}% of remaining diurnal Straddle ${safeRemainingStraddle.toFixed(1)} pts) away — low fill odds.`
      );
    } else if (pullbackStretchPct <= 85 && limitSetupVerdict === "STRETCHED_LOW_FILL_ODDS") {
      limitSetupVerdict =
        baseQuant.stopLossSource === "SUGGESTED_STRUCTURAL" ||
        baseQuant.layer1RiskMultiplier === 0.5
          ? "VALID_WITH_ADJUSTMENTS"
          : "VALID";
    }
  }

  // Volatility-Scaled Stop Sanity Check
  const atr5mDiurnal =
    accountProfile.atr5mDiurnalPts ??
    Math.max(
      8,
      round2((baseQuant.atrOpen15m / Math.sqrt(3)) * Math.max(0.45, diurnalEmCalc.diurnalScaleFactor))
    );
  const stopRange = computeVolatilityScaledStopRange(chartState.liveSpot, atr5mDiurnal);

  let stopStatus: ScalpVerdictResult["volatilityScaledStop"]["status"] = "UNSPECIFIED";
  if (baseQuant.stopDistancePts !== null) {
    if (baseQuant.stopDistancePts < stopRange.minPts) stopStatus = "TOO_TIGHT";
    else if (baseQuant.stopDistancePts > stopRange.maxPts) stopStatus = "WIDE";
    else stopStatus = "OPTIMAL";
  }

  // Exact MNQ contract sizing per fixed risk unit ($100, $150, $200, $250, $300 + custom)
  const riskUnits = Array.from(
    new Set(
      [100, 150, 200, 250, 300, accountProfile.riskBudgetDollars]
        .filter((v): v is number => typeof v === "number" && v > 0)
    )
  ).sort((a, b) => a - b);
  const effectiveStopForSizing = baseQuant.stopDistancePts ?? stopRange.recommendedPts;
  const mnqPerContractRisk = Math.max(1, effectiveStopForSizing * 2 + 1.24);
  const mnqSizingTable: ContractSizingUnit[] = riskUnits.map((budget) => {
    const mnqContracts = Math.max(0, Math.floor(budget / mnqPerContractRisk));
    return {
      riskBudgetDollars: budget,
      mnqContracts,
      actualRiskDollars: round2(mnqContracts * mnqPerContractRisk),
    };
  });

  // Stop-Constrained Double-Barrier Hit Odds
  const tp1Dist =
    baseQuant.targetDistancePts ??
    (baseQuant.takeProfitTargets[0]
      ? Math.abs(baseQuant.takeProfitTargets[0].distanceFromScreenshotPts)
      : round2(effectiveStopForSizing * 1.2));
  const tp2Dist =
    chartState.tp2Px != null
      ? round2(Math.abs(chartState.tp2Px - (baseQuant.entryPrice ?? chartState.liveSpot)))
      : baseQuant.takeProfitTargets[1]
      ? Math.abs(baseQuant.takeProfitTargets[1].distanceFromScreenshotPts)
      : null;

  const isCautionRegime =
    marketSnapshot.regime.biasVerdict.includes("CAUTION") ||
    marketSnapshot.regime.biasVerdict.includes("STAND ASIDE") ||
    baseQuant.layer1RiskMultiplier === 0 ||
    baseQuant.liveBiasAtScreenshot.direction === "NEUTRAL";
  const isDirectionAligned =
    !isCautionRegime &&
    ((baseQuant.direction === "LONG" && marketSnapshot.regime.biasVerdict.includes("BULLISH")) ||
      (baseQuant.direction === "SHORT" && marketSnapshot.regime.biasVerdict.includes("BEARISH")));

  const sigma1mPts = round2((0.5 * Math.max(10, baseQuant.atrOpen15m)) / Math.sqrt(15));
  const driftPtsPerMin = isDirectionAligned ? round2(0.08 * sigma1mPts) : 0;

  const doubleBarrierOdds: DoubleBarrierOdds | null =
    effectiveStopForSizing > 0 && tp1Dist > 0
      ? {
          tp1HitBeforeSlPct5m: round2(
            computeDoubleBarrierHitProbability({
              tpPts: tp1Dist,
              slPts: effectiveStopForSizing,
              horizonMinutes: 5,
              atrOpen15m: baseQuant.atrOpen15m,
              driftPtsPerMin,
            }) * 100
          ),
          tp1HitBeforeSlPct10m: round2(
            computeDoubleBarrierHitProbability({
              tpPts: tp1Dist,
              slPts: effectiveStopForSizing,
              horizonMinutes: 10,
              atrOpen15m: baseQuant.atrOpen15m,
              driftPtsPerMin,
            }) * 100
          ),
          tp1HitBeforeSlPct15m: round2(
            computeDoubleBarrierHitProbability({
              tpPts: tp1Dist,
              slPts: effectiveStopForSizing,
              horizonMinutes: 15,
              atrOpen15m: baseQuant.atrOpen15m,
              driftPtsPerMin,
            }) * 100
          ),
          tp2HitBeforeSlPct15m:
            tp2Dist !== null && tp2Dist > 0
              ? round2(
                  computeDoubleBarrierHitProbability({
                    tpPts: tp2Dist,
                    slPts: effectiveStopForSizing,
                    horizonMinutes: 15,
                    atrOpen15m: baseQuant.atrOpen15m,
                    driftPtsPerMin,
                  }) * 100
                )
              : null,
          driftPtsPerMin,
          sigma1mPts,
          model: "ABSORBING_DOUBLE_BARRIER_T4",
        }
      : null;

  // Prop-Firm Drawdown-Aware Exit Directive
  const accountDrawdownMode: AccountDrawdownMode =
    accountProfile.accountDrawdownMode || "INTRADAY_UNREALIZED";
  const blockingMagnet = baseQuant.obstaclesBeforeTarget[0] ?? null;
  const isStressedVol =
    baseQuant.isNegativeVrp ||
    baseQuant.vixTermRatio > 1.0 ||
    baseQuant.vvix >= 110;
  const isExtendedTarget =
    (baseQuant.plannedRewardToRisk !== null && baseQuant.plannedRewardToRisk >= 2.3) ||
    (targetStretchPct !== null && targetStretchPct >= 80);

  const exitPolicy = computeDrawdownExitPolicy({
    accountDrawdownMode,
    direction: baseQuant.direction,
    contracts: baseQuant.contracts,
    entryPrice: baseQuant.entryPrice ?? chartState.liveSpot,
    stopPts: effectiveStopForSizing,
    atr5mPts: atr5mDiurnal,
    netGammaRegime: baseQuant.netGammaRegime,
    hasBlockingMagnet: blockingMagnet !== null,
    blockingMagnetPrice: blockingMagnet?.price ?? null,
    blockingMagnetName: blockingMagnet?.shortName ?? null,
    isStressedVol,
    isExtendedTarget,
    targetPrice: baseQuant.targetPrice,
  });

  const antiChaseInvalidation =
    baseQuant.stopLossPrice !== null
      ? `Hard SL ${baseQuant.stopLossPrice.toFixed(2)} (${effectiveStopForSizing.toFixed(1)} pts)${
          baseQuant.setupState === "PENDING_LIMIT_ORDER"
            ? `; do not chase market @ ${chartState.liveSpot.toFixed(2)}`
            : ""
        }`
      : `Wait for structural invalidation >= ${stopRange.recommendedPts.toFixed(1)} pts`;

  let verdictAction: ScalpVerdictResult["verdictAction"] = "GO";
  if (
    baseQuant.newsShouldVetoTrade ||
    baseQuant.layer1RiskMultiplier === 0 ||
    limitSetupVerdict === "INVALID"
  ) {
    verdictAction = "VETO";
  } else if (
    baseQuant.layer1RiskMultiplier === 0.5 ||
    limitSetupVerdict === "STRETCHED_LOW_FILL_ODDS" ||
    stopStatus === "TOO_TIGHT"
  ) {
    verdictAction = "HALF-SIZE";
  }

  const nextRedNewsLabel =
    typeof chartState.newsCountdownMinutes === "number" &&
    baseQuant.newsSeverity === "RED_HIGH"
      ? `${chartState.newsEventName || "Red News"} in ${chartState.newsCountdownMinutes}m`
      : typeof chartState.newsCountdownMinutes === "number"
      ? `None (${chartState.newsEventName || "Minor"} ${chartState.newsCountdownMinutes}m)`
      : "None imminent";

  const warnings = [...baseQuant.warnings];
  if (isStaleBackendFeed) {
    warnings.unshift(
      `STALE BACKEND FEED (${feedLagSeconds}s > 90s): 1m openingFlow/footprint suppressed; anchored strictly to screenshot liveSpot ${chartState.liveSpot.toFixed(2)}.`
    );
  }
  if (stopStatus === "TOO_TIGHT" && baseQuant.stopDistancePts !== null) {
    warnings.push(
      `STOP TOO TIGHT (${baseQuant.stopDistancePts.toFixed(1)} pts < diurnal floor ${stopRange.minPts.toFixed(1)} pts for spot ${chartState.liveSpot.toFixed(0)}).`
    );
  }

  return {
    ...baseQuant,
    detectedSetupArchetype: chartState.detectedSetupArchetype,
    limitSetupVerdict,
    limitSetupReasons,
    pullbackNeededPctOfStraddle: pullbackStretchPct ?? baseQuant.pullbackNeededPctOfStraddle,
    targetPctOfDailyStraddle: targetStretchPct ?? baseQuant.targetPctOfDailyStraddle,
    expectedMoveStraddle: diurnalEmCalc.expectedMoveStraddle,
    expectedMove1SD: diurnalEmCalc.expectedMove1SD,
    tradeManagement: {
      ...baseQuant.tradeManagement,
      tpRecommendation: exitPolicy.tpRecommendation,
      partialTpPrice: exitPolicy.partialPrice,
      partialTpLabel: exitPolicy.partialLabel,
      tpRationale: exitPolicy.rationale,
    },
    verdictAction,
    sessionWindow,
    accountDrawdownMode,
    feedLagSeconds,
    isStaleBackendFeed,
    suppressedStaleLtfFlow: isStaleBackendFeed,
    diurnalEm: {
      annualizationDays: 252,
      fullDay1SD: diurnalEmCalc.expectedMove1SD,
      fullDayStraddle: diurnalEmCalc.expectedMoveStraddle,
      remainingStraddle: diurnalEmCalc.remainingExpectedMoveStraddle,
      diurnalScaleFactor: diurnalEmCalc.diurnalScaleFactor,
      pullbackStretchPct,
      targetStretchPct,
    },
    doubleBarrierOdds,
    volatilityScaledStop: {
      minPts: stopRange.minPts,
      maxPts: stopRange.maxPts,
      recommendedPts: stopRange.recommendedPts,
      atr5mDiurnalPts: stopRange.atr5mDiurnalPts,
      status: stopStatus,
    },
    mnqSizingTable,
    exitDirective: {
      action: exitPolicy.tpRecommendation,
      partialPct: exitPolicy.partialPct,
      partialAtR: exitPolicy.partialAtR,
      partialPrice: exitPolicy.partialPrice,
      trailBehindPeakPts: exitPolicy.trailBehindPeakPts,
      trailFormula: exitPolicy.trailFormula,
      antiChaseInvalidation,
      summaryLine: `${exitPolicy.rationale} | ${antiChaseInvalidation}`,
    },
    blockingMagnet,
    nextRedNewsLabel,
    warnings,
  };
}
