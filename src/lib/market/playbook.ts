import {
  SessionMetrics,
  BiasRegime,
  TacticalExecutionPlan,
  ActionScenario,
  RetraceAnalysis,
  Trader5Answers,
  SessionPhase,
  ExecutionWindowSubPhase,
  FactorScoreItem,
  MarketQuote,
  EconomicEvent,
  CandleFootprintData,
  OHLCVBar,
  KeyLevel,
  PropProfile,
  LTFTradeCard
} from "@/types/market";
import {
  getCMESessionInfo,
  formatTradeDateShort,
  formatTradeDateReadable,
  getETParts,
  CMESessionInfo
} from "./sessionClock";
import { evaluateLayer1RiskGates } from "./riskGates";
import { evaluateLayer2DirectionalScore } from "./directionalScore";
import { evaluateLTFExecution } from "../execution/ltfExecution";

export function generateTacticalPlaybook(
  currentPrice: number,
  metrics: SessionMetrics,
  bias: BiasRegime,
  options?: {
    isDelayed?: boolean;
    qqqProxyQuote?: MarketQuote;
    economicEvents?: EconomicEvent[];
    sessionInfo?: CMESessionInfo;
    factorWeights?: Record<string, number>;
    footprintBars?: CandleFootprintData[];
    intradayBars?: OHLCVBar[];
    keyLevels?: KeyLevel[];
    propProfile?: PropProfile;
  }
): TacticalExecutionPlan {
  const vwap = metrics.sessionVwap;
  const onMid = metrics.onMid;
  const onh = metrics.onh;
  const onl = metrics.onl;
  const pdc = metrics.pdc;
  const pdh = metrics.pdh;
  const pdl = metrics.pdl;
  const atr15 = metrics.atr15mIntraday || 24.5;
  const straddle = metrics.expectedMoveStraddle || 80.0;

  // 1. Session Phase & Time-Decay Window Detector using centralized CME Session Clock
  const sessionInfo = options?.sessionInfo || getCMESessionInfo();
  const cmePhase = sessionInfo.phase;
  const targetTradeDate = sessionInfo.targetTradeDate;
  const targetShortDay = formatTradeDateShort(targetTradeDate).split(" ")[0]; // e.g. "TUE"
  const targetFullDate = formatTradeDateReadable(targetTradeDate); // e.g. "Tue, Nov 24"

  let sessionPhase: SessionPhase = "PRE_MARKET_BRIEF";
  let executionSubPhase: ExecutionWindowSubPhase = "PRE_BELL";

  if (cmePhase === "NY_OPEN_WINDOW") {
    sessionPhase = "NY_OPEN_WINDOW_930_1000";
    const et = getETParts(sessionInfo.nowET);
    const totalMinsET = et.hour * 60 + et.minute;
    if (totalMinsET <= 9 * 60 + 33) {
      executionSubPhase = "OPEN_NOISE_SWEEP_WATCH";
    } else if (totalMinsET <= 9 * 60 + 48) {
      executionSubPhase = "PRIME_RETRACE_WINDOW";
    } else {
      executionSubPhase = "LATE_WINDOW_DECAY_CAUTION";
    }
  } else if (cmePhase === "PRE_MARKET_LOCK") {
    sessionPhase = "PRE_MARKET_LOCK";
    executionSubPhase = "PRE_BELL";
  } else if (cmePhase === "DEVELOPING_OVERNIGHT") {
    sessionPhase = "DEVELOPING_OVERNIGHT";
    executionSubPhase = "PRE_BELL";
  } else if (cmePhase === "CME_BREAK_OR_WEEKEND") {
    sessionPhase = "CME_BREAK_OR_WEEKEND";
    executionSubPhase = "PRE_BELL";
  } else {
    sessionPhase = "POST_WINDOW_RECAP";
    executionSubPhase = "WINDOW_CLOSED";
  }

  // 2. Delayed Feed Warning & Lock
  const isFuturesFeedDelayed = options?.isDelayed ?? true;
  const isDelayedFeedWarningActive = isFuturesFeedDelayed && sessionPhase === "NY_OPEN_WINDOW_930_1000";
  const delayedFeedBannerText = isDelayedFeedWarningActive
    ? "DELAYED FUTURES FEED (10–15m LAG) — USE PRE-OPEN PLAN + LIVE CHART"
    : "";

  // 3. News Buffer Warning for 09:45 AM / 10:00 AM Releases on target trade date
  let newsBufferWarning: string | undefined;
  if (options?.economicEvents) {
    const nearOpenReleases = options.economicEvents.filter((ev) => {
      const isTargetDay = ev.date === targetTradeDate || !ev.date;
      const t = ev.timeET.toLowerCase();
      return isTargetDay && (t.includes("9:45") || t.includes("09:45") || t.includes("10:00") || ev.isNearOpenWindow);
    });
    if (nearOpenReleases.length > 0) {
      const evNames = nearOpenReleases.map((e) => `${e.timeET} ${e.event}`).join(", ");
      newsBufferWarning = `NEWS BUFFER WARNING: High-impact release (${evNames}). Lock in profits or move stops to breakeven before 10:00 AM.`;
    }
  }

  // 4. Two-Layer Gated Architecture
  // Layer 1: Multiplicative Risk Gates & Target Caps
  const layer1 = bias.layer1RiskGates ?? evaluateLayer1RiskGates({
    currentPrice,
    metrics,
    volatilitySurface: bias.volatilitySurface,
    gex: bias.gex,
    hasRedFolderNewsAroundOpen: !!newsBufferWarning
  });

  // Layer 2: Strictly 4 Orthogonal Directional Signals (Equal 1.0 Baseline Weights)
  const layer2 = evaluateLayer2DirectionalScore({
    currentPrice,
    metrics,
    htfTrend: bias.htfTrend,
    macroRegime: bias.macroRegime,
    qqqProxyQuote: options?.qqqProxyQuote,
    footprintBars: options?.footprintBars,
    reversalVetoActive: layer1.reversalVetoActive,
    reversalVetoReason: layer1.reversalVetoReason,
    weights: options?.factorWeights
  });

  const totalFactorScore = layer2.totalScore;
  const factorScorecard: FactorScoreItem[] = layer2.signals.map((s) => ({
    factor: s.name,
    score: s.score,
    impact: s.impact,
    detail: s.detail
  }));

  // 5. Volatility-Normalized Archetype Classification
  const distToVwap = Math.round((currentPrice - vwap) * 10) / 10;
  const distToPdc = Math.round((currentPrice - pdc) * 10) / 10;
  const distToOnh = Math.round((onh - currentPrice) * 10) / 10;
  const distToOnl = Math.round((currentPrice - onl) * 10) / 10;

  const runawayThreshold = 1.75 * atr15;
  const pinchThreshold = 0.35 * atr15;
  const stopHuntThreshold = Math.min(2.0 * atr15, 0.25 * straddle);

  let archetype: RetraceAnalysis["archetype"] = "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)";
  let likelihoodTier: RetraceAnalysis["likelihoodTier"] = "HIGH";
  let isRetraceProbable = true;
  let retraceType: RetraceAnalysis["retraceType"] = "DEEP TO VWAP/ON-MID";
  let verdictHeadline = "";
  let explanation = "";
  let expectedPullbackDepthPts = Math.max(14, Math.round(atr15 * 0.8));
  let retraceActionAdvice = "";

  if (metrics.openingLocation === "ABOVE_ONH" && distToVwap > runawayThreshold) {
    // Runaway / Gap Drive
    archetype = "OPEN-DRIVE (RUNAWAY / SHALLOW RETRACE ONLY)";
    likelihoodTier = "LOW";
    isRetraceProbable = false;
    retraceType = "SHALLOW (FIRST 3-MIN PULLBACK)";
    verdictHeadline = "DEEP RETRACE UNLIKELY — RUNAWAY OPEN DRIVE IN PLAY";
    explanation = `Price opened above Overnight High (${onh}) and is extended ${distToVwap} pts above VWAP (>1.75x 15m ATR of ${runawayThreshold.toFixed(1)} pts). In runaway sessions, price will NOT retrace deeply to VWAP.`;
    expectedPullbackDepthPts = Math.min(18, Math.round(atr15 * 0.5));
    retraceActionAdvice = "Do NOT wait for deep VWAP. Enter on a shallow 8–15 pt pullback to the initial 3-minute candle high or ONH retest.";
  } else if (metrics.inventoryPercent >= 70 && currentPrice < onMid) {
    // Inventory Flush / Trap
    archetype = "OPEN-REVERSAL / INVENTORY FLUSH";
    likelihoodTier = "HIGH";
    isRetraceProbable = true;
    retraceType = "DEEP TO VWAP/PDC";
    verdictHeadline = "OVERNIGHT LONGS TRAPPED — EXPECT EARLY FLUSH INTO PDC";
    explanation = `Overnight inventory is ${metrics.inventoryPercent}% net long, but price failed to hold the upper quadrant and broke below ON Mid (${onMid}). Trapped overnight longs must liquidate at the open, forcing a flush toward PDC (${pdc}).`;
    expectedPullbackDepthPts = Math.round(currentPrice - pdc);
    retraceActionAdvice = `Do NOT buy early! Allow the inventory liquidation flush to exhaust near PDC (${pdc}) before looking for responsive buyers.`;
  } else if (Math.abs(distToVwap) < pinchThreshold && Math.abs(distToPdc) < pinchThreshold * 1.3) {
    // Chop Pinch
    archetype = "OPEN-AUCTION / CHOP PINCH";
    likelihoodTier = "LOW";
    isRetraceProbable = false;
    retraceType = "CHOP / TWO-WAY";
    verdictHeadline = "CHOP PINCH — HIGH WHIPSAW RISK BETWEEN PDC & VWAP";
    explanation = `Price is pinched within ${Math.abs(distToVwap)} pts of VWAP and ${Math.abs(distToPdc)} pts of PDC (< 0.35x 15m ATR). Neither buyers nor sellers have directional control.`;
    expectedPullbackDepthPts = Math.round(pinchThreshold);
    retraceActionAdvice = `PATIENCE REQUIRED: Do not trade between ${Math.min(vwap, pdc).toFixed(0)} and ${Math.max(vwap, pdc).toFixed(0)}. Demand a confirmed 15-minute directional expansion before entering today's 1 trade.`;
  } else {
    // Classic Open-Test-Drive
    archetype = "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)";
    likelihoodTier = Math.abs(totalFactorScore) >= 3 ? "HIGH" : "MODERATE";
    isRetraceProbable = true;
    retraceType = "DEEP TO VWAP/ON-MID";
    verdictHeadline = "HIGH RETRACE PROBABILITY — CLASSIC OPEN-TEST-DRIVE SETUP";
    explanation = `Market structure is holding cleanly above PDC (${pdc}). Opening inside upper Globex quadrant favors an initial 9:34–9:45 AM test of VWAP (${vwap}) / ON Mid (${onMid}) followed by strong HTF continuation toward ONH (${onh}) and PDH (${pdh}).`;
    expectedPullbackDepthPts = Math.round(Math.abs(currentPrice - Math.min(vwap, onMid)));
    retraceActionAdvice = `Set alerts for ${Math.min(vwap, onMid).toFixed(1)} – ${Math.max(vwap, onMid).toFixed(1)}. Wait for the 9:30 AM opening whipsaw to settle, then enter on confirmed retrace absorption.`;
  }

  // Phase-Aware Adjustments to Retrace Analysis
  if (cmePhase === "DEVELOPING_OVERNIGHT") {
    verdictHeadline = `DEVELOPING — PREP FOR ${targetFullDate} 9:30 AM OPEN`;
    explanation = `Overnight Globex session (${sessionInfo.subPhase || "ASIA"}) is developing. Reference levels are anchored to ${sessionInfo.priorTradeDateFormatted} close (${pdc.toFixed(1)}). Note: London session (03:00 ET) and 8:30 AM macro releases have not finalized yet. Maintain patience and observe overnight inventory build.`;
    retraceActionAdvice = `PRE-SESSION PREPARATION: Do not front-run the overnight session. Wait for London structure (03:00–08:30 ET) and 8:30 AM macro data to confirm final bias.`;
  } else if (cmePhase === "CME_BREAK_OR_WEEKEND") {
    verdictHeadline = `MARKET CLOSED — PREPARING FOR ${targetFullDate} 9:30 AM OPEN`;
    explanation = `CME equity futures markets are closed for scheduled break. Live trading resumes at ${sessionInfo.nextMilestoneLabel}.`;
    retraceActionAdvice = `Markets are offline. Review trade log in /journal and prepare for the 18:00 ET Globex open.`;
  } else if (cmePhase === "POST_WINDOW_RECAP") {
    verdictHeadline = `${targetShortDay} 9:30 AM WINDOW COMPLETE — STAY FLAT / LOG TRADE`;
    explanation = `The 09:30–10:00 AM ET high-probability window has closed. The 1-trade-per-day rule mandates staying flat. Record post-trade MAE/MFE in /journal and wait for 6:00 PM ET rollover for tomorrow's prep.`;
    retraceActionAdvice = `WINDOW CLOSED: Mandate is 1 trade per day. Avoid afternoon churn. Prepare for tomorrow's session at the 6:00 PM ET Globex open.`;
  }

  const retraceAnalysis: RetraceAnalysis = {
    isRetraceProbable,
    likelihoodTier,
    factorScorecard,
    archetype,
    retraceType,
    verdictHeadline,
    explanation,
    expectedPullbackDepthPts,
    retraceActionAdvice
  };

  // 6. Synthesize Trader's 5 Core Answers
  const isBull = (bias.verdict.includes("BULLISH") || layer2.direction === "BULLISH") && layer1.allowTrading && !layer1.reversalVetoActive;
  const isBear = (bias.verdict.includes("BEARISH") || layer2.direction === "BEARISH") && layer1.allowTrading && !layer1.reversalVetoActive;

  // A. Direction / Bias
  const biasDirection: Trader5Answers["biasDirection"] = !layer1.allowTrading
    ? "CHOP / NEUTRAL"
    : layer1.reversalVetoActive
    ? "CHOP / NEUTRAL"
    : isBull
    ? "BULLISH CONTINUATION"
    : isBear
    ? "BEARISH CONTINUATION"
    : "CHOP / NEUTRAL";
  const biasConfidence: Trader5Answers["biasConfidence"] = !layer1.allowTrading
    ? "HIGH"
    : layer1.reversalVetoActive
    ? "LOW"
    : bias.confidence;
  const biasReason = !layer1.allowTrading
    ? (layer1.activeVetoes[0] || "Layer 1 Risk Gate active: Stand aside.")
    : layer1.reversalVetoActive
    ? (layer1.reversalVetoReason || "Overnight inventory trapped offside. Stand aside from chasing opening breakout.")
    : isBull
    ? `Price is trading above Prior Day Close (${pdc}) and Session VWAP (${vwap}) with positive Layer 2 directional score (+${totalFactorScore}).`
    : isBear
    ? `Price is trading below Prior Day Close (${pdc}) and Session VWAP (${vwap}) with negative Layer 2 directional score (${totalFactorScore}).`
    : `Price is compressed near Prior Day Close (${pdc}) or signals are neutral (score ${totalFactorScore}).`;

  // B. Stop Hunt Likelihood (Simple ICT Liquidity Sweep Architecture)
  let stopHuntProbability: Trader5Answers["stopHuntProbability"];
  let stopHuntDetails: Trader5Answers["stopHuntDetails"];

  if (Math.abs(distToOnh) <= stopHuntThreshold && isBull) {
    stopHuntProbability = "HIGH (82% LIKELY STOP HUNT)";
    stopHuntDetails = {
      sideBeingHunted: "Buy Stops Above Overnight High (ONH)",
      sweepLevelPrice: onh,
      sweepLevelName: `Overnight High (ONH ${onh.toFixed(1)})`,
      targetPoolType: "BUY-SIDE LIQUIDITY (BSL)",
      actionableAdvice: `Smart money will likely fake a breakout above the Overnight High (${onh.toFixed(1)}) right at 9:30 AM to trigger retail buy stops. DO NOT buy the first pop! Let the fakeout happen, wait for price to reject back down (Market Structure Shift), and then buy the discount retrace into VWAP (${vwap.toFixed(1)}).`,
      institutionalMechanism: `Institutional algos need exit liquidity to fill positions without slippage. Driving price through ONH (${onh.toFixed(1)}) forces retail buy-stop market orders to trigger, supplying the liquidity smart money needs.`,
      theTrap: `Retail breakout traders buy the first green impulse above ONH at 9:30 AM believing it is an opening runner, getting trapped at the high.`,
      theShiftMSS: `Price wicks above ONH, traps buyers, and swiftly displaces back below ONH within 1–3 minutes, confirming a Market Structure Shift (MSS) on the 1m/5m chart.`,
      traderDirective: `Patience is mandatory: Let the opening sweep run. Once MSS displaces back inside range, enter LONG on the pullback into VWAP (${vwap.toFixed(1)}) with your stop anchored below the sweep wick.`
    };
  } else if (Math.abs(distToOnl) <= stopHuntThreshold && isBear) {
    stopHuntProbability = "HIGH (85% LIKELY STOP HUNT)";
    stopHuntDetails = {
      sideBeingHunted: "Sell Stops Below Overnight Low (ONL)",
      sweepLevelPrice: onl,
      sweepLevelName: `Overnight Low (ONL ${onl.toFixed(1)})`,
      targetPoolType: "SELL-SIDE LIQUIDITY (SSL)",
      actionableAdvice: `Smart money will likely flush price below the Overnight Low (${onl.toFixed(1)}) right at 9:30 AM to trigger retail sell stops. DO NOT panic sell the breakdown! Wait for price to wick and reclaim the low (Market Structure Shift), then look for a retrace into VWAP (${vwap.toFixed(1)}).`,
      institutionalMechanism: `Institutions exploit resting stop-loss market sell orders beneath ONL (${onl.toFixed(1)}) to accumulate liquidity at deep discounts. The initial breakdown is a bear trap.`,
      theTrap: `Retail traders short the breakdown below ONL on the 9:30 AM open bell, getting trapped at the exact session bottom.`,
      theShiftMSS: `Price flushes below ONL, traps breakout sellers, and aggressively reverses back above ONL, confirming a bullish Market Structure Shift (MSS) on volume.`,
      traderDirective: `Stand aside during the 9:30–9:33 AM sweep. Wait for the MSS reclaim, then execute SHORT only on a retrace to VWAP (${vwap.toFixed(1)}) after the trap is confirmed.`
    };
  } else {
    stopHuntProbability = "MODERATE (55% OPENING CHOP / WIPSAW)";
    stopHuntDetails = {
      sideBeingHunted: "Overnight Midpoint (Opening Chop Trap)",
      sweepLevelPrice: onMid,
      sweepLevelName: `Overnight 50% Midpoint (${onMid.toFixed(1)})`,
      targetPoolType: "RANGE COMPRESSION (TWO-WAY)",
      actionableAdvice: `Price is sitting right at the Overnight 50% Midpoint (${onMid.toFixed(1)}). Expect a choppy 2-way whipsaw during the first 3 minutes as algorithms probe both sides. Keep your hands off until 9:34 AM when real institutional volume begins.`,
      institutionalMechanism: `When price sits at the 50% midpoint before the open, market makers sweep both local swing highs and lows to clear weak leverage on both sides before establishing the true directional trend.`,
      theTrap: `Taking trades in the first 3 minutes of the open results in getting chopped up on both longs and shorts.`,
      theShiftMSS: `Wait for price to expand toward either the Overnight High (${onh.toFixed(1)}) or Low (${onl.toFixed(1)}), sweep liquidity, and show a clear 5m Market Structure Shift.`,
      traderDirective: `Enforce the 9:30–9:34 AM observation freeze. Execute only when price cleanly retests VWAP (${vwap.toFixed(1)}) after the opening fakeout settles.`
    };
  }

  // C. Prime Retrace Levels (Confluence Ranked)
  const retraceLevels: Trader5Answers["retraceLevels"] = [
    {
      name: `Session VWAP (${metrics.vwapCalculationMode === "TWAP_FALLBACK" ? "TWAP" : "Anchored 09:30"})`,
      price: vwap,
      priority: "PRIMARY (BEST R:R)",
      distancePts: Math.abs(distToVwap),
      note: "Primary institutional fair-value benchmark. 1-minute wick absorption here provides the highest-probability continuation entry."
    },
    {
      name: "Overnight Midpoint (ON Mid 50%)",
      price: onMid,
      priority: "SECONDARY",
      distancePts: Math.round(Math.abs(currentPrice - onMid) * 10) / 10,
      note: "Overnight 50% midpoint. Confluence with VWAP creates the prime discount execution zone for 9:34–9:48 AM."
    },
    {
      name: `5-Day ${metrics.htfImpulseDirection} 61.8% Golden Pocket`,
      price: metrics.htf618Retrace,
      priority: "DEEP VALUE",
      distancePts: Math.round(Math.abs(currentPrice - metrics.htf618Retrace) * 10) / 10,
      note: "Higher-timeframe Fibonacci discount. Deep structural level for high-R continuation."
    }
  ];

  // D. Strongest Draws on Liquidity (Direction-Aware Scalp Objectives & HTF Pools)
  const drawsOnLiquidity: Trader5Answers["drawsOnLiquidity"] = isBull
    ? [
        {
          name: `Immediate 1m Scalp Objective (+14.0 pts)`,
          price: Math.round((currentPrice + 14.0) * 10) / 10,
          type: "BUY-SIDE LIQUIDITY (RESTING BUY STOPS)",
          strength: "MAGNET #1 (PRIMARY TARGET)",
          pointsDistance: 14.0
        },
        {
          name: `Overnight High (ONH ${onh.toFixed(1)})`,
          price: onh,
          type: "BUY-SIDE LIQUIDITY (RESTING BUY STOPS)",
          strength: "MAGNET #2",
          pointsDistance: Math.round((onh - currentPrice) * 10) / 10
        },
        {
          name: `Prior Day High (${pdh.toFixed(1)}) [HTF Context]`,
          price: pdh,
          type: "BUY-SIDE LIQUIDITY (RESTING BUY STOPS)",
          strength: "SECONDARY",
          pointsDistance: Math.round((pdh - currentPrice) * 10) / 10
        }
      ]
    : [
        {
          name: `Immediate 1m Scalp Objective (-14.0 pts)`,
          price: Math.round((currentPrice - 14.0) * 10) / 10,
          type: "SELL-SIDE LIQUIDITY (RESTING SELL STOPS)",
          strength: "MAGNET #1 (PRIMARY TARGET)",
          pointsDistance: -14.0
        },
        {
          name: `Overnight Low (ONL ${onl.toFixed(1)})`,
          price: onl,
          type: "SELL-SIDE LIQUIDITY (RESTING SELL STOPS)",
          strength: "MAGNET #2",
          pointsDistance: Math.round((onl - currentPrice) * 10) / 10
        },
        {
          name: `Prior Day Low (${pdl.toFixed(1)}) [HTF Context]`,
          price: pdl,
          type: "SELL-SIDE LIQUIDITY (RESTING SELL STOPS)",
          strength: "SECONDARY",
          pointsDistance: Math.round((pdl - currentPrice) * 10) / 10
        }
      ];

  // E. Session R:R Strategy Recommendation factoring Scalp Rules & Layer 1 Caps
  const targetMultipleR = Math.min(1.8, Math.max(1.0, layer1.targetCapMultipleR));
  const scalpTargetPts = Math.max(12, Math.min(25, Math.round(atr15 * 0.25)));

  const rrGuidance: Trader5Answers["rrGuidance"] = {
    recommendedStrategy: "LOWER R:R (1.5R – 2.0R QUICK SCALP & LOCK)",
    targetMultipleR,
    recommendedTargetPts: scalpTargetPts,
    rationale: `Scalp Execution Mandate: Quick 10–18 pt scalp on TP1 (scale 50%), 20–35 pt runner on TP2 with stop moved to Breakeven. Risk capped at 10–18 pts.`
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

  // 7. Conditional Scenarios
  const scenarios: ActionScenario[] = [
    {
      id: "sc-vwap-test",
      condition: `IF Price Dips to Test VWAP (~${vwap.toFixed(1)}) at 9:34–9:48 AM ET`,
      conditionShort: "VWAP Test / Retrace",
      whatItMeans:
        "Session VWAP represents institutional fair value. When trend continuation is active, algorithmic buy orders defend VWAP at discount before the next expansion leg.",
      actionableDecision: isBull
        ? "BUY THE RETRACE: Wait for 1-minute candle wick absorption, then enter Long."
        : "WATCH FOR BREAKDOWN: If bear continuation, fade rallies that stall at VWAP.",
      entryTrigger:
        "Demand a 1-min or 2-min candle that wicks below VWAP but CLOSES back above it with lower wick >= 4 pts. Enter market/limit on close.",
      invalidation: `Hard stop at ${(Math.min(vwap, onMid) - 8).toFixed(1)} (below structural swing low). If any 2-min candle closes below VWAP, exit immediately.`,
      targetObjective: `Primary Target: ${onh.toFixed(1)} (ONH, +${Math.round(Math.abs(onh - vwap))} pts). Runner: ${pdh.toFixed(1)} (PDH).`,
      trapWarning:
        "Retail traders panic-sell when a red candle slices into VWAP. Do NOT market-sell into support! Wait for the candle to close to confirm absorption.",
      status: "ACTIVE"
    },
    {
      id: "sc-vwap-break",
      condition: `IF Price Slices Cleanly Below VWAP (< ${vwap.toFixed(1)}) and Stays Below`,
      conditionShort: "Failed Retrace / Breakdown",
      whatItMeans:
        "The retrace has FAILED. Institutional buyers are absent. Overnight longs are now underwater and will panic-sell market orders, accelerating downside flush toward PDC.",
      actionableDecision:
        "DO NOT CATCH THE FALLING KNIFE! Retrace continuation is dead. Stand aside or flip short.",
      entryTrigger:
        "If 2 consecutive 1-min candles close below VWAP with expanding volume, long bias is invalidated. Only short setups on a back-test of VWAP from below are valid.",
      invalidation: `Immediate invalidation if price recovers above ${(vwap + 6).toFixed(1)}.`,
      targetObjective: `Downside flush target: ${pdc.toFixed(1)} (PDC) and ${onl.toFixed(1)} (ONL).`,
      trapWarning:
        "Averaging down on a dip that breaks VWAP is the #1 reason futures traders blow accounts. When VWAP breaks on volume, the trend is broken.",
      status: "PENDING"
    },
    {
      id: "sc-onh-sweep",
      condition: `IF Price Surges to Sweep ONH (~${onh.toFixed(1)}) in the First 3 Minutes`,
      conditionShort: "ONH Liquidity Sweep",
      whatItMeans:
        "Smart money pushes price into resting retail buy stops pooled above the overnight high, harvesting exit liquidity before pulling back.",
      actionableDecision:
        "NEVER BUY TICK 1 OF THE BREAKOUT. Allow the sweep to occur and wait for the pullback into VWAP/ON Mid.",
      entryTrigger:
        `Watch if price rejects ONH and falls back inside Globex range. Wait for it to stabilize at ${onMid.toFixed(1)} / ${vwap.toFixed(1)} between 9:34 AM and 9:48 AM before executing today's 1 trade.`,
      invalidation: `Do not enter if price remains extended >${(1.5 * atr15).toFixed(0)} pts above VWAP without resetting.`,
      targetObjective: `Once retrace confirms: ${pdh.toFixed(1)} (PDH) and ${metrics.upperStraddle.toFixed(1)}.`,
      trapWarning:
        "Buying the first green candle at 9:30:15 AM ET is a trap. You buy into smart money's exit liquidity at the top of the range.",
      status: "ACTIVE"
    },
    {
      id: "sc-pdc-test",
      condition: `IF Price Flushes Down to Test Prior Day Close (~${pdc.toFixed(1)})`,
      conditionShort: "PDC Inventory Reset",
      whatItMeans:
        "PDC is the ultimate balance line. Reaching PDC completely wipes out overnight inventory gains. If buyers defend PDC, it offers a high-R responsive bounce.",
      actionableDecision:
        "HIGH-R PIVOT ZONE: Look for a double bottom or hammer candle with absorption at PDC.",
      entryTrigger:
        `Wait for price to tap ${pdc.toFixed(1)}, hold for at least 2 minutes, and print a green engulfing candle back above ${(pdc + 6).toFixed(1)}.`,
      invalidation: `Hard stop at ${(pdc - 8).toFixed(1)}. If price accepts below PDC, market is bearish.`,
      targetObjective: `Target: Mean reversion to VWAP (${vwap.toFixed(1)}, +${Math.round(Math.abs(vwap - pdc))} pts).`,
      trapWarning:
        "Front-running PDC before the flush completes. Wait for selling volume to exhaust first.",
      status: "PENDING"
    }
  ];

  // 8. VWAP Playbook Details
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

  // 9. Phase-Aware Single Trade Directive
  let singleTradeDirective = "";
  if (cmePhase === "DEVELOPING_OVERNIGHT") {
    singleTradeDirective = `DEVELOPING — PREP FOR ${targetFullDate} 9:30 AM OPEN. Overnight session (${sessionInfo.subPhase || "GLOBEX"}) is developing. Key levels anchored to ${sessionInfo.priorTradeDateFormatted} close (${pdc.toFixed(1)}). Note: London session (03:00 ET) and 8:30 AM macro releases have not finalized yet. Maintain patience and observe overnight inventory build.`;
  } else if (cmePhase === "PRE_MARKET_LOCK") {
    singleTradeDirective = `FINAL PRE-MARKET BRIEF — ${targetShortDay} 9:30 AM OPEN. Structure is locked. Wait for the 9:30 AM open drive to settle into ${Math.min(vwap, onMid).toFixed(1)} – ${Math.max(vwap, onMid).toFixed(1)}. Execute 1 trade on candle absorption. Hard stop at ${(Math.min(vwap, onMid) - 10).toFixed(1)}. Target ${onh.toFixed(1)}.`;
  } else if (cmePhase === "NY_OPEN_WINDOW") {
    if (archetype === "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)") {
      singleTradeDirective = `EXECUTION WINDOW ACTIVE — ${targetShortDay} 9:30 AM OPEN. Wait for the 9:30 AM open drive to stall and retrace into ${Math.min(vwap, onMid).toFixed(1)} – ${Math.max(vwap, onMid).toFixed(1)}. Execute 1 trade on candle absorption. Hard stop at ${(Math.min(vwap, onMid) - 10).toFixed(1)}. Target ${onh.toFixed(1)}. Window closes at 10:00 AM ET.`;
    } else if (archetype === "OPEN-DRIVE (RUNAWAY / SHALLOW RETRACE ONLY)") {
      singleTradeDirective = `EXECUTION WINDOW ACTIVE — ${targetShortDay} 9:30 AM OPEN. Runaway momentum day. Do NOT wait for deep VWAP. Enter on a shallow 8–15 pt pullback after the 3-minute open candle, or stand aside if price is overextended.`;
    } else if (archetype === "OPEN-REVERSAL / INVENTORY FLUSH") {
      singleTradeDirective = `EXECUTION WINDOW ACTIVE — ${targetShortDay} 9:30 AM OPEN. Overnight longs are trapped. Do NOT buy the first dip. Allow price to flush to PDC (${pdc.toFixed(1)}) before considering any trade.`;
    } else {
      singleTradeDirective = `EXECUTION WINDOW ACTIVE — ${targetShortDay} 9:30 AM OPEN. Chop pinch between PDC and VWAP. Do NOT burn today's 1 trade inside the noise. Require a clean 15-pt directional expansion before entering.`;
    }
  } else if (cmePhase === "POST_WINDOW_RECAP") {
    singleTradeDirective = `${targetShortDay} 9:30 AM WINDOW COMPLETE — STAY FLAT / LOG TRADE. Today's execution window is closed. Do not take afternoon continuation trades. Review today's trade in the Empirical Journal (/journal) and prepare for tomorrow's session at the 6:00 PM ET Globex open.`;
  } else {
    singleTradeDirective = `MARKET CLOSED — PREPARING FOR ${targetFullDate} 9:30 AM OPEN. CME maintenance break / weekend closure in effect. Prepare for the 18:00 ET Globex open.`;
  }

  // 10. Timeline Guide
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
      rule: "MOVE STOP TO BREAKEVEN OR TAKE PROFIT. If trade is up >1.5R, trail stop. Flatten or secure runners before 10:00 AM macro releases."
    }
  };

  // 11. 1-Minute Lower Timeframe Execution Card & Reachability Target Engine
  let ltfTradeCard: LTFTradeCard | undefined = undefined;
  if (options?.intradayBars && options.intradayBars.length > 0) {
    ltfTradeCard = evaluateLTFExecution({
      m1Bars: options.intradayBars,
      currentPrice,
      atrOpen15m: metrics.atrOpen15m || atr15,
      metrics,
      layer1,
      layer2,
      keyLevels: options.keyLevels,
      propProfile: options.propProfile,
      events: options.economicEvents
    });
  }

  return {
    singleTradeDirective,
    trader5Answers,
    retraceAnalysis,
    scenarios,
    sessionPhase,
    executionSubPhase,
    isDelayedFeedWarningActive,
    delayedFeedBannerText,
    newsBufferWarning,
    qqqLiveProxy: options?.qqqProxyQuote,
    layer1RiskGates: layer1,
    layer2DirectionalScore: layer2,
    ltfTradeCard,
    timelineGuide,
    vwapPlaybook,
    sessionInfo,
    cmePhase
  };
}
