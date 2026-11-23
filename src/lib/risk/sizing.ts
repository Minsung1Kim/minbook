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
