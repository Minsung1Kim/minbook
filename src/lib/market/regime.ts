import { SessionMetrics, BiasRegime, BiasVerdict, MacroIndicator } from "@/types/market";

export function evaluateBiasAndRegime(
  currentPrice: number,
  metrics: SessionMetrics,
  vix?: MacroIndicator,
  hasRedFolderNewsAroundOpen?: boolean
): BiasRegime {
  const drivers: string[] = [];
  const risks: string[] = [];

  // Determine HTF Trend from daily closes / swing
  const isAbovePdc = currentPrice > metrics.pdc;
  const isAboveVwap = currentPrice > metrics.sessionVwap;
  const isAboveOnMid = currentPrice > metrics.onMid;
  const isAbovePdh = currentPrice > metrics.pdh;
  const isBelowPdl = currentPrice < metrics.pdl;

  let htfTrend: BiasRegime["htfTrend"] = "NEUTRAL / RANGING";
  if (metrics.pdc > metrics.pdMid && metrics.onMid > metrics.pdc) {
    htfTrend = "BULLISH";
  } else if (metrics.pdc < metrics.pdMid && metrics.onMid < metrics.pdc) {
    htfTrend = "BEARISH";
  }

  // Assess Overnight Inventory
  if (metrics.overnightInventory === "BULLISH_IMBALANCE") {
    drivers.push(`Overnight inventory is heavily long (${metrics.inventoryPercent}% above PDC). Globex buyers absorbed dips.`);
  } else if (metrics.overnightInventory === "BEARISH_IMBALANCE") {
    drivers.push(`Overnight inventory is heavily net short (${Math.abs(metrics.inventoryPercent)}% below PDC). Sellers in control.`);
  } else {
    drivers.push("Overnight inventory is balanced around PDC. Two-way trade expected at the bell.");
  }

  // Opening location
  if (metrics.openingLocation === "ABOVE_ONH") {
    drivers.push("Opening above Overnight High (ONH). Drive or immediate retest of ONH as support favored.");
  } else if (metrics.openingLocation === "INSIDE_UPPER_GLOBEX") {
    drivers.push(`Opening in upper Globex quadrant between ON Mid (${metrics.onMid}) and ONH (${metrics.onh}).`);
  } else if (metrics.openingLocation === "INSIDE_LOWER_GLOBEX") {
    drivers.push(`Opening in lower Globex quadrant between ONL (${metrics.onl}) and ON Mid (${metrics.onMid}).`);
  } else if (metrics.openingLocation === "BELOW_ONL") {
    drivers.push("Opening below Overnight Low (ONL). Bearish breakdown drive active.");
  }

  // VWAP alignment
  if (isAboveVwap) {
    drivers.push(`Price holding above Session VWAP (${metrics.sessionVwap}). Institutional intraday buyers in control.`);
  } else {
    drivers.push(`Price trailing below Session VWAP (${metrics.sessionVwap}). Intraday sellers capping upside momentum.`);
  }

  // Volatility & Chop Risk
  let chopRisk: BiasRegime["chopRisk"] = "LOW";
  const overnightAtrRatio = metrics.overnightRange / (metrics.atr14Daily || 160);

  if (vix && vix.value > 26) {
    chopRisk = "SEVERE";
    risks.push(`VIX is elevated at ${vix.value.toFixed(1)} (>26). Erratic whipsaws and 20-40 pt slippage sweeps are common.`);
  } else if (overnightAtrRatio < 0.35) {
    chopRisk = "ELEVATED";
    risks.push(`Overnight range is compressed (only ${(overnightAtrRatio * 100).toFixed(0)}% of daily ATR). High probability of opening chop/false breaks before true trend emerges.`);
  } else if (Math.abs(currentPrice - metrics.sessionVwap) < 8 && Math.abs(currentPrice - metrics.pdc) < 10) {
    chopRisk = "ELEVATED";
    risks.push("Current price is pinched between PDC and VWAP (< 10 pts). Wait for directional separation before committing.");
  }

  if (hasRedFolderNewsAroundOpen) {
    risks.push("High-impact economic release scheduled right around the open (9:45 / 10:00 AM). Spreads will widen.");
  }

  // Formulate Verdict
  let verdict: BiasVerdict = "CAUTION / CHOP RISK";
  let confidence: BiasRegime["confidence"] = "MODERATE";
  let summary = "";

  if (hasRedFolderNewsAroundOpen && (vix?.value ?? 0) > 28) {
    verdict = "STAND ASIDE / HIGH VOL";
    confidence = "HIGH";
    summary = "High macro volatility release with elevated VIX. Risk of stop clipping exceeds statistical expectancy for 1 trade/day.";
  } else if (isAbovePdc && isAboveVwap && isAboveOnMid && htfTrend !== "BEARISH") {
    verdict = "CONTINUATION FAVORED (BULLISH)";
    confidence = overnightAtrRatio >= 0.5 ? "HIGH" : "MODERATE";
    summary = `Bullish continuation favored. Look for a patient retrace into the ${metrics.onMid} - ${metrics.sessionVwap} zone between 9:34 AM and 9:50 AM ET. Invalidation below ${metrics.onl > metrics.pdc ? metrics.pdc : metrics.onl}. Target PDH (${metrics.pdh}) / ONH (${metrics.onh}).`;
  } else if (!isAbovePdc && !isAboveVwap && !isAboveOnMid && htfTrend !== "BULLISH") {
    verdict = "CONTINUATION FAVORED (BEARISH)";
    confidence = overnightAtrRatio >= 0.5 ? "HIGH" : "MODERATE";
    summary = `Bearish continuation favored. Look for a retrace rally into VWAP (${metrics.sessionVwap}) or PDC (${metrics.pdc}) to fail between 9:34 AM and 9:50 AM ET. Target ONL (${metrics.onl}) / PDL (${metrics.pdl}).`;
  } else if (chopRisk === "SEVERE") {
    verdict = "STAND ASIDE / HIGH VOL";
    confidence = "HIGH";
    summary = "Severe whipsaw risk. Market structure conflicting between HTF trend and intraday inventory. Protect capital.";
  } else {
    verdict = "CAUTION / CHOP RISK";
    confidence = "LOW";
    summary = "Mixed signals: Overnight inventory and price location conflict. Do not take an aggressive early entry. Demand a clear retrace rejection before entering.";
  }

  // Ideal Retrace Zone
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
    summary,
    drivers,
    risks,
    idealRetraceZone
  };
}
