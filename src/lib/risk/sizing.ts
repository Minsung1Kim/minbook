export const DEFAULT_FEES_PER_RT: Record<"NQ" | "MNQ", number> = {
  MNQ: 1.24, // $1.24 per round-trip MNQ contract
  NQ: 4.50 // $4.50 per round-trip NQ contract
};

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
  netRiskDollars: number;
  netTargetDollars: number;
  netRR: number;
  drawdownRiskPercent: number;
  isStopTooTight: boolean;
  isDrawdownRiskElevated: boolean;
  warnings: string[];
  recommendationSummary: string;
}

export function computeDetailedRiskPlan(inputs: DetailedRiskPlanInputs): DetailedRiskPlan {
  const {
    entryPrice,
    stopPrice,
    instrument,
    baseRiskDollars = 250,
    realPropDrawdown = 2000,
    regimeMultiplier = 1.0,
    atr15m = 25.0
  } = inputs;

  const pointValue = instrument === "NQ" ? 20 : 2;
  const defaultFee = DEFAULT_FEES_PER_RT[instrument];
  const feePerContractRT = inputs.feePerContractRT ?? defaultFee;

  const direction: "LONG" | "SHORT" = stopPrice < entryPrice ? "LONG" : "SHORT";
  const stopPts = Math.max(0.25, Math.round(Math.abs(entryPrice - stopPrice) * 100) / 100);

  let targetPrice = inputs.targetPrice;
  let targetPts = 0;
  let rawRR = inputs.targetRR || 2.2;

  if (targetPrice !== undefined && targetPrice > 0) {
    targetPts = Math.max(0.25, Math.round(Math.abs(targetPrice - entryPrice) * 100) / 100);
    rawRR = Math.round((targetPts / stopPts) * 100) / 100;
  } else {
    targetPts = Math.round(stopPts * rawRR * 100) / 100;
    targetPrice =
      direction === "LONG"
        ? Math.round((entryPrice + targetPts) * 100) / 100
        : Math.round((entryPrice - targetPts) * 100) / 100;
  }

  const adjustedRiskDollars = Math.round(baseRiskDollars * regimeMultiplier * 100) / 100;

  let suggestedContracts = 0;
  if (regimeMultiplier > 0) {
    if (instrument === "MNQ") {
      suggestedContracts = Math.max(1, Math.floor(adjustedRiskDollars / (stopPts * 2)));
    } else {
      const costFor1NQ = stopPts * 20;
      suggestedContracts = adjustedRiskDollars >= costFor1NQ * 0.7 ? 1 : 0;
    }
  }

  const grossRiskDollars = Math.round(suggestedContracts * stopPts * pointValue * 100) / 100;
  const grossTargetDollars = Math.round(suggestedContracts * targetPts * pointValue * 100) / 100;
  const totalFees = Math.round(suggestedContracts * feePerContractRT * 100) / 100;

  const netRiskDollars = Math.round((grossRiskDollars + totalFees) * 100) / 100;
  const netTargetDollars = Math.round(Math.max(0, grossTargetDollars - totalFees) * 100) / 100;
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

  const recommendationSummary =
    suggestedContracts > 0
      ? `Run ${suggestedContracts} ${instrument} ${direction} at ${entryPrice.toFixed(2)}, stop ${stopPrice.toFixed(2)} (${stopPts.toFixed(1)} pts), target ${targetPrice.toFixed(2)} (${targetPts.toFixed(1)} pts • ${netRR.toFixed(2)}R net). Net Risk: $${netRiskDollars.toFixed(0)} • Net Target: $${netTargetDollars.toFixed(0)}.`
      : `Stop distance (${stopPts.toFixed(1)} pts) too wide for 1 ${instrument} on $${adjustedRiskDollars} budget.`;

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
    netRiskDollars,
    netTargetDollars,
    netRR,
    drawdownRiskPercent,
    isStopTooTight,
    isDrawdownRiskElevated,
    warnings,
    recommendationSummary
  };
}

export interface SizingInputs {
  realPropDrawdown: number; // e.g. $2,000
  baseRiskDollars: number; // e.g. $250 ($200-$300)
  targetRR: number; // e.g. 2.2R
  instrument: "NQ" | "MNQ";
  stopDistancePts: number; // e.g. 15-30 pts
  regimeRiskMultiplier: number; // 1.0, 0.5, or 0.0
  atr15m: number; // e.g. 24.5 pts
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
}

export function computePositionSizing(inputs: SizingInputs): SizingResult {
  const {
    realPropDrawdown = 2000,
    baseRiskDollars = 250,
    targetRR = 2.2,
    instrument = "MNQ",
    stopDistancePts = 20,
    regimeRiskMultiplier = 1.0,
    atr15m = 25.0
  } = inputs;

  const pointValue = instrument === "NQ" ? 20 : 2;
  const adjustedRiskDollars = Math.round(baseRiskDollars * regimeRiskMultiplier * 100) / 100;
  const safeStopPts = Math.max(1, stopDistancePts);

  let suggestedContracts = 0;
  if (regimeRiskMultiplier > 0) {
    if (instrument === "MNQ") {
      suggestedContracts = Math.max(1, Math.floor(adjustedRiskDollars / (safeStopPts * 2)));
    } else {
      // NQ mini contract
      const costFor1NQ = safeStopPts * 20;
      suggestedContracts = adjustedRiskDollars >= costFor1NQ * 0.7 ? 1 : 0;
    }
  }

  const actualDollarRisk = Math.round(suggestedContracts * safeStopPts * pointValue * 100) / 100;
  const targetPoints = Math.round(safeStopPts * targetRR * 100) / 100;
  const actualTargetDollars = Math.round(suggestedContracts * targetPoints * pointValue * 100) / 100;

  const safeDrawdown = realPropDrawdown > 0 ? realPropDrawdown : 2000;
  const drawdownRiskPercent = Math.round((actualDollarRisk / safeDrawdown) * 1000) / 10;

  const isStopTooTight = safeStopPts < 0.5 * atr15m;
  const isDrawdownRiskElevated = drawdownRiskPercent > 12.5;

  const warnings: string[] = [];

  if (regimeRiskMultiplier === 0) {
    warnings.push("STAND ASIDE: Macro or volatility regime conflict. Do not risk capital today.");
  } else if (regimeRiskMultiplier === 0.5) {
    warnings.push("REGIME SIZE CUT: Volatility stress, backwardation, or negative VRP detected. Risk scaled to 0.5x.");
  }

  if (isStopTooTight && suggestedContracts > 0) {
    warnings.push(
      `STOP TOO TIGHT: Stop distance (${safeStopPts} pts) is narrower than 0.5x 15m ATR (${(0.5 * atr15m).toFixed(1)} pts). Standard 15m candle noise will likely clip this stop.`
    );
  }

  if (isDrawdownRiskElevated && suggestedContracts > 0) {
    warnings.push(
      `DRAWDOWN RISK ELEVATED: Risking ${drawdownRiskPercent}% of real prop drawdown ($${safeDrawdown}). Max recommended is 12.5%.`
    );
  }

  if (instrument === "NQ" && safeStopPts * 20 > baseRiskDollars * 1.25) {
    warnings.push(
      `NQ SIZING OVERBUDGET: 1 mini NQ with ${safeStopPts} pt stop costs $${safeStopPts * 20}, exceeding $${baseRiskDollars} budget. Switch to MNQ for granular risk control.`
    );
  }

  let recommendationSummary = "";
  if (regimeRiskMultiplier === 0) {
    recommendationSummary = "Stand aside. Preserve capital.";
  } else if (suggestedContracts === 0 && instrument === "NQ") {
    recommendationSummary = `Stop distance (${safeStopPts} pts) too wide for 1 NQ ($${safeStopPts * 20} risk vs $${adjustedRiskDollars} budget). Use MNQ instead.`;
  } else {
    recommendationSummary = `Run ${suggestedContracts} ${instrument} contract${suggestedContracts > 1 ? "s" : ""} with ${safeStopPts} pt stop ($${actualDollarRisk} risk). Target ${targetPoints} pts ($${actualTargetDollars}, ~${targetRR}R).`;
  }

  return {
    instrument,
    pointValue,
    stopDistancePts: safeStopPts,
    regimeRiskMultiplier,
    adjustedRiskDollars,
    suggestedContracts,
    actualDollarRisk,
    targetPoints,
    actualTargetDollars,
    drawdownRiskPercent,
    isStopTooTight,
    isDrawdownRiskElevated,
    warnings,
    recommendationSummary
  };
}
