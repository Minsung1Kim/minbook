import {
  VolatilitySurface,
  GEXExposureData,
  SessionMetrics,
  MacroIndicator,
  Layer1RiskGates
} from "@/types/market";

export interface EvaluateRiskGatesParams {
  currentPrice: number;
  metrics: SessionMetrics;
  volatilitySurface?: VolatilitySurface;
  gex?: GEXExposureData;
  vix?: MacroIndicator;
  hasRedFolderNewsAroundOpen?: boolean;
}

/**
 * Layer 1: Multiplicative Risk Gates & Target Caps
 * 
 * Evaluates non-directional market regime states:
 * - Volatility surface (VRP ratio, VIX/VIX3M term structure, VVIX, short-term shock)
 * - Dealer Gamma (GEX) pinning vs dispersion
 * - Overnight inventory reversal-risk veto
 * - Tier 1 economic news proximity
 * 
 * Strictly non-directional: outputs a size multiplier (1.0x / 0.5x / 0.0x) and target cap.
 * Never adds or subtracts directional points.
 */
export function evaluateLayer1RiskGates(params: EvaluateRiskGatesParams): Layer1RiskGates {
  const {
    currentPrice,
    metrics,
    volatilitySurface,
    gex,
    vix,
    hasRedFolderNewsAroundOpen = false
  } = params;

  let sizeMultiplier: 1.0 | 0.5 | 0.0 = 1.0;
  let targetCapMultipleR = 2.2; // default standard scalp cap
  let allowTrading = true;
  const activeVetoes: string[] = [];
  const gateDetails: string[] = [];

  // 1. Overnight Inventory Reversal-Risk Veto
  // If overnight was heavily long (>=70%) BUT price opens/trades below ON Mid,
  // longs are trapped and offside: inventory flush liquidation risk active.
  // If overnight was heavily short (<=30%) BUT price trades above ON Mid,
  // shorts are trapped: short squeeze expansion risk active.
  let reversalVetoActive = false;
  let reversalVetoReason: string | undefined = undefined;

  if (metrics.inventoryPercent >= 70 && currentPrice < metrics.onMid) {
    reversalVetoActive = true;
    reversalVetoReason = `Overnight inventory is heavily long (${metrics.inventoryPercent}%), but price is trading below Overnight Midpoint (${metrics.onMid}). Trapped overnight longs offside; opening liquidation flush risk active. Unconditional bullish continuation vetoed.`;
    activeVetoes.push(reversalVetoReason);
    gateDetails.push("REVERSAL VETO: Trapped Long Inventory Flush");
    sizeMultiplier = 0.5;
  } else if (metrics.inventoryPercent <= 30 && currentPrice > metrics.onMid) {
    reversalVetoActive = true;
    reversalVetoReason = `Overnight inventory is heavily short (${metrics.inventoryPercent}%), but price is trading above Overnight Midpoint (${metrics.onMid}). Trapped overnight shorts offside; short-squeeze expansion risk active. Unconditional bearish continuation vetoed.`;
    activeVetoes.push(reversalVetoReason);
    gateDetails.push("REVERSAL VETO: Trapped Short Squeeze Risk");
    sizeMultiplier = 0.5;
  }

  // 2. Volatility Surface & VRP Risk Gates
  let vrpRatio = 1.0;
  let isNegativeVrp = false;
  let termRatio = 1.0;
  let vvix = 95;
  let termStructureRegime = "CONTANGO (NORMAL)";

  if (volatilitySurface) {
    vrpRatio = volatilitySurface.vrpRatio ?? (volatilitySurface.realizedVolYZ20d > 0 ? volatilitySurface.vxn / volatilitySurface.realizedVolYZ20d : 1.0);
    isNegativeVrp = volatilitySurface.isNegativeVrp || vrpRatio < 1.0;
    termRatio = volatilitySurface.termRatio;
    vvix = volatilitySurface.vvix;
    termStructureRegime = volatilitySurface.termStructureRegime;

    // A. Dimensionless VRP Ratio < 1.0 (RV > IV)
    if (isNegativeVrp) {
      sizeMultiplier = 0.5;
      targetCapMultipleR = Math.min(targetCapMultipleR, 1.8);
      const note = `NEGATIVE VRP (Ratio: ${vrpRatio.toFixed(2)} < 1.00): Realized volatility exceeds implied options pricing. Tail-risk / stop-run dislocation elevated. Risk scaled to 0.5x.`;
      gateDetails.push(note);
      activeVetoes.push(note);
    }

    // B. Volatility Term Structure Backwardation
    if (termStructureRegime === "BACKWARDATION (STRESS)" || termRatio > 1.0) {
      sizeMultiplier = 0.5;
      targetCapMultipleR = Math.min(targetCapMultipleR, 1.8);
      const note = `TERM STRUCTURE BACKWARDATION (VIX/VIX3M: ${termRatio.toFixed(2)} > 1.00): Inverted volatility curve reflects acute institutional crash hedging. High risk of sudden reversals in both directions; risk scaled to 0.5x.`;
      gateDetails.push(note);
      activeVetoes.push(note);
    }

    // C. Near-term shock (VIX9D / VIX > 1.15)
    if (volatilitySurface.isShortTermShock) {
      sizeMultiplier = 0.5;
      const note = `SHORT-TERM VOL SHOCK (VIX9D/VIX: ${volatilitySurface.shortTermShockRatio.toFixed(2)} > 1.15): High-frequency opening volatility hazard active.`;
      gateDetails.push(note);
    }

    // D. Vol-of-Vol Risk (VVIX >= 110)
    if (vvix >= 110) {
      sizeMultiplier = 0.5;
      targetCapMultipleR = Math.min(targetCapMultipleR, 1.8);
      const note = `VVIX ELEVATED (${vvix.toFixed(1)} >= 110): Volatility of vol indicates rapid gamma swings and violent wick expansion.`;
      gateDetails.push(note);
    }
  } else if (vix && vix.value > 26) {
    sizeMultiplier = 0.5;
    targetCapMultipleR = 1.8;
    gateDetails.push(`VIX elevated at ${vix.value.toFixed(1)} (>26). Risk scaled to 0.5x.`);
  }

  // 3. Dealer Gamma (GEX) Risk Gate & Target Cap
  let gexGate: Layer1RiskGates["gexGate"] = undefined;
  if (gex) {
    const isPositiveGamma = gex.netGammaRegime === "POSITIVE_GAMMA";
    if (isPositiveGamma) {
      // In Positive Gamma, dealers hedge counter-trend: mean-reversion chop, pinning risk
      targetCapMultipleR = Math.min(targetCapMultipleR, 1.8);
      gateDetails.push(
        `DEALER GEX PINNING (+Γ): Net gamma is positive (+$${(gex.totalNetGex / 1e6).toFixed(0)}M). Volatility is dampened; targets capped at 1.8R.`
      );
      gexGate = {
        regime: "POSITIVE_GAMMA",
        targetCapR: 1.8,
        pinningRisk: true
      };
    } else {
      // In Negative Gamma, dealers amplify trend momentum
      gexGate = {
        regime: "NEGATIVE_GAMMA",
        targetCapR: 2.2,
        pinningRisk: false
      };
      gateDetails.push("DEALER GEX ACCELERATION (-Γ): Net gamma is negative; momentum expansion permitted.");
    }
  }

  // 4. Volatility-Normalized Compression & Pinch Checks
  if (metrics.overnightRangeConsumedPercent < 30) {
    sizeMultiplier = Math.min(sizeMultiplier, 0.5) as 1.0 | 0.5 | 0.0;
    targetCapMultipleR = Math.min(targetCapMultipleR, 1.8);
    gateDetails.push(
      `RANGE COMPRESSION: Overnight consumed only ${metrics.overnightRangeConsumedPercent.toFixed(1)}% of expected move. Elevated opening chop risk.`
    );
  }

  const pinchThreshold = 0.35 * (metrics.atrOpen15m || metrics.atr15mIntraday || 25);
  if (
    Math.abs(currentPrice - metrics.sessionVwap) < pinchThreshold &&
    Math.abs(currentPrice - metrics.pdc) < pinchThreshold * 1.2
  ) {
    targetCapMultipleR = Math.min(targetCapMultipleR, 1.8);
    gateDetails.push(
      `PINCH ZONE: Price pinched between PDC (${metrics.pdc}) and Session VWAP (${metrics.sessionVwap}) within ${pinchThreshold.toFixed(1)} pts.`
    );
  }

  // 5. Tier 1 Economic News Proximity Veto
  if (hasRedFolderNewsAroundOpen) {
    gateDetails.push("TIER 1 NEWS CATALYST: High-impact economic release scheduled near open (09:45 / 10:00 ET).");
    if (termRatio > 1.0 || (vix && vix.value > 28)) {
      sizeMultiplier = 0.0;
      allowTrading = false;
      const vetoMsg = "STAND ASIDE VETO: High-impact news combined with backwardation/extreme volatility. Trading halted.";
      activeVetoes.push(vetoMsg);
      gateDetails.push(vetoMsg);
    } else {
      sizeMultiplier = Math.min(sizeMultiplier, 0.5) as 1.0 | 0.5 | 0.0;
    }
  }

  return {
    sizeMultiplier,
    targetCapMultipleR,
    allowTrading,
    activeVetoes,
    gateDetails,
    volatilityState: {
      vrpRatio,
      isNegativeVrp,
      termRatio,
      vvix,
      termStructureRegime
    },
    gexGate,
    reversalVetoActive,
    reversalVetoReason
  };
}
