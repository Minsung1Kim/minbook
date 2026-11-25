import {
  SessionMetrics,
  BiasRegime,
  BiasVerdict,
  MacroIndicator,
  VolatilitySurface,
  MacroRegimeState,
  GEXExposureData
} from "@/types/market";
import { evaluateLayer1RiskGates } from "./riskGates";

export function evaluateBiasAndRegime(
  currentPrice: number,
  metrics: SessionMetrics,
  vix?: MacroIndicator,
  hasRedFolderNewsAroundOpen?: boolean,
  volatilitySurface?: VolatilitySurface,
  macroRegime?: MacroRegimeState,
  gex?: GEXExposureData
): BiasRegime {
  const drivers: string[] = [];
  const risks: string[] = [];

  // Evaluate Layer 1 Multiplicative Risk Gates & Vetoes
  const layer1 = evaluateLayer1RiskGates({
    currentPrice,
    metrics,
    volatilitySurface,
    gex,
    vix,
    hasRedFolderNewsAroundOpen
  });

  let regimeRiskMultiplier: 1.0 | 0.5 | 0.0 = layer1.sizeMultiplier;

  // Add Layer 1 Risk Gate observations to drivers / risks
  for (const detail of layer1.gateDetails) {
    if (detail.includes("VETO") || detail.includes("NEGATIVE") || detail.includes("BACKWARDATION") || detail.includes("PINNING") || detail.includes("SHOCK")) {
      risks.push(detail);
    } else {
      drivers.push(detail);
    }
  }

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

  // 2. Standardized Overnight Inventory & Reversal Veto check
  if (layer1.reversalVetoActive && layer1.reversalVetoReason) {
    risks.push(`REVERSAL VETO: ${layer1.reversalVetoReason}`);
  } else if (metrics.inventoryPercent >= 70) {
    drivers.push(
      `Overnight inventory is heavily long (${metrics.inventoryPercent}% of Globex bars accepted above PDC).`
    );
  } else if (metrics.inventoryPercent <= 30) {
    drivers.push(
      `Overnight inventory is heavily short (${metrics.inventoryPercent}% above PDC).`
    );
  } else {
    drivers.push(
      `Overnight inventory is balanced (${metrics.inventoryPercent}% above PDC).`
    );
  }

  // 3. Opening Price Location
  if (metrics.openingLocation === "ABOVE_ONH") {
    drivers.push(`Opening above Overnight High (${metrics.onh}). Runaway expansion or retest of ONH favored.`);
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

  // 6. Volatility & Chop Risk
  let chopRisk: BiasRegime["chopRisk"] = "LOW";
  const overnightAtrRatio = metrics.overnightRange / (metrics.atr14Daily || 160);

  if (layer1.activeVetoes.some((v) => v.includes("BACKWARDATION") || v.includes("STAND ASIDE"))) {
    chopRisk = "SEVERE";
  } else if (layer1.activeVetoes.length > 0 || layer1.sizeMultiplier === 0.5) {
    chopRisk = "ELEVATED";
  }

  // 7. Stock-Bond Correlation & Macro Regime via 23h ZN Futures
  if (macroRegime) {
    if (macroRegime.macroCorrelationRegime === "INFLATION / RATE-SENSITIVE") {
      if (macroRegime.macroHeadwindScore < 0) {
        risks.push(
          `RATE HEADWIND: 23h ZN down / yields rising in negative correlation regime (${macroRegime.stockBondCorrelation60d.toFixed(2)}). Multiple compression on NQ.`
        );
      } else if (macroRegime.macroHeadwindScore > 0) {
        drivers.push(
          `RATE TAILWIND: 23h ZN up / yields falling. Lower bond yields support tech equity continuation.`
        );
      }
    } else if (macroRegime.macroCorrelationRegime === "GROWTH-SCARE") {
      if (macroRegime.macroHeadwindScore < 0) {
        risks.push(
          `GROWTH SCARE: Yields dropping sharply in positive correlation regime (${macroRegime.stockBondCorrelation60d.toFixed(2)}). Recession fears weigh on equities.`
        );
      }
    }

    if (macroRegime.dxyPercentChange > 0.3) {
      risks.push(`DOLLAR SURGE (+${macroRegime.dxyPercentChange.toFixed(2)}%): Rising DXY drains liquidity from equity index futures.`);
    }
  }

  // 8. Formulate Final Verdict
  let verdict: BiasVerdict = "CAUTION / CHOP RISK";
  let confidence: BiasRegime["confidence"] = "MODERATE";
  let summary = "";

  if (!layer1.allowTrading) {
    verdict = "STAND ASIDE / HIGH VOL";
    regimeRiskMultiplier = 0.0;
    confidence = "HIGH";
    summary = "High-impact macro catalyst or severe volatility backwardation active. Capital preservation priority. Stand aside.";
  } else if (layer1.reversalVetoActive) {
    verdict = "CAUTION / CHOP RISK";
    confidence = "LOW";
    summary = layer1.reversalVetoReason || "Overnight inventory trapped offside. Stand aside from chasing opening breakout.";
  } else if (isAbovePdc && isAboveVwap && isAboveOnMid && htfTrend !== "BEARISH" && chopRisk !== "SEVERE") {
    verdict = "CONTINUATION FAVORED (BULLISH)";
    confidence = overnightAtrRatio >= 0.45 && !layer1.volatilityState.isNegativeVrp ? "HIGH" : "MODERATE";
    summary = `Bullish continuation favored. Look for a patient pullback into the ${metrics.onMid} - ${metrics.sessionVwap} zone. Invalidation below ${metrics.onl > metrics.pdc ? metrics.pdc : metrics.onl}. Target PDH (${metrics.pdh}) / ONH (${metrics.onh}).`;
  } else if (!isAbovePdc && !isAboveVwap && !isAboveOnMid && htfTrend !== "BULLISH" && chopRisk !== "SEVERE") {
    verdict = "CONTINUATION FAVORED (BEARISH)";
    confidence = overnightAtrRatio >= 0.45 && !layer1.volatilityState.isNegativeVrp ? "HIGH" : "MODERATE";
    summary = `Bearish continuation favored. Look for a pullback rally into VWAP (${metrics.sessionVwap}) or PDC (${metrics.pdc}) to stall. Target ONL (${metrics.onl}) / PDL (${metrics.pdl}).`;
  } else if (chopRisk === "SEVERE") {
    verdict = "STAND ASIDE / HIGH VOL";
    regimeRiskMultiplier = 0.0;
    confidence = "HIGH";
    summary = "High risk of sharp two-way reversals (stop-runs on both sides). Market structure conflicting with backwardation or high tail-risk volatility surface. Capital preservation priority.";
  } else {
    verdict = "CAUTION / CHOP RISK";
    confidence = "LOW";
    summary = "Mixed signals: Overnight inventory, price location, or macro indicators conflict. Demand clear wick rejection before entering.";
  }

  // 9. Ideal Retrace Zone
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
    gex,
    layer1RiskGates: layer1,
    idealRetraceZone
  };
}
