import { SessionMetrics, BiasRegime, TacticalExecutionPlan, ActionScenario, RetraceAnalysis, Trader5Answers } from "@/types/market";

export function generateTacticalPlaybook(
  currentPrice: number,
  metrics: SessionMetrics,
  bias: BiasRegime
): TacticalExecutionPlan {
  const vwap = metrics.sessionVwap;
  const onMid = metrics.onMid;
  const onh = metrics.onh;
  const onl = metrics.onl;
  const pdc = metrics.pdc;
  const pdh = metrics.pdh;
  const pdl = metrics.pdl;

  // 1. Analyze Retrace Probability & Session Archetype
  let isRetraceProbable = true;
  let probabilityPercent = 75;
  let archetype: RetraceAnalysis["archetype"] = "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)";
  let retraceType: RetraceAnalysis["retraceType"] = "DEEP TO VWAP/ON-MID";
  let verdictHeadline = "";
  let explanation = "";
  let expectedPullbackDepthPts = Math.max(14, Math.round(metrics.atr15mIntraday * 0.8));
  let retraceActionAdvice = "";

  const distToVwap = Math.round((currentPrice - vwap) * 10) / 10;
  const distToPdc = Math.round((currentPrice - pdc) * 10) / 10;
  const distToOnh = Math.round((onh - currentPrice) * 10) / 10;
  const distToOnl = Math.round((currentPrice - onl) * 10) / 10;

  if (metrics.openingLocation === "ABOVE_ONH" && distToVwap > 50) {
    // Runaway / Gap Drive
    archetype = "OPEN-DRIVE (RUNAWAY / SHALLOW RETRACE ONLY)";
    isRetraceProbable = false;
    probabilityPercent = 25;
    retraceType = "SHALLOW (FIRST 3-MIN PULLBACK)";
    verdictHeadline = "DEEP RETRACE UNLIKELY — RUNAWAY OPEN DRIVE IN PLAY";
    explanation = `Price is opening above Overnight High (${onh}) and ${distToVwap} pts above VWAP. In strong momentum gap days, price will NOT pull back all the way to VWAP. Waiting for a deep VWAP retrace will leave you sidelined.`;
    expectedPullbackDepthPts = Math.min(18, Math.round(metrics.atr15mIntraday * 0.5));
    retraceActionAdvice = "Do NOT wait for VWAP! Look for a shallow 8–15 pt pullback to the initial 3-minute candle high or ONH retest, then enter for trend continuation.";
  } else if (metrics.overnightInventory === "BULLISH_IMBALANCE" && currentPrice < onMid) {
    // Inventory Flush / Trap
    archetype = "OPEN-REVERSAL / INVENTORY FLUSH";
    isRetraceProbable = true;
    probabilityPercent = 85;
    retraceType = "DEEP TO VWAP/PDC";
    verdictHeadline = "OVERNIGHT LONGS TRAPPED — EXPECT EARLY FLUSH INTO PDC";
    explanation = `Overnight volume was ${metrics.inventoryPercent}% net long, but price failed to hold the upper quadrant and is sinking below ON Mid (${onMid}). Trapped overnight longs must liquidate at the open, creating a forced flush toward PDC (${pdc}).`;
    expectedPullbackDepthPts = Math.round(currentPrice - pdc);
    retraceActionAdvice = "Do NOT buy early! Allow the inventory liquidation flush to exhaust near PDC (${pdc}) before looking for any responsive reversal.";
  } else if (Math.abs(distToVwap) < 12 && Math.abs(distToPdc) < 15) {
    // Chop Pinch
    archetype = "OPEN-AUCTION / CHOP PINCH";
    isRetraceProbable = false;
    probabilityPercent = 40;
    retraceType = "CHOP / TWO-WAY";
    verdictHeadline = "CHOP PINCH — HIGH WHIPSAW RISK BETWEEN PDC & VWAP";
    explanation = `Price is compressed within ${Math.abs(distToVwap)} pts of VWAP and ${Math.abs(distToPdc)} pts of PDC. Neither buyers nor sellers have directional control. Early breakout attempts are 70% likely to fail back into the range.`;
    expectedPullbackDepthPts = 12;
    retraceActionAdvice = `PATIENCE REQUIRED: Do not trade between ${Math.min(vwap, pdc).toFixed(0)} and ${Math.max(vwap, pdc).toFixed(0)}. Demand a confirmed 15-minute directional breakout before entering today's 1 trade.`;
  } else {
    // Classic Open-Test-Drive
    archetype = "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)";
    isRetraceProbable = true;
    probabilityPercent = 80;
    retraceType = "DEEP TO VWAP/ON-MID";
    verdictHeadline = "HIGH RETRACE PROBABILITY — CLASSIC OPEN-TEST-DRIVE SETUP";
    explanation = `Market structure is holding cleanly above PDC (${pdc}). Opening inside upper Globex quadrant favors an initial 9:34–9:42 AM test of VWAP (${vwap}) / ON Mid (${onMid}) followed by strong HTF continuation toward ONH (${onh}) and PDH (${pdh}).`;
    expectedPullbackDepthPts = Math.round(Math.abs(currentPrice - Math.min(vwap, onMid)));
    retraceActionAdvice = `Set your alerts for ${Math.min(vwap, onMid).toFixed(1)} – ${Math.max(vwap, onMid).toFixed(1)}. Wait for the 9:30 AM opening whipsaw to settle, then enter on retrace absorption.`;
  }

  const retraceAnalysis: RetraceAnalysis = {
    isRetraceProbable,
    probabilityPercent,
    archetype,
    retraceType,
    verdictHeadline,
    explanation,
    expectedPullbackDepthPts,
    retraceActionAdvice
  };

  // 2. Synthesize Trader's 5 Core Answers
  const isBull = bias.verdict.includes("BULLISH");
  const isBear = bias.verdict.includes("BEARISH");

  // A. Direction / Bias
  const biasDirection: Trader5Answers["biasDirection"] = isBull
    ? "BULLISH CONTINUATION"
    : isBear
    ? "BEARISH CONTINUATION"
    : "CHOP / NEUTRAL";
  const biasConfidence: Trader5Answers["biasConfidence"] = bias.confidence;
  const biasReason = isBull
    ? `Price is trading above Prior Day Close (${pdc}) and Session VWAP (${vwap}) with buyers in control of the upper Globex structure.`
    : isBear
    ? `Price is trading below Prior Day Close (${pdc}) and Session VWAP (${vwap}) with sellers pressing lower into discount levels.`
    : `Price is compressed near Prior Day Close (${pdc}) without directional separation.`;

  // B. Stop Hunt Probability (Pre-Open Sweep)
  let stopHuntProbability: Trader5Answers["stopHuntProbability"] = "HIGH (EXPECT OPENING SWEEP)";
  let stopHuntDetails: Trader5Answers["stopHuntDetails"];

  if (Math.abs(distToOnh) < 70 && isBull) {
    stopHuntProbability = "HIGH (EXPECT OPENING SWEEP)";
    stopHuntDetails = {
      sideBeingHunted: "BUY-SIDE (ABOVE ONH)",
      sweepLevelPrice: onh,
      sweepLevelName: "Overnight High (ONH)",
      actionableAdvice: `Resting buy stops above ONH (${onh.toFixed(1)}) will almost certainly be swept in the first 1–3 minutes (9:30–9:33 AM) to generate exit liquidity for smart money. DO NOT buy the first tick! Wait for the sweep to exhaust and pull back into VWAP (${vwap.toFixed(1)}).`
    };
  } else if (Math.abs(distToOnl) < 70 && isBear) {
    stopHuntProbability = "HIGH (EXPECT OPENING SWEEP)";
    stopHuntDetails = {
      sideBeingHunted: "SELL-SIDE (BELOW ONL/LONDON LOW)",
      sweepLevelPrice: onl,
      sweepLevelName: "Overnight Low (ONL)",
      actionableAdvice: `Resting sell stops below ONL (${onl.toFixed(1)}) will likely be swept before any genuine move. Do not sell tick 1; wait for the flush to reject or retrace into VWAP.`
    };
  } else {
    stopHuntProbability = "MODERATE";
    stopHuntDetails = {
      sideBeingHunted: "BOTH (TWO-WAY WHIP)",
      sweepLevelPrice: onh,
      sweepLevelName: "Pre-Market Range High",
      actionableAdvice: "Expect 15–25 points of 2-way opening whipsaw. Hands off until 9:34 AM when genuine directional volume takes over."
    };
  }

  // C. Retrace Levels to Look For
  const retraceLevels: Trader5Answers["retraceLevels"] = [
    {
      name: "Session VWAP",
      price: vwap,
      priority: "PRIMARY (BEST R:R)",
      distancePts: Math.abs(distToVwap),
      note: "Primary institutional fair-value benchmark. 1-minute wick absorption here provides the highest-probability continuation entry."
    },
    {
      name: "Overnight Midpoint (ON Mid)",
      price: onMid,
      priority: "SECONDARY",
      distancePts: Math.round(Math.abs(currentPrice - onMid) * 10) / 10,
      note: "Globex 50% equilibrium. Confluence with VWAP makes this the sweet spot for 9:34–9:45 AM."
    },
    {
      name: "Prior Day Close (PDC)",
      price: pdc,
      priority: "DEEP VALUE",
      distancePts: Math.round(Math.abs(distToPdc) * 10) / 10,
      note: "Complete overnight inventory reset. If reached, look for sharp responsive bounce or stand aside if sliced cleanly."
    }
  ];

  // D. Strongest Draws on Liquidity (Magnets)
  const drawsOnLiquidity: Trader5Answers["drawsOnLiquidity"] = [
    {
      name: `Resting Buy Stops Above ONH (${onh.toFixed(1)})`,
      price: onh,
      type: "BUY-SIDE LIQUIDITY (RESTING BUY STOPS)",
      strength: "MAGNET #1 (PRIMARY TARGET)",
      pointsDistance: Math.round((onh - currentPrice) * 10) / 10
    },
    {
      name: `Prior Day High (${pdh.toFixed(1)})`,
      price: pdh,
      type: "BUY-SIDE LIQUIDITY (RESTING BUY STOPS)",
      strength: "MAGNET #2",
      pointsDistance: Math.round((pdh - currentPrice) * 10) / 10
    },
    {
      name: `Resting Sell Stops Below London Low (${(metrics.londonLow || onl).toFixed(1)})`,
      price: metrics.londonLow || onl,
      type: "SELL-SIDE LIQUIDITY (RESTING SELL STOPS)",
      strength: "SECONDARY",
      pointsDistance: Math.round((currentPrice - (metrics.londonLow || onl)) * 10) / 10
    }
  ];

  // E. Higher R:R vs Lower R:R Recommendation
  const isHighVol = metrics.atr15mIntraday > 30;
  const rrGuidance: Trader5Answers["rrGuidance"] = isHighVol
    ? {
        recommendedStrategy: "LOWER R:R (1.5R – 2.0R QUICK SCALP & LOCK)",
        targetMultipleR: 1.8,
        recommendedTargetPts: Math.round(metrics.atr15mIntraday * 0.8),
        rationale: `15-min ATR is elevated at ${metrics.atr15mIntraday} pts (wide candles). In high-volatility sessions, snap-back givebacks on runners are severe. Lock in 1.5R–2.0R quickly or trail your stop aggressively once up +1.5R.`
      }
    : {
        recommendedStrategy: "HIGHER R:R (2.5R – 3.5R RUNNER EXPANSION)",
        targetMultipleR: 2.8,
        recommendedTargetPts: Math.round(metrics.atr15mIntraday * 1.5),
        rationale: `Volatility is stable (15m ATR: ${metrics.atr15mIntraday} pts). Market structure supports letting runners expand toward primary liquidity targets at ONH/PDH.`
      };

  const trader5Answers: Trader5Answers = {
    biasDirection,
    biasConfidence,
    biasReason,
    stopHuntProbability,
    stopHuntDetails,
    retraceLevels,
    drawsOnLiquidity,
    rrGuidance
  };

  // 3. Conditional Scenarios
  const scenarios: ActionScenario[] = [];

  // Scenario A: The VWAP Test
  scenarios.push({
    id: "sc-vwap-test",
    condition: `IF Price Dips to Test VWAP (~${vwap.toFixed(1)}) at 9:34–9:45 AM ET`,
    conditionShort: "VWAP Test / Retrace",
    whatItMeans:
      "Session VWAP represents institutional fair value. When trend continuation is active, passive institutional algorithmic buy orders sit at VWAP to accumulate contracts at discount before the next leg.",
    actionableDecision: isBull
      ? "BUY THE RETRACE: Wait for 1-minute candle wick absorption, then enter Long."
      : "WATCH FOR BREAKDOWN: If bear continuation, fade rallies that stall at VWAP.",
    entryTrigger:
      "Demand a 1-min or 2-min candle that wicks below VWAP but CLOSES back above it with lower wick >= 4 pts. Enter market/limit on close.",
    invalidation: `Hard stop at ${(Math.min(vwap, onMid) - 8).toFixed(1)} (below structural swing low). If any 2-min candle closes below VWAP, exit immediately.`,
    targetObjective: `Primary Target: ${onh.toFixed(1)} (ONH, +${Math.round(Math.abs(onh - vwap))} pts). Runner Target: ${pdh.toFixed(1)} (PDH).`,
    trapWarning:
      "Retail traders panic and sell when a red candle slices into VWAP. Do NOT market-sell into support! Wait for the candle to close to see if it absorbs.",
    status: "ACTIVE"
  });

  // Scenario B: VWAP Slices Through (Failed Retrace)
  scenarios.push({
    id: "sc-vwap-break",
    condition: `IF Price Slices Cleanly Below VWAP (< ${vwap.toFixed(1)}) and Stays Below`,
    conditionShort: "Failed Retrace / Breakdown",
    whatItMeans:
      "The retrace has FAILED. Institutional buyers are absent. Overnight longs are now underwater and will panic-sell market orders, accelerating downside momentum toward PDC.",
    actionableDecision:
      "DO NOT CATCH THE FALLING KNIFE! Retrace continuation is dead. Stand aside or flip short.",
    entryTrigger:
      "If 2 consecutive 1-min candles close below VWAP with expanding volume, long bias is completely invalidated. Only short setups on a weak back-test of VWAP from below are valid.",
    invalidation: `Immediate invalidation if price recovers above ${(vwap + 5).toFixed(1)}.`,
    targetObjective: `Downside flush target: ${pdc.toFixed(1)} (PDC) and ${onl.toFixed(1)} (ONL).`,
    trapWarning:
      "Averaging down on a dip that breaks VWAP is the #1 way futures traders blow up accounts. When VWAP breaks on volume, the trend is broken.",
    status: "PENDING"
  });

  // Scenario C: Opening Drive Sweeps ONH First (9:30–9:33 AM)
  scenarios.push({
    id: "sc-onh-sweep",
    condition: `IF Price Surges to Sweep ONH (~${onh.toFixed(1)}) in the First 3 Minutes`,
    conditionShort: "ONH Liquidity Sweep",
    whatItMeans:
      "Smart money pushes price into resting retail buy stops pooled above the overnight high. Often triggers a sharp 20–30 pt counter-retrace before the real trend begins.",
    actionableDecision:
      "NEVER BUY TICK 1 OF THE BREAKOUT. Allow the sweep to occur and wait for the pullback into VWAP/ON Mid.",
    entryTrigger:
      `Watch if price rejects ONH and falls back inside Globex range. Wait for it to stabilize at ${onMid.toFixed(1)} / ${vwap.toFixed(1)} between 9:35 AM and 9:45 AM before taking today's 1 trade.`,
    invalidation: `Do not enter if price remains extended >30 pts above VWAP without resetting.`,
    targetObjective: `Once retrace confirms: ${pdh.toFixed(1)} (PDH) and ${(pdh + 30).toFixed(1)}.`,
    trapWarning:
      "Buying the first green candle at 9:30:15 AM ET is a trap. You buy into smart money's exit liquidity at the top of the range.",
    status: "ACTIVE"
  });

  // Scenario D: Inventory Reset at PDC (~pdc)
  scenarios.push({
    id: "sc-pdc-test",
    condition: `IF Price Flushes Down to Test Prior Day Close (~${pdc.toFixed(1)})`,
    conditionShort: "PDC Inventory Reset",
    whatItMeans:
      "PDC is the ultimate balance line. Reaching PDC completely wipes out overnight inventory gains. If buyers defend PDC, it offers a massive high-R responsive bounce. If PDC fails, market enters daily downtrend.",
    actionableDecision:
      "HIGH-R PIVOT ZONE: Look for a double bottom or hammer candle with delta absorption at PDC.",
    entryTrigger:
      `Wait for price to tap ${pdc.toFixed(1)}, hold for at least 2 minutes, and print a green engulfing candle back above ${(pdc + 6).toFixed(1)}.`,
    invalidation: `Hard stop at ${(pdc - 8).toFixed(1)}. If price accepts below PDC, market is bearish.`,
    targetObjective: `Target: Mean reversion to VWAP (${vwap.toFixed(1)}, +${Math.round(Math.abs(vwap - pdc))} pts).`,
    trapWarning:
      "Front-running PDC before the flush completes. Wait for the selling volume to dry up first.",
    status: "PENDING"
  });

  // 4. VWAP Playbook Details
  const vwapPlaybook = {
    price: vwap,
    bounceMeaning:
      `If price bounces off ${vwap.toFixed(1)}, it confirms institutional participation. Buyers are defending fair value, and continuation to ${onh.toFixed(1)} / ${pdh.toFixed(1)} is high-probability.`,
    breakdownMeaning:
      `If price closes below ${vwap.toFixed(1)}, buyers have surrendered. Overnight inventory is trapped and forced to liquidate down to ${pdc.toFixed(1)}. Retrace continuation is CANCELLED.`,
    tradeVerdict: isBull
      ? `Hold patience for a pullback into ${vwap.toFixed(1)}. Enter only on confirmed absorption wick.`
      : `Watch for failed rallies into ${vwap.toFixed(1)}. Rejection confirms short continuation.`,
    actionIfTested:
      `At ${vwap.toFixed(1)}: DO NOT market order. Wait for the 1-min bar to close. If green or long lower wick, ENTER. If full-bodied red candle closes below, STAND ASIDE.`
  };

  // 5. Single Trade Directive
  let singleTradeDirective = "";
  if (archetype === "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)") {
    singleTradeDirective = `TODAY'S #1 RULE: Wait for the 9:30 AM open drive to stall and retrace into ${Math.min(vwap, onMid).toFixed(1)} – ${Math.max(vwap, onMid).toFixed(1)}. Execute 1 trade on candle absorption. Hard stop at ${(Math.min(vwap, onMid) - 10).toFixed(1)}. Target ${onh.toFixed(1)}. No revenge trades.`;
  } else if (archetype === "OPEN-DRIVE (RUNAWAY / SHALLOW RETRACE ONLY)") {
    singleTradeDirective = `TODAY'S #1 RULE: Runaway momentum day. Do NOT wait for deep VWAP. Enter on a shallow 8–12 pt pullback after the 3-minute open candle, or stand aside if price is overextended.`;
  } else if (archetype === "OPEN-REVERSAL / INVENTORY FLUSH") {
    singleTradeDirective = `TODAY'S #1 RULE: Overnight longs are trapped. Do NOT buy the first dip. Allow price to flush to PDC (${pdc.toFixed(1)}) before considering any trade.`;
  } else {
    singleTradeDirective = `TODAY'S #1 RULE: Chop pinch between PDC and VWAP. Do NOT burn today's 1 trade inside the noise. Require a clean 15-pt directional expansion before entering.`;
  }

  // 6. Timeline Guide
  const timelineGuide = {
    observePhase: {
      timeWindow: "09:30 – 09:33 AM ET" as const,
      rule: "HANDS OFF MOUSE. Do not chase opening tick. Observe initial drive direction, spread width, and whether ONH or ONL gets swept."
    },
    entryWindow: {
      timeWindow: "09:34 – 09:48 AM ET" as const,
      rule: "THE 1-TRADE RETRACE WINDOW. Look for price to pull back into defined level with decreasing volume and wick absorption.",
      zone: `${Math.min(vwap, onMid).toFixed(1)} — ${Math.max(vwap, onMid).toFixed(1)}`
    },
    managementPhase: {
      timeWindow: "09:48 – 10:00 AM ET" as const,
      rule: "MOVE STOP TO BREAKEVEN OR TAKE PROFIT. If trade is up >1.5R, trail stop. Flatten or secure runners before 10:00 AM ISM news."
    }
  };

  return {
    singleTradeDirective,
    trader5Answers,
    retraceAnalysis,
    scenarios,
    timelineGuide,
    vwapPlaybook
  };
}

