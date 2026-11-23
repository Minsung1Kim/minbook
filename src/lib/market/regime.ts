import {
  SessionMetrics,
  BiasRegime,
  BiasVerdict,
  MacroIndicator,
  VolatilitySurface,
  MacroRegimeState
} from "@/types/market";

export function evaluateBiasAndRegime(
  currentPrice: number,
  metrics: SessionMetrics,
  vix?: MacroIndicator,
  hasRedFolderNewsAroundOpen?: boolean,
  volatilitySurface?: VolatilitySurface,
  macroRegime?: MacroRegimeState
): BiasRegime {
  const drivers: string[] = [];
  const risks: string[] = [];
  let regimeRiskMultiplier: 1.0 | 0.5 | 0.0 = 1.0;

  // 1. Higher-Timeframe (HTF) Trend
  const isAbovePdc = currentPrice > metrics.pdc;
  const isAboveVwap = currentPrice > metrics.sessionVwap;
  const isAboveOnMid = currentPrice > metrics.onMid;
  const isAbovePdh = currentPrice > metrics.pdh;
  const isBelowPdl = currentPrice < metrics.pdl;

  let htfTrend: BiasRegime["htfTrend"] = "NEUTRAL / RANGING";
  if (metrics.htfImpulseDirection === "BULLISH" && metrics.pdc > metrics.pdMid) {
    htfTrend = "BULLISH";
  } else if (metrics.htfImpulseDirection === "BEARISH" && metrics.pdc < metrics.pdMid) {
    htfTrend = "BEARISH";
  } else if (metrics.pdc > metrics.pdMid && metrics.onMid > metrics.pdc) {
    htfTrend = "BULLISH";
  } else if (metrics.pdc < metrics.pdMid && metrics.onMid < metrics.pdc) {
    htfTrend = "BEARISH";
  }

  // 2. Standardized Overnight Inventory (0% to 100%)
  if (metrics.inventoryPercent >= 70) {
    drivers.push(
      `Overnight inventory is heavily long (${metrics.inventoryPercent}% of Globex bars accepted above PDC). If 9:30 AM open stalls, expect an inventory liquidation flush.`
    );
  } else if (metrics.inventoryPercent <= 30) {
    drivers.push(
      `Overnight inventory is heavily short (only ${metrics.inventoryPercent}% above PDC). Trapped overnight shorts vulnerable to aggressive short-squeeze drive.`
    );
  } else {
    drivers.push(
      `Overnight inventory is balanced (${metrics.inventoryPercent}% above PDC). Expect clean two-way auction at the open.`
    );
  }

  // 3. Opening Price Location
  if (metrics.openingLocation === "ABOVE_ONH") {
    drivers.push(`Opening above Overnight High (${metrics.onh}). Runaway expansion or immediate retest of ONH as support favored.`);
  } else if (metrics.openingLocation === "INSIDE_UPPER_GLOBEX") {
    drivers.push(`Opening in upper Globex quadrant between ON Mid (${metrics.onMid}) and ONH (${metrics.onh}).`);
  } else if (metrics.openingLocation === "INSIDE_LOWER_GLOBEX") {
    drivers.push(`Opening in lower Globex quadrant between ONL (${metrics.onl}) and ON Mid (${metrics.onMid}).`);
  } else if (metrics.openingLocation === "BELOW_ONL") {
    drivers.push(`Opening below Overnight Low (${metrics.onl}). Bearish breakdown pressure active.`);
  }

  // 4. VWAP Fair-Value Alignment
  if (isAboveVwap) {
    drivers.push(
      `Price holding above Session VWAP (${metrics.sessionVwap}) [${metrics.vwapCalculationMode === "TWAP_FALLBACK" ? "TWAP" : "VWAP"}]. Institutional intraday buyers in control.`
    );
  } else {
    drivers.push(
      `Price trading below Session VWAP (${metrics.sessionVwap}) [${metrics.vwapCalculationMode === "TWAP_FALLBACK" ? "TWAP" : "VWAP"}]. Intraday sellers capping upside momentum.`
    );
  }

  // 5. Cross-Index SMT Divergence
  if (metrics.smtDivergence && metrics.smtDivergence.hasDivergence) {
    if (metrics.smtDivergence.divergenceType.includes("BULLISH")) {
      drivers.push(`SMT CONFIRMATION: ${metrics.smtDivergence.notes}`);
    } else {
      risks.push(`SMT WARNING: ${metrics.smtDivergence.notes}`);
    }
  }

  // 6. Volatility Surface & Tail Risk Analytics
  let chopRisk: BiasRegime["chopRisk"] = "LOW";
  const overnightAtrRatio = metrics.overnightRange / (metrics.atr14Daily || 160);

  if (volatilitySurface) {
    // A. Variance Risk Premium (VRP = IV - RV)
    if (volatilitySurface.isNegativeVrp) {
      chopRisk = "ELEVATED";
      regimeRiskMultiplier = 0.5;
      risks.push(
        `NEGATIVE VRP (Realized Vol ${volatilitySurface.realizedVolYZ20d.toFixed(1)}% > IV ${volatilitySurface.vxn.toFixed(1)}%): Market is underpricing tail movement. Dislocation / stop-run risk is high; risk scaled to 0.5x.`
      );
    }

    // B. Term Structure (VIX / VIX3M)
    if (volatilitySurface.termStructureRegime === "BACKWARDATION (STRESS)") {
      chopRisk = "SEVERE";
      regimeRiskMultiplier = 0.5;
      risks.push(
        `VOLATILITY BACKWARDATION (VIX/VIX3M: ${volatilitySurface.termRatio.toFixed(2)} > 1.00): Inverted volatility term structure reflects acute market hedging. Severe whipsaw risk.`
      );
    } else if (volatilitySurface.termStructureRegime === "ELEVATED") {
      risks.push(`Term structure is elevated (VIX/VIX3M: ${volatilitySurface.termRatio.toFixed(2)}). Caution on runner targets.`);
    }

    // C. Short-term shock (VIX9D / VIX)
    if (volatilitySurface.isShortTermShock) {
      regimeRiskMultiplier = 0.5;
      risks.push(
        `SHORT-TERM VOL SHOCK (VIX9D/VIX: ${volatilitySurface.shortTermShockRatio.toFixed(2)} > 1.15): Near-term shock hazard active right at the opening bell.`
      );
    }

    // D. Volatility of VIX (VVIX)
    if (volatilitySurface.vvixRegime === "HIGH TAIL / WHIPSAW RISK (>=110)") {
      regimeRiskMultiplier = 0.5;
      risks.push(
        `VVIX HIGH (${volatilitySurface.vvix.toFixed(1)} >= 110): Volatility of vol signals rapid gamma flips and aggressive 20-30 pt wick expansion.`
      );
    }
  } else if (vix && vix.value > 26) {
    chopRisk = "SEVERE";
    regimeRiskMultiplier = 0.5;
    risks.push(`VIX elevated at ${vix.value.toFixed(1)} (>26). Erratic whipsaws expected.`);
  }

  // 7. Volatility-Normalized Compression & Pinch Checks
  if (metrics.overnightRangeConsumedPercent < 30) {
    chopRisk = "ELEVATED";
    risks.push(
      `Overnight range has consumed only ${metrics.overnightRangeConsumedPercent.toFixed(1)}% of expected daily straddle move. Tight overnight coil often triggers deceptive false breaks before true expansion.`
    );
  }

  const pinchThreshold = 0.35 * metrics.atr15mIntraday;
  if (Math.abs(currentPrice - metrics.sessionVwap) < pinchThreshold && Math.abs(currentPrice - metrics.pdc) < pinchThreshold * 1.2) {
    chopRisk = "ELEVATED";
    risks.push(
      `Price is pinched between PDC (${metrics.pdc}) and Session VWAP (${metrics.sessionVwap}) within ${pinchThreshold.toFixed(1)} pts. Wait for directional separation before committing capital.`
    );
  }

  // 8. Stock-Bond Correlation & Macro Regime
  if (macroRegime) {
    if (macroRegime.macroCorrelationRegime === "INFLATION / RATE-SENSITIVE") {
      if (macroRegime.tnxBpsChange > 3) {
        risks.push(
          `RATE HEADWIND: 10Y Yield up +${macroRegime.tnxBpsChange} bps in negative stock-bond correlation regime (${macroRegime.stockBondCorrelation60d.toFixed(2)}). Multiple compression pressure on NQ.`
        );
      } else if (macroRegime.tnxBpsChange < -3) {
        drivers.push(
          `RATE TAILWIND: 10Y Yield down ${macroRegime.tnxBpsChange} bps. Lower bond yields support tech equity continuation.`
        );
      }
    } else if (macroRegime.macroCorrelationRegime === "GROWTH-SCARE") {
      if (macroRegime.tnxBpsChange < -4) {
        risks.push(
          `GROWTH SCARE: Yields dropping sharply in positive correlation regime (${macroRegime.stockBondCorrelation60d.toFixed(2)}). Recession fears weigh on equities.`
        );
      }
    }

    if (macroRegime.dxyPercentChange > 0.3) {
      risks.push(`DOLLAR SURGE (+${macroRegime.dxyPercentChange.toFixed(2)}%): Rising DXY drains liquidity from equity index futures.`);
    }
  }

  // 9. Macro News Proximity Warning
  if (hasRedFolderNewsAroundOpen) {
    risks.push("High-impact economic release scheduled right around the open (9:45 / 10:00 AM). Spreads will widen.");
  }

  // 10. Formulate Final Verdict & Risk Scaling
  let verdict: BiasVerdict = "CAUTION / CHOP RISK";
  let confidence: BiasRegime["confidence"] = "MODERATE";
  let summary = "";

  if (hasRedFolderNewsAroundOpen && (chopRisk === "SEVERE" || (vix?.value ?? 0) > 28)) {
    verdict = "STAND ASIDE / HIGH VOL";
    regimeRiskMultiplier = 0.0;
    confidence = "HIGH";
    summary = "High-impact macro catalyst scheduled near open during elevated/stressed volatility regime. Risk of stop clipping exceeds statistical expectancy. Stand aside.";
  } else if (isAbovePdc && isAboveVwap && isAboveOnMid && htfTrend !== "BEARISH" && chopRisk !== "SEVERE") {
    verdict = "CONTINUATION FAVORED (BULLISH)";
    confidence = overnightAtrRatio >= 0.45 && !volatilitySurface?.isNegativeVrp ? "HIGH" : "MODERATE";
    summary = `Bullish continuation favored. Look for a patient retrace into the ${metrics.onMid} - ${metrics.sessionVwap} zone between 9:34 AM and 9:48 AM ET. Invalidation below ${metrics.onl > metrics.pdc ? metrics.pdc : metrics.onl}. Target PDH (${metrics.pdh}) / ONH (${metrics.onh}).`;
  } else if (!isAbovePdc && !isAboveVwap && !isAboveOnMid && htfTrend !== "BULLISH" && chopRisk !== "SEVERE") {
    verdict = "CONTINUATION FAVORED (BEARISH)";
    confidence = overnightAtrRatio >= 0.45 && !volatilitySurface?.isNegativeVrp ? "HIGH" : "MODERATE";
    summary = `Bearish continuation favored. Look for a retrace rally into VWAP (${metrics.sessionVwap}) or PDC (${metrics.pdc}) to stall between 9:34 AM and 9:48 AM ET. Target ONL (${metrics.onl}) / PDL (${metrics.pdl}).`;
  } else if (chopRisk === "SEVERE") {
    verdict = "STAND ASIDE / HIGH VOL";
    regimeRiskMultiplier = 0.0;
    confidence = "HIGH";
    summary = "Severe whipsaw risk. Market structure conflicting with backwardation or high tail-risk volatility surface. Capital preservation priority.";
  } else {
    verdict = "CAUTION / CHOP RISK";
    confidence = "LOW";
    summary = "Mixed signals: Overnight inventory, price location, or macro indicators conflict. Do not take an aggressive early entry. Demand clear wick absorption before entering.";
  }

  // 11. Ideal Retrace Zone
  let idealRetraceZone: BiasRegime["idealRetraceZone"];
  if (verdict === "CONTINUATION FAVORED (BULLISH)") {
    const lowBound = Math.min(metrics.sessionVwap, metrics.onMid);
    const highBound = Math.max(metrics.sessionVwap, metrics.onMid) + 5;
    idealRetraceZone = {
      startPrice: Math.round(lowBound * 100) / 100,
      endPrice: Math.round(highBound * 100) / 100,
      description: `Discount retrace between VWAP (${metrics.sessionVwap}) and ON Mid (${metrics.onMid})`
    };
  } else if (verdict === "CONTINUATION FAVORED (BEARISH)") {
    const lowBound = Math.min(metrics.sessionVwap, metrics.onMid) - 5;
    const highBound = Math.max(metrics.sessionVwap, metrics.pdc);
    idealRetraceZone = {
      startPrice: Math.round(lowBound * 100) / 100,
      endPrice: Math.round(highBound * 100) / 100,
      description: `Premium retrace between VWAP (${metrics.sessionVwap}) and PDC (${metrics.pdc})`
    };
  } else {
    idealRetraceZone = {
      startPrice: Math.round((metrics.pdMid - 10) * 100) / 100,
      endPrice: Math.round((metrics.pdMid + 10) * 100) / 100,
      description: `Equilibrium zone near PD Mid (${metrics.pdMid})`
    };
  }

  return {
    verdict,
    confidence,
    htfTrend,
    chopRisk,
    regimeRiskMultiplier,
    summary,
    drivers,
    risks,
    volatilitySurface,
    macroRegime,
    idealRetraceZone
  };
}
