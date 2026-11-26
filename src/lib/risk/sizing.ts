import { PropProfile, PROP_PRESETS, getPropProfile } from "./propProfile";

export const DEFAULT_FEES_PER_RT: Record<"NQ" | "MNQ", number> = {
  MNQ: 1.24, // $1.24 per round-trip MNQ contract
  NQ: 4.50 // $4.50 per round-trip NQ contract
};

export interface DrawdownExitPolicyInput {
  accountDrawdownMode: "INTRADAY_UNREALIZED" | "EOD_TRAILING" | "CASH_LIVE";
  direction: "LONG" | "SHORT" | "NONE";
  contracts: number;
  entryPrice: number;
  stopPts: number;
  atr5mPts?: number;
  netGammaRegime?: string;
  hasBlockingMagnet?: boolean;
  blockingMagnetPrice?: number | null;
  blockingMagnetName?: string | null;
  isStressedVol?: boolean;
  isExtendedTarget?: boolean;
  targetPrice?: number | null;
}

export interface DrawdownExitPolicy {
  tpRecommendation: "TAKE_PARTIALS" | "STICK_WITH_FULL_TP" | "SINGLE_CONTRACT_TRAIL";
  partialPct: number | null;
  partialAtR: number | null;
  partialPrice: number | null;
  partialLabel: string | null;
  trailBehindPeakPts: number | null;
  trailStartR: number | null;
  trailFormula: string;
  rationale: string;
}

/**
 * Deterministic prop-firm drawdown-aware exit policy shared across sizing & /chat verdict engines.
 */
export function computeDrawdownExitPolicy(input: DrawdownExitPolicyInput): DrawdownExitPolicy {
  const {
    accountDrawdownMode,
    direction,
    contracts,
    entryPrice,
    stopPts,
    atr5mPts = 20,
    netGammaRegime = "UNAVAILABLE",
    hasBlockingMagnet = false,
    blockingMagnetPrice = null,
    blockingMagnetName = null,
    isStressedVol = false,
    isExtendedTarget = false,
    targetPrice = null,
  } = input;

  const dirSign = direction === "SHORT" ? -1 : direction === "LONG" ? 1 : 0;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const trailPts = Math.round(Math.max(8, Math.min(14, 0.35 * atr5mPts)) * 10) / 10;
  const trailFormula =
    direction === "SHORT"
      ? `min(entry ${entryPrice.toFixed(2)}, peakPx + ${trailPts.toFixed(1)} pts)`
      : `max(entry ${entryPrice.toFixed(2)}, peakPx - ${trailPts.toFixed(1)} pts)`;

  if (dirSign === 0) {
    return {
      tpRecommendation: "TAKE_PARTIALS",
      partialPct: 50,
      partialAtR: 1.0,
      partialPrice: null,
      partialLabel: "Opposing Edge / VWAP",
      trailBehindPeakPts: trailPts,
      trailStartR: 1.0,
      trailFormula,
      rationale: "Range-bound / neutral stance: take partials at opposing range edge or VWAP.",
    };
  }

  if (accountDrawdownMode === "INTRADAY_UNREALIZED") {
    if (contracts >= 2) {
      const r12Pts = round2(stopPts * 1.2);
      const r12Price = round2(entryPrice + dirSign * r12Pts);
      const magnetDist =
        blockingMagnetPrice !== null ? Math.abs(blockingMagnetPrice - entryPrice) : null;
      const snapToMagnet =
        hasBlockingMagnet &&
        blockingMagnetPrice !== null &&
        magnetDist !== null &&
        magnetDist > 2 &&
        magnetDist < r12Pts;

      const partialPrice = snapToMagnet ? blockingMagnetPrice! : r12Price;
      const partialAtR =
        snapToMagnet && stopPts > 0 ? round2(magnetDist! / stopPts) : 1.2;
      const partialLabel = snapToMagnet
        ? `${blockingMagnetName || "Blocking Magnet"} (+${partialAtR.toFixed(2)}R)`
        : `+1.2R (${partialPrice.toFixed(2)})`;

      return {
        tpRecommendation: "TAKE_PARTIALS",
        partialPct: 50,
        partialAtR,
        partialPrice,
        partialLabel,
        trailBehindPeakPts: trailPts,
        trailStartR: partialAtR,
        trailFormula,
        rationale: `INTRADAY_UNREALIZED: Scale 50% at ${partialLabel} and trail remaining runner dynamically behind peak (${trailFormula}) to prevent phantom drawdown bleed.`,
      };
    }

    // Single contract under INTRADAY_UNREALIZED
    const triggerPts = Math.max(12, round2(stopPts * 1.0));
    const triggerPrice = round2(entryPrice + dirSign * triggerPts);
    return {
      tpRecommendation: "SINGLE_CONTRACT_TRAIL",
      partialPct: null,
      partialAtR: null,
      partialPrice: triggerPrice,
      partialLabel: `+1.0R / min 12 pts (${triggerPrice.toFixed(2)})`,
      trailBehindPeakPts: trailPts,
      trailStartR: 1.0,
      trailFormula,
      rationale: `SINGLE_CONTRACT_TRAIL (INTRADAY_UNREALIZED): Activate dynamic peak trail at +1.0R (min 12 pts, ${triggerPrice.toFixed(2)}) using ${trailFormula}.`,
    };
  }

  // EOD_TRAILING or CASH_LIVE:
  // STICK_WITH_FULL_TP is strictly reserved for unobstructed NEGATIVE_GAMMA trends.
  const canHoldFullTp =
    (accountDrawdownMode === "EOD_TRAILING" || accountDrawdownMode === "CASH_LIVE") &&
    netGammaRegime === "NEGATIVE_GAMMA" &&
    !hasBlockingMagnet &&
    !isStressedVol &&
    !isExtendedTarget;

  if (canHoldFullTp) {
    return {
      tpRecommendation: "STICK_WITH_FULL_TP",
      partialPct: null,
      partialAtR: null,
      partialPrice: targetPrice,
      partialLabel: targetPrice ? `Full TP (${targetPrice.toFixed(2)})` : "Full TP",
      trailBehindPeakPts: null,
      trailStartR: null,
      trailFormula: `Move SL to BE at +1.0R, hold full size to TP`,
      rationale: `STICK_WITH_FULL_TP (${accountDrawdownMode}): Unobstructed NEGATIVE_GAMMA trend supports full expansion target without premature scaling.`,
    };
  }

  if (contracts === 1) {
    const triggerPts = Math.max(12, round2(stopPts * 1.0));
    const triggerPrice = round2(entryPrice + dirSign * triggerPts);
    return {
      tpRecommendation: "SINGLE_CONTRACT_TRAIL",
      partialPct: null,
      partialAtR: null,
      partialPrice: blockingMagnetPrice ?? triggerPrice,
      partialLabel: blockingMagnetName || `+1.0R Trail (${triggerPrice.toFixed(2)})`,
      trailBehindPeakPts: trailPts,
      trailStartR: 1.0,
      trailFormula,
      rationale: `SINGLE_CONTRACT_TRAIL (${accountDrawdownMode}): Not an unobstructed -Gamma trend; trail behind peak (${trailFormula}) once past +1.0R (${triggerPrice.toFixed(2)}) or exit at ${blockingMagnetName || "magnet"}.`,
    };
  }

  const partialPts = round2(stopPts * 1.5);
  const defaultPartialPrice = round2(entryPrice + dirSign * partialPts);
  const partialPrice =
    hasBlockingMagnet && blockingMagnetPrice !== null
      ? blockingMagnetPrice
      : defaultPartialPrice;
  const partialAtR =
    hasBlockingMagnet && blockingMagnetPrice !== null && stopPts > 0
      ? round2(Math.abs(blockingMagnetPrice - entryPrice) / stopPts)
      : 1.5;

  return {
    tpRecommendation: "TAKE_PARTIALS",
    partialPct: 50,
    partialAtR,
    partialPrice,
    partialLabel:
      hasBlockingMagnet && blockingMagnetName
        ? `${blockingMagnetName} (${partialPrice.toFixed(2)})`
        : `+1.5R (${partialPrice.toFixed(2)})`,
    trailBehindPeakPts: trailPts,
    trailStartR: partialAtR,
    trailFormula,
    rationale: `TAKE_PARTIALS (${accountDrawdownMode}): Scale 50% at ${blockingMagnetName || "+1.5R"} (${partialPrice.toFixed(2)}) and trail runner via ${trailFormula}.`,
  };
}

export interface DetailedRiskPlanInputs {
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number;
  targetRR?: number;
  instrument: "NQ" | "MNQ";
  baseRiskDollars?: number;
  realPropDrawdown?: number;
  regimeMultiplier?: number;
  atr15m?: number;
  feePerContractRT?: number;
  propProfile?: PropProfile;
}

export interface DetailedRiskPlan {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  stopPts: number;
  targetPts: number;
  rawRR: number;
  instrument: "NQ" | "MNQ";
  suggestedContracts: number;
  grossRiskDollars: number;
  grossTargetDollars: number;
  totalFees: number;
  slippageDollars: number;
  netRiskDollars: number;
  netTargetDollars: number;
  netRR: number;
  drawdownRiskPercent: number;
  isStopTooTight: boolean;
  isDrawdownRiskElevated: boolean;
  warnings: string[];
  recommendationSummary: string;
  contractSplitDirective: string;
  phantomDrawdownWarning?: string;
  consistencyCapWarning?: string;
  tighterEntryRequired?: {
    maxStopPts: number;
    requiredEntryPrice: number;
    directive: string;
  };
}

export function computeDetailedRiskPlan(inputs: DetailedRiskPlanInputs): DetailedRiskPlan {
  const {
    entryPrice,
    stopPrice,
    instrument,
    regimeMultiplier = 1.0,
    atr15m = 25.0,
    propProfile
  } = inputs;

  const baseRiskDollars = inputs.baseRiskDollars ?? (propProfile ? Math.min(250, propProfile.currentRemainingDrawdown * 0.125) : 250);
  const realPropDrawdown = inputs.realPropDrawdown ?? (propProfile ? propProfile.currentRemainingDrawdown : 2000);

  const pointValue = instrument === "NQ" ? 20 : 2;
  const defaultFee = propProfile
    ? instrument === "NQ"
      ? propProfile.nqFeeRoundTrip
      : propProfile.mnqFeeRoundTrip
    : DEFAULT_FEES_PER_RT[instrument];
  const feePerContractRT = inputs.feePerContractRT ?? defaultFee;
  const slippageTicks = propProfile ? propProfile.defaultSlippageTicks : 0;
  const slippagePts = slippageTicks * 0.25; // 3 ticks = 0.75 pt when propProfile active

  const direction: "LONG" | "SHORT" = stopPrice < entryPrice ? "LONG" : "SHORT";
  const stopPts = Math.max(0.25, Math.round(Math.abs(entryPrice - stopPrice) * 100) / 100);

  let targetPrice = inputs.targetPrice;
  let targetPts = 0;
  let rawRR = inputs.targetRR || 2.2;

  // Intraday Unrealized Drawdown Cap
  const isIntradayUnrealized = propProfile?.drawdownMode === "INTRADAY_UNREALIZED";
  if (isIntradayUnrealized && rawRR > 1.8) {
    rawRR = 1.8;
  }

  if (targetPrice !== undefined && targetPrice > 0) {
    targetPts = Math.max(0.25, Math.round(Math.abs(targetPrice - entryPrice) * 100) / 100);
    rawRR = Math.round((targetPts / stopPts) * 100) / 100;
    if (isIntradayUnrealized && rawRR > 1.8) {
      rawRR = 1.8;
      targetPts = Math.round(stopPts * 1.8 * 100) / 100;
      targetPrice =
        direction === "LONG"
          ? Math.round((entryPrice + targetPts) * 100) / 100
          : Math.round((entryPrice - targetPts) * 100) / 100;
    }
  } else {
    targetPts = Math.round(stopPts * rawRR * 100) / 100;
    targetPrice =
      direction === "LONG"
        ? Math.round((entryPrice + targetPts) * 100) / 100
        : Math.round((entryPrice - targetPts) * 100) / 100;
  }

  const adjustedRiskDollars = Math.round(baseRiskDollars * regimeMultiplier * 100) / 100;

  // Granular Contract Sizing factoring all-in execution friction when propProfile is active
  let suggestedContracts = 0;
  if (regimeMultiplier > 0) {
    if (instrument === "MNQ") {
      const perContractRisk = (stopPts + slippagePts) * 2 + (propProfile ? feePerContractRT : 0);
      suggestedContracts = Math.max(0, Math.floor(adjustedRiskDollars / perContractRisk));
    } else {
      const costFor1NQ = (stopPts + slippagePts) * 20 + (propProfile ? feePerContractRT : 0);
      suggestedContracts = adjustedRiskDollars >= costFor1NQ * 0.7 ? 1 : 0;
    }
  }

  const grossRiskDollars = Math.round(suggestedContracts * stopPts * pointValue * 100) / 100;
  const grossTargetDollars = Math.round(suggestedContracts * targetPts * pointValue * 100) / 100;
  const totalFees = Math.round(suggestedContracts * feePerContractRT * 100) / 100;
  const slippageDollars = Math.round(suggestedContracts * slippagePts * pointValue * 100) / 100;

  const totalFriction = totalFees + slippageDollars;
  const netRiskDollars = Math.round((grossRiskDollars + totalFriction) * 100) / 100;
  const netTargetDollars = Math.round(Math.max(0, grossTargetDollars - totalFriction) * 100) / 100;
  const netRR = netRiskDollars > 0 ? Math.round((netTargetDollars / netRiskDollars) * 100) / 100 : rawRR;

  const safeDrawdown = realPropDrawdown > 0 ? realPropDrawdown : 2000;
  const drawdownRiskPercent = Math.round((netRiskDollars / safeDrawdown) * 1000) / 10;

  const isStopTooTight = stopPts < 0.5 * atr15m;
  const isDrawdownRiskElevated = drawdownRiskPercent > 12.5;

  const warnings: string[] = [];
  if (regimeMultiplier === 0) {
    warnings.push("STAND ASIDE: Regime multiplier is 0.0x. Do not risk capital today.");
  } else if (regimeMultiplier === 0.5) {
    warnings.push("0.5x REGIME SIZE CUT: High volatility, backwardation, or negative VRP active.");
  }

  if (isStopTooTight && suggestedContracts > 0) {
    warnings.push(
      `STOP TOO TIGHT (${stopPts.toFixed(1)} pts < 0.5x 15m ATR of ${(0.5 * atr15m).toFixed(1)} pts). Standard 15m opening noise will clip this stop.`
    );
  }

  if (isDrawdownRiskElevated && suggestedContracts > 0) {
    warnings.push(
      `DRAWDOWN RISK ELEVATED (${drawdownRiskPercent}% of $${safeDrawdown}). Maximum recommended is 12.5%.`
    );
  }

  // Intraday Unrealized Warnings
  let phantomDrawdownWarning: string | undefined;
  if (isIntradayUnrealized) {
    phantomDrawdownWarning =
      "PHANTOM DRAWDOWN WARNING: Firm enforces live intraday unrealized trailing drawdown. Unbooked profit peaks permanently ratchet your loss threshold. Breakeven runners prohibited; cap target at 1.3R–1.8R and bank profits.";
    warnings.push(phantomDrawdownWarning);
  }

  // Consistency Rule Ceilings
  let consistencyCapWarning: string | undefined;
  if (propProfile?.consistencyRulePercent && propProfile.cycleProfitTarget > 0) {
    const rulePct = propProfile.consistencyRulePercent;
    // Set safety buffer below ceiling (e.g. 38% on 40% rule, 28% on 30% rule, 48% on 50% rule)
    const safetyBufferMultiplier = rulePct === 40 ? 0.38 : rulePct === 35 ? 0.33 : rulePct === 30 ? 0.28 : (rulePct - 2) / 100;
    const consistencyCeiling = Math.round(safetyBufferMultiplier * propProfile.cycleProfitTarget);

    if (grossTargetDollars > consistencyCeiling) {
      const bufferPct = Math.round(safetyBufferMultiplier * 100);
      consistencyCapWarning = `CONSISTENCY CAP WARNING: Target profit ($${grossTargetDollars.toFixed(0)}) exceeds firm single-day consistency ceiling ($${consistencyCeiling} [${bufferPct}% on ${rulePct}% rule]). Truncate target or bank partials early to preserve payout eligibility.`;
      warnings.push(consistencyCapWarning);
    }
  }

  // Quantization & Contract Split Directives
  let contractSplitDirective = "";
  let tighterEntryRequired: DetailedRiskPlan["tighterEntryRequired"];

  if (suggestedContracts >= 2) {
    const half1 = Math.floor(suggestedContracts / 2);
    const half2 = suggestedContracts - half1;
    if (isIntradayUnrealized) {
      const exitPolicy = computeDrawdownExitPolicy({
        accountDrawdownMode: "INTRADAY_UNREALIZED",
        direction,
        contracts: suggestedContracts,
        entryPrice,
        stopPts,
        atr5mPts: atr15m * 0.577,
      });
      contractSplitDirective = `INTRADAY TRAILING PARTIALS: Scale ${half1} ${instrument} (50%) at +1.2R (${exitPolicy.partialPrice?.toFixed(2)}), and dynamically trail ${half2} ${instrument} behind peak (${exitPolicy.trailFormula}). Static breakeven holds prohibited.`;
    } else {
      contractSplitDirective = `PARTIALS ACTIVE: Scale out ${half1} ${instrument} at TP1, hold ${half2} ${instrument} runner toward TP2.`;
    }
  } else if (suggestedContracts === 1) {
    if (isIntradayUnrealized) {
      const exitPolicy = computeDrawdownExitPolicy({
        accountDrawdownMode: "INTRADAY_UNREALIZED",
        direction,
        contracts: 1,
        entryPrice,
        stopPts,
        atr5mPts: atr15m * 0.577,
      });
      contractSplitDirective = `SINGLE_CONTRACT_TRAIL (1 ${instrument}): Lock trail starting at +1.0R (min 12 pts, ${exitPolicy.partialPrice?.toFixed(2)}) via ${exitPolicy.trailFormula}.`;
    } else {
      contractSplitDirective = `1 ${instrument} ALL-OUT AT TP1: Single contract active. Partial profit scale-outs disabled. Exit 100% position at TP1 to eliminate drawdown decay.`;
    }
  } else {
    // 0 Contracts: calculate exact tighter entry needed to fit >= 2 MNQ within risk budget
    const targetContracts = 2;
    const maxStopPts = Math.max(
      2.0,
      Math.floor(((adjustedRiskDollars - (targetContracts * feePerContractRT)) / (targetContracts * pointValue) - slippagePts) * 10) / 10
    );
    const requiredEntryPrice =
      direction === "LONG"
        ? Math.round((stopPrice + maxStopPts) * 100) / 100
        : Math.round((stopPrice - maxStopPts) * 100) / 100;

    const directive = `RETRACE ENTRY REQUIRED: Cannot fit >= 2 MNQ with a ${stopPts.toFixed(1)} pt stop on $${adjustedRiskDollars} risk budget. Wait for limit entry at ${requiredEntryPrice.toFixed(2)} (${maxStopPts.toFixed(1)} pt stop) to size 2 MNQ.`;
    tighterEntryRequired = {
      maxStopPts,
      requiredEntryPrice,
      directive
    };
    contractSplitDirective = directive;
    warnings.push(directive);
  }

  const recommendationSummary =
    suggestedContracts > 0
      ? `Run ${suggestedContracts} ${instrument} ${direction} at ${entryPrice.toFixed(2)}, stop ${stopPrice.toFixed(2)} (${stopPts.toFixed(1)} pts), target ${targetPrice.toFixed(2)} (${targetPts.toFixed(1)} pts • ${netRR.toFixed(2)}R net). Net Risk: $${netRiskDollars.toFixed(0)} • Net Target: $${netTargetDollars.toFixed(0)} (${contractSplitDirective}).`
      : (tighterEntryRequired?.directive || `Stop distance (${stopPts.toFixed(1)} pts) too wide for 1 ${instrument} on $${adjustedRiskDollars} budget.`);

  return {
    direction,
    entryPrice,
    stopPrice,
    targetPrice,
    stopPts,
    targetPts,
    rawRR,
    instrument,
    suggestedContracts,
    grossRiskDollars,
    grossTargetDollars,
    totalFees,
    slippageDollars,
    netRiskDollars,
    netTargetDollars,
    netRR,
    drawdownRiskPercent,
    isStopTooTight,
    isDrawdownRiskElevated,
    warnings,
    recommendationSummary,
    contractSplitDirective,
    phantomDrawdownWarning,
    consistencyCapWarning,
    tighterEntryRequired
  };
}

export interface SizingInputs {
  realPropDrawdown?: number; // e.g. $2,000
  baseRiskDollars?: number; // e.g. $250 ($200-$300)
  targetRR?: number; // e.g. 2.2R
  instrument?: "NQ" | "MNQ";
  stopDistancePts: number; // e.g. 15-30 pts
  regimeRiskMultiplier?: number; // 1.0, 0.5, or 0.0
  atr15m?: number; // e.g. 24.5 pts
  propProfile?: PropProfile;
}

export interface SizingResult {
  instrument: "NQ" | "MNQ";
  pointValue: number;
  stopDistancePts: number;
  regimeRiskMultiplier: number;
  adjustedRiskDollars: number;
  suggestedContracts: number;
  actualDollarRisk: number;
  targetPoints: number;
  actualTargetDollars: number;
  drawdownRiskPercent: number;
  isStopTooTight: boolean;
  isDrawdownRiskElevated: boolean;
  warnings: string[];
  recommendationSummary: string;
  contractSplitDirective?: string;
  phantomDrawdownWarning?: string;
  consistencyCapWarning?: string;
  tighterEntryRequired?: {
    maxStopPts: number;
    requiredEntryPrice: number;
    directive: string;
  };
}

export function computePositionSizing(inputs: SizingInputs): SizingResult {
  const {
    instrument = "MNQ",
    stopDistancePts = 20,
    regimeRiskMultiplier = 1.0,
    atr15m = 25.0,
    propProfile
  } = inputs;

  const detailedPlan = computeDetailedRiskPlan({
    entryPrice: 21000,
    stopPrice: 21000 - stopDistancePts,
    targetRR: inputs.targetRR,
    instrument,
    baseRiskDollars: inputs.baseRiskDollars,
    realPropDrawdown: inputs.realPropDrawdown,
    regimeMultiplier: regimeRiskMultiplier,
    atr15m,
    propProfile
  });

  return {
    instrument,
    pointValue: instrument === "NQ" ? 20 : 2,
    stopDistancePts: detailedPlan.stopPts,
    regimeRiskMultiplier,
    adjustedRiskDollars: Math.round((inputs.baseRiskDollars ?? 250) * regimeRiskMultiplier * 100) / 100,
    suggestedContracts: detailedPlan.suggestedContracts,
    actualDollarRisk: propProfile ? detailedPlan.netRiskDollars : detailedPlan.grossRiskDollars,
    targetPoints: detailedPlan.targetPts,
    actualTargetDollars: propProfile ? detailedPlan.netTargetDollars : detailedPlan.grossTargetDollars,
    drawdownRiskPercent: propProfile
      ? detailedPlan.drawdownRiskPercent
      : Math.round((detailedPlan.grossRiskDollars / (inputs.realPropDrawdown || 2000)) * 1000) / 10,
    isStopTooTight: detailedPlan.isStopTooTight,
    isDrawdownRiskElevated: detailedPlan.isDrawdownRiskElevated,
    warnings: detailedPlan.warnings,
    recommendationSummary: detailedPlan.recommendationSummary,
    contractSplitDirective: detailedPlan.contractSplitDirective,
    phantomDrawdownWarning: detailedPlan.phantomDrawdownWarning,
    consistencyCapWarning: detailedPlan.consistencyCapWarning,
    tighterEntryRequired: detailedPlan.tighterEntryRequired
  };
}
