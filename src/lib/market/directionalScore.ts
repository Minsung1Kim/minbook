import {
  SessionMetrics,
  MacroRegimeState,
  MarketQuote,
  CandleFootprintData,
  Layer2DirectionalSignal,
  Layer2DirectionalScore,
  BiasVerdict
} from "@/types/market";

export interface EvaluateDirectionalScoreParams {
  currentPrice: number;
  metrics: SessionMetrics;
  htfTrend: "BULLISH" | "BEARISH" | "NEUTRAL / RANGING";
  macroRegime?: MacroRegimeState;
  qqqProxyQuote?: MarketQuote;
  footprintBars?: CandleFootprintData[];
  reversalVetoActive?: boolean;
  reversalVetoReason?: string;
  weights?: Record<string, number>;
}

/**
 * Layer 2: Orthogonal Directional Score
 * 
 * Aggregates strictly at most 4 orthogonal directional signals:
 * 1. Composite HTF & Auction Location (consolidating HTF trend, PDC, VWAP, and ON Mid)
 * 2. Cross-Index SMT Divergence + Mega-Cap Breadth
 * 3. 23h Macro Impulse via ZN Futures & US Dollar Index
 * 4. Opening Flow (Volume-Weighted Wick Rejection / Delta Proxy)
 * 
 * Equal baseline 1.0 weights.
 * Excludes non-directional volatility and GEX entirely.
 */
export function evaluateLayer2DirectionalScore(
  params: EvaluateDirectionalScoreParams
): Layer2DirectionalScore {
  const {
    currentPrice,
    metrics,
    htfTrend,
    macroRegime,
    qqqProxyQuote,
    footprintBars = [],
    reversalVetoActive = false,
    reversalVetoReason,
    weights
  } = params;

  const wLocation = weights?.compositeLocation ?? 1.0;
  const wSmt = weights?.smtBreadth ?? 1.0;
  const wMacro = weights?.macroImpulse ?? 1.0;
  const wFlow = weights?.openingFlow ?? 1.0;

  // ---------------------------------------------------------------------------
  // Signal 1: Composite HTF & Auction Location
  // ---------------------------------------------------------------------------
  let locationPoints = 0;
  if (htfTrend === "BULLISH") locationPoints += 1;
  else if (htfTrend === "BEARISH") locationPoints -= 1;

  if (currentPrice > metrics.pdc) locationPoints += 1;
  else if (currentPrice < metrics.pdc) locationPoints -= 1;

  if (currentPrice > metrics.sessionVwap) locationPoints += 1;
  else if (currentPrice < metrics.sessionVwap) locationPoints -= 1;

  if (currentPrice > metrics.onMid) locationPoints += 1;
  else if (currentPrice < metrics.onMid) locationPoints -= 1;

  let locationScore: -1 | 0 | 1 = 0;
  if (locationPoints >= 2) locationScore = 1;
  else if (locationPoints <= -2) locationScore = -1;

  // Apply conditional reversal-risk veto to location score:
  // If overnight inventory >= 70% but trading below ON Mid: Long vote is suppressed!
  // If overnight inventory <= 30% but trading above ON Mid: Short vote is suppressed!
  if (metrics.inventoryPercent >= 70 && currentPrice < metrics.onMid) {
    if (locationScore > 0) locationScore = 0;
  } else if (metrics.inventoryPercent <= 30 && currentPrice > metrics.onMid) {
    if (locationScore < 0) locationScore = 0;
  }

  const signalLocation: Layer2DirectionalSignal = {
    id: "compositeLocation",
    name: "Composite HTF / Auction Location",
    score: locationScore,
    impact: locationScore === 1 ? "BULLISH" : locationScore === -1 ? "BEARISH" : "NEUTRAL",
    weight: wLocation,
    detail: `Consolidated location score (${locationPoints >= 0 ? "+" : ""}${locationPoints}/4): HTF is ${htfTrend}, trading ${currentPrice > metrics.pdc ? "above" : "below"} PDC (${metrics.pdc}) and ${currentPrice > metrics.sessionVwap ? "above" : "below"} VWAP (${metrics.sessionVwap}).`
  };

  // ---------------------------------------------------------------------------
  // Signal 2: Cross-Index SMT Divergence + Mega-Cap Breadth
  // ---------------------------------------------------------------------------
  let smtScore: -1 | 0 | 1 = 0;
  let smtDetail = "NQ and ES moving in sync; breadth neutral.";

  if (metrics.smtDivergence?.hasDivergence) {
    const isBullSmt = metrics.smtDivergence.divergenceType.includes("BULLISH");
    const isBearSmt = metrics.smtDivergence.divergenceType.includes("BEARISH");
    if (isBullSmt) {
      smtScore = 1;
      smtDetail = `Bullish SMT Divergence: ${metrics.smtDivergence.notes}`;
    } else if (isBearSmt) {
      smtScore = -1;
      smtDetail = `Bearish SMT Divergence: ${metrics.smtDivergence.notes}`;
    }
  } else if (qqqProxyQuote) {
    // Un-delayed equity proxy breadth confirmation
    if (qqqProxyQuote.changePercent > 0.25) {
      smtScore = 1;
      smtDetail = `QQQ equity proxy confirming bullish opening breadth (+${qqqProxyQuote.changePercent.toFixed(2)}%).`;
    } else if (qqqProxyQuote.changePercent < -0.25) {
      smtScore = -1;
      smtDetail = `QQQ equity proxy confirming bearish opening breadth (${qqqProxyQuote.changePercent.toFixed(2)}%).`;
    }
  }

  const signalSmt: Layer2DirectionalSignal = {
    id: "smtBreadth",
    name: "Cross-Index SMT + Breadth",
    score: smtScore,
    impact: smtScore === 1 ? "BULLISH" : smtScore === -1 ? "BEARISH" : "NEUTRAL",
    weight: wSmt,
    detail: smtDetail
  };

  // ---------------------------------------------------------------------------
  // Signal 3: 23h Macro Impulse via ZN Futures & Dollar Index
  // ---------------------------------------------------------------------------
  let macroScore: -1 | 0 | 1 = 0;
  let macroDetail = "Macro rates and dollar impulse neutral.";

  if (macroRegime) {
    if (macroRegime.macroHeadwindScore > 0) {
      macroScore = 1;
      macroDetail = `Macro Tailwind (+${macroRegime.macroHeadwindScore}): 23h ZN futures ${macroRegime.znChange !== undefined ? `${macroRegime.znChange >= 0 ? "+" : ""}${macroRegime.znChange}` : "steady"}, supporting tech equity continuation.`;
    } else if (macroRegime.macroHeadwindScore < 0) {
      macroScore = -1;
      macroDetail = `Macro Headwind (${macroRegime.macroHeadwindScore}): Rate/dollar pressure active via 23h ZN (${macroRegime.znChange !== undefined ? `${macroRegime.znChange >= 0 ? "+" : ""}${macroRegime.znChange}` : "falling"}).`;
    }
  }

  const signalMacro: Layer2DirectionalSignal = {
    id: "macroImpulse",
    name: "23h Macro Impulse via ZN/DX",
    score: macroScore,
    impact: macroScore === 1 ? "BULLISH" : macroScore === -1 ? "BEARISH" : "NEUTRAL",
    weight: wMacro,
    detail: macroDetail
  };

  // ---------------------------------------------------------------------------
  // Signal 4: Opening Flow (Volume-Weighted Wick Rejection)
  // ---------------------------------------------------------------------------
  let flowScore: -1 | 0 | 1 = 0;
  let flowDetail = "Opening flow balanced; no aggressive wick rejection or initiative sweep.";

  const recentBars = footprintBars.slice(-3);
  const buySignal = recentBars.some(
    (b) => b.signal === "VWWR_BUY" || b.signal === "IMP_BUY" || b.signal === "ABS_BUY"
  );
  const sellSignal = recentBars.some(
    (b) => b.signal === "VWWR_SELL" || b.signal === "IMP_SELL" || b.signal === "ABS_SELL"
  );

  if (buySignal && !sellSignal) {
    flowScore = 1;
    flowDetail = "Bullish Volume-Weighted Wick Rejection / Initiative Buying detected.";
  } else if (sellSignal && !buySignal) {
    flowScore = -1;
    flowDetail = "Bearish Volume-Weighted Wick Rejection / Initiative Selling detected.";
  } else if (footprintBars.length > 0) {
    const lastBar = footprintBars[footprintBars.length - 1];
    if (lastBar.deltaRatio > 0.40) {
      flowScore = 1;
      flowDetail = `Positive net delta ratio (+${lastBar.deltaRatio.toFixed(2)}) on recent candle.`;
    } else if (lastBar.deltaRatio < -0.40) {
      flowScore = -1;
      flowDetail = `Negative net delta ratio (${lastBar.deltaRatio.toFixed(2)}) on recent candle.`;
    }
  }

  const signalFlow: Layer2DirectionalSignal = {
    id: "openingFlow",
    name: "Opening Flow (VWWR)",
    score: flowScore,
    impact: flowScore === 1 ? "BULLISH" : flowScore === -1 ? "BEARISH" : "NEUTRAL",
    weight: wFlow,
    detail: flowDetail
  };

  const signals = [signalLocation, signalSmt, signalMacro, signalFlow];
  const totalScore = signals.reduce((sum, s) => sum + s.score * s.weight, 0);

  let verdict: BiasVerdict = "CAUTION / CHOP RISK";
  let confidence: Layer2DirectionalScore["confidence"] = "LOW";

  if (totalScore >= 2.0 && (!reversalVetoActive || locationScore >= 0)) {
    verdict = "CONTINUATION FAVORED (BULLISH)";
    confidence = totalScore >= 3.0 ? "HIGH" : "MODERATE";
  } else if (totalScore <= -2.0 && (!reversalVetoActive || locationScore <= 0)) {
    verdict = "CONTINUATION FAVORED (BEARISH)";
    confidence = totalScore <= -3.0 ? "HIGH" : "MODERATE";
  } else {
    verdict = "CAUTION / CHOP RISK";
    confidence = "LOW";
  }

  let summary = `Directional Score: ${totalScore >= 0 ? "+" : ""}${totalScore.toFixed(1)}/4.0 (${verdict}).`;
  if (reversalVetoActive && reversalVetoReason) {
    summary += ` Note: ${reversalVetoReason}`;
  }

  const direction: "BULLISH" | "BEARISH" | "NEUTRAL" =
    totalScore >= 1.0 ? "BULLISH" : totalScore <= -1.0 ? "BEARISH" : "NEUTRAL";

  return {
    signals,
    totalScore,
    direction,
    verdict,
    confidence,
    summary
  };
}
