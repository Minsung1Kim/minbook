import { ChatMarketContextSnapshot } from "@/types/chat";

export interface ScreenshotQuantInput {
  instrument?: "NQ" | "MNQ";
  timeframe?: string;
  screenshotCurrentPrice: number;
  direction?: "LONG" | "SHORT" | "NONE";
  positionStatus?: "OPEN" | "PLANNED_FLAT" | "UNKNOWN";
  entryPrice?: number;
  stopLossPrice?: number;
  targetPrice?: number;
  contracts?: number;
  accountBalance?: number;
  openPnlDollars?: number;
  newsCountdownMinutes?: number;
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

  // Position & R:R math
  direction: "LONG" | "SHORT" | "NONE";
  positionStatus: "OPEN" | "PLANNED_FLAT" | "UNKNOWN";
  entryPrice: number | null;
  stopLossPrice: number | null;
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

  // Live current-second execution check
  missedFromPlannedEntryPts: number | null;
  marketEntryNowStopPts: number | null;
  marketEntryNowTargetPts: number | null;
  marketEntryNowRewardToRisk: number | null;
  marketEntryNowDollarRisk: number | null;
  openTradeUnrealizedPts: number | null;
  openTradeUnrealizedDollars: number | null;
  openTradeCurrentR: number | null;

  // Budget & Layer 1 Quant Sizing
  userRiskBudgetDollars: number;
  maxDailyLossDollars: number;
  layer1RiskMultiplier: number;
  regimeAdjustedRiskBudgetDollars: number;
  maxRecommendedContracts: number | null;
  exceedsUserRiskBudget: boolean;
  exceedsRegimeAdjustedBudget: boolean;

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

  // Candle structure read from OHLC if present
  candleStats: {
    rangePts: number;
    bodyPts: number;
    upperWickPts: number;
    lowerWickPts: number;
    closeInRangePct: number;
    biasNote: string;
  } | null;

  // Structural Level Anchoring relative to screenshot live price
  nearestLevelsAbove: AnchoredLevelDistance[];
  nearestLevelsBelow: AnchoredLevelDistance[];
  obstaclesBeforeTarget: AnchoredLevelDistance[];
  protectingLevelsBetweenPriceAndStop: AnchoredLevelDistance[];

  // Synthesized Verdict & Warnings
  actionStance: string;
  warnings: string[];
  quantHighlights: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  const entry =
    typeof input.entryPrice === "number" && Number.isFinite(input.entryPrice)
      ? input.entryPrice
      : null;
  const stop =
    typeof input.stopLossPrice === "number" && Number.isFinite(input.stopLossPrice)
      ? input.stopLossPrice
      : null;
  const target =
    typeof input.targetPrice === "number" && Number.isFinite(input.targetPrice)
      ? input.targetPrice
      : null;

  const effectiveEntry = entry ?? px;
  const stopDistancePts = stop !== null ? round2(Math.abs(effectiveEntry - stop)) : null;
  const targetDistancePts = target !== null ? round2(Math.abs(target - effectiveEntry)) : null;
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

  // Live current-price delta vs planned entry & market-entry recalculation
  let missedFromPlannedEntryPts: number | null = null;
  if (entry !== null && direction !== "NONE") {
    missedFromPlannedEntryPts = round2(
      direction === "SHORT" ? entry - px : px - entry
    );
  }

  let marketEntryNowStopPts: number | null = null;
  let marketEntryNowTargetPts: number | null = null;
  if (stop !== null) {
    marketEntryNowStopPts = round2(
      direction === "SHORT"
        ? stop - px
        : direction === "LONG"
        ? px - stop
        : Math.abs(stop - px)
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
  if (positionStatus === "OPEN" && entry !== null && direction !== "NONE") {
    openTradeUnrealizedPts = round2(direction === "SHORT" ? entry - px : px - entry);
    openTradeUnrealizedDollars = round2(openTradeUnrealizedPts * pointValueDollars * contracts);
    if (stopDistancePts && stopDistancePts > 0) {
      openTradeCurrentR = round2(openTradeUnrealizedPts / stopDistancePts);
    }
  }

  // Risk Budget & Sizing
  const userRiskBudgetDollars = snapshot.journal.riskBudgetDollars ?? 250;
  const maxDailyLossDollars = snapshot.journal.maxDailyLossDollars ?? 350;
  const layer1RiskMultiplier = snapshot.regime.riskMultiplier;
  const regimeAdjustedRiskBudgetDollars = round2(userRiskBudgetDollars * layer1RiskMultiplier);

  const activeRiskPts =
    positionStatus === "PLANNED_FLAT" &&
    missedFromPlannedEntryPts !== null &&
    missedFromPlannedEntryPts > 0 &&
    marketEntryNowStopPts !== null &&
    marketEntryNowStopPts > 0
      ? marketEntryNowStopPts
      : stopDistancePts;

  const activeDollarRisk =
    positionStatus === "PLANNED_FLAT" &&
    missedFromPlannedEntryPts !== null &&
    missedFromPlannedEntryPts > 0 &&
    marketEntryNowDollarRisk !== null
      ? marketEntryNowDollarRisk
      : dollarRiskPlanned;

  const maxRecommendedContracts =
    activeRiskPts && activeRiskPts > 0
      ? Math.max(0, Math.floor(regimeAdjustedRiskBudgetDollars / (activeRiskPts * pointValueDollars)))
      : null;
  const exceedsUserRiskBudget =
    activeDollarRisk !== null ? activeDollarRisk > userRiskBudgetDollars : false;
  const exceedsRegimeAdjustedBudget =
    activeDollarRisk !== null ? activeDollarRisk > regimeAdjustedRiskBudgetDollars : false;

  // Volatility, ATR & Expected Move
  const atrOpen15m = snapshot.regime.atrOpen15m || 25;
  const expectedMoveStraddle = snapshot.regime.expectedMoveStraddle || 80;
  const expectedMove1SD = snapshot.regime.expectedMove1SD || 120;
  const stopInAtr15m = stopDistancePts !== null ? round2(stopDistancePts / atrOpen15m) : null;
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
      biasNote = "Strong lower-wick buyer rejection (hammer/absorption)";
    } else if (upperWickPts > bodyPts * 1.3 && closeInRangePct <= 40) {
      biasNote = "Strong upper-wick seller rejection (shooter/supply)";
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

  // Re-anchor all MinBook structural levels relative to screenshot's live price
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

  const obstaclesBeforeTarget =
    target !== null && direction !== "NONE"
      ? anchoredLevels
          .filter((l) =>
            direction === "SHORT"
              ? l.price < px - 3 && l.price > target + 3
              : l.price > px + 3 && l.price < target - 3
          )
          .sort((a, b) =>
            direction === "SHORT" ? b.price - a.price : a.price - b.price
          )
      : [];

  const protectingLevelsBetweenPriceAndStop =
    stop !== null && direction !== "NONE"
      ? anchoredLevels
          .filter((l) =>
            direction === "SHORT"
              ? l.price > px + 2 && l.price < stop - 2
              : l.price < px - 2 && l.price > stop + 2
          )
          .sort((a, b) =>
            direction === "SHORT" ? a.price - b.price : b.price - a.price
          )
      : [];

  // Warnings & Verdict Synthesis
  const warnings: string[] = [];
  const quantHighlights: string[] = [];

  if (snapshot.quote.stalenessBadge === "DELAYED" || snapshot.quote.stalenessBadge === "STALE") {
    const feedDeltaPts = round2(px - snapshot.quote.price);
    warnings.push(
      `MinBook quote is ${snapshot.quote.stalenessBadge} (${snapshot.quote.price.toFixed(2)}, delta vs screenshot ${feedDeltaPts >= 0 ? "+" : ""}${feedDeltaPts.toFixed(2)} pts); structural levels below were re-anchored to your live screenshot price ${px.toFixed(2)}.`
    );
  }

  if (layer1RiskMultiplier === 0) {
    warnings.push(
      `LAYER 1 RISK VETO (0x SIZE): ${snapshot.regime.activeVetoes.join("; ") || snapshot.regime.biasVerdict}. Quant rules require staying flat until volatility stabilizes.`
    );
  } else if (layer1RiskMultiplier === 0.5) {
    warnings.push(
      `LAYER 1 HALF-SIZE GATE (0.5x): Adjusted risk budget drops from $${userRiskBudgetDollars} to $${regimeAdjustedRiskBudgetDollars.toFixed(2)}; target cap ~1.8R unless runners trail cleanly.`
    );
  }

  if (typeof input.newsCountdownMinutes === "number" && input.newsCountdownMinutes <= 30) {
    warnings.push(
      `IMMINENT MACRO NEWS IN ${input.newsCountdownMinutes}m: High-impact release window ahead — flatten, trim size, or lock stops to breakeven before the print.`
    );
  }

  if (
    positionStatus === "PLANNED_FLAT" &&
    missedFromPlannedEntryPts !== null &&
    missedFromPlannedEntryPts > 15 &&
    marketEntryNowStopPts !== null &&
    marketEntryNowStopPts > 0
  ) {
    warnings.push(
      `DO NOT CHASE AT MARKET: Price is already ${missedFromPlannedEntryPts.toFixed(2)} pts past your planned entry (${entry?.toFixed(2)}). Entering at ${px.toFixed(2)} expands your stop to ${marketEntryNowStopPts.toFixed(2)} pts ($${marketEntryNowDollarRisk?.toFixed(2)}) and drops R:R from ${plannedRewardToRisk ?? "?"}R down to ${marketEntryNowRewardToRisk ?? "?"}R.`
    );
  }

  if (stopSizingAssessment === "TOO_TIGHT_SWEEP_RISK" && stopDistancePts !== null) {
    warnings.push(
      `STOP TOO TIGHT (${stopDistancePts.toFixed(2)} pts = ${stopInAtr15m}x ATR_Open_15m): Below 0.5x 15m ATR (~${(atrOpen15m * 0.5).toFixed(1)} pts) risks normal opening noise sweeping you out.`
    );
  } else if (stopSizingAssessment === "WIDE" && stopDistancePts !== null) {
    warnings.push(
      `WIDE STOP (${stopDistancePts.toFixed(2)} pts = ${stopInAtr15m}x ATR_Open_15m): Wider than 2.5x 15m ATR; tighten invalidation to a closer structure level or reduce contracts.`
    );
  }

  if (exceedsRegimeAdjustedBudget && activeDollarRisk !== null) {
    warnings.push(
      `RISK BUDGET EXCEEDED: $${activeDollarRisk.toFixed(2)} risk > $${regimeAdjustedRiskBudgetDollars.toFixed(2)} Layer-1 adjusted budget ($${userRiskBudgetDollars} base × ${layer1RiskMultiplier}x).`
    );
  }

  if (targetPctOfDailyStraddle !== null && targetPctOfDailyStraddle > 120) {
    warnings.push(
      `EXTENDED TARGET (${targetPctOfDailyStraddle.toFixed(0)}% of daily expected Straddle ${expectedMoveStraddle.toFixed(1)} pts): Take partial profits at nearer MinBook magnets along the path.`
    );
  }

  if (plannedRewardToRisk !== null && breakEvenWinRatePct !== null) {
    quantHighlights.push(
      `Planned R:R ${plannedRewardToRisk.toFixed(2)}R (${stopDistancePts?.toFixed(2)} pt SL / ${targetDistancePts?.toFixed(2)} pt TP) | Break-even win rate ${breakEvenWinRatePct.toFixed(1)}% | EV ${expectedValueR !== null && expectedValueR >= 0 ? "+" : ""}${expectedValueR?.toFixed(2)}R at ${winRateAssumedPct.toFixed(0)}% WR`
    );
  }
  quantHighlights.push(
    `15m ATR_Open ${atrOpen15m.toFixed(1)} pts | Daily Straddle ±${expectedMoveStraddle.toFixed(1)} pts | 1-SD ±${expectedMove1SD.toFixed(1)} pts`
  );
  quantHighlights.push(
    `Vol Surface: VIX/VIX3M ${snapshot.volatilityAndMacro.termRatio.toFixed(2)} (${snapshot.volatilityAndMacro.termStructureRegime}), VRP ${snapshot.volatilityAndMacro.vrpRatio.toFixed(2)} (${snapshot.volatilityAndMacro.isNegativeVrp ? "RV > IV" : "Normal"}), VVIX ${snapshot.volatilityAndMacro.vvix.toFixed(1)}`
  );

  // Determine clear Action Stance
  let actionStance = "ANALYZE STRUCTURE BEFORE ENTRY";
  if (layer1RiskMultiplier === 0) {
    actionStance = "STAND ASIDE / STAY FLAT (LAYER 1 RISK VETO)";
  } else if (
    positionStatus === "OPEN" &&
    openTradeUnrealizedPts !== null &&
    openTradeUnrealizedPts > 0
  ) {
    actionStance =
      typeof input.newsCountdownMinutes === "number" && input.newsCountdownMinutes <= 30
        ? "IN PROFIT — LOCK BREAKEVEN / SCALE PARTIALS AHEAD OF NEWS"
        : `HOLD & TRAIL STOP (${openTradeCurrentR !== null ? `+${openTradeCurrentR.toFixed(2)}R` : `+${openTradeUnrealizedPts.toFixed(1)} pts`} unrealized)`;
  } else if (
    positionStatus === "PLANNED_FLAT" &&
    missedFromPlannedEntryPts !== null &&
    missedFromPlannedEntryPts > 15
  ) {
    actionStance = `DO NOT CHASE NOW — WAIT FOR PULLBACK TOWARD ${entry?.toFixed(2)} OR FRESH TRIGGER`;
  } else if (typeof input.newsCountdownMinutes === "number" && input.newsCountdownMinutes <= 15) {
    actionStance = `WAIT FOR NEWS RELEASE (${input.newsCountdownMinutes}m)`;
  } else if (plannedRewardToRisk !== null && plannedRewardToRisk < 1.3) {
    actionStance = "SKIP OR REFINE ENTRY — R:R TOO LOW";
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
    positionStatus,
    entryPrice: entry,
    stopLossPrice: stop,
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
    missedFromPlannedEntryPts,
    marketEntryNowStopPts,
    marketEntryNowTargetPts,
    marketEntryNowRewardToRisk,
    marketEntryNowDollarRisk,
    openTradeUnrealizedPts,
    openTradeUnrealizedDollars,
    openTradeCurrentR,
    userRiskBudgetDollars,
    maxDailyLossDollars,
    layer1RiskMultiplier,
    regimeAdjustedRiskBudgetDollars,
    maxRecommendedContracts,
    exceedsUserRiskBudget,
    exceedsRegimeAdjustedBudget,
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
    candleStats,
    nearestLevelsAbove,
    nearestLevelsBelow,
    obstaclesBeforeTarget,
    protectingLevelsBetweenPriceAndStop,
    actionStance,
    warnings,
    quantHighlights,
  };
}
