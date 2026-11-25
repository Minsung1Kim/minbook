import { OpenBriefData, KeyLevel } from "../../types/market";
import { computeLevelVitality } from "../../components/KeyLevelsTable";
import { getCMESessionInfo, getETParts, ActiveFuturesSession } from "./sessionClock";
import { getUpcomingSessionNews } from "./economicCalendar";

export type BiasDirectionLabel = "BULLISH" | "BEARISH" | "NO CLEAR EDGE";

export interface QuantFactItem {
  id: string;
  label: string;
  status: "BULLISH" | "BEARISH" | "NEUTRAL" | "CAUTION";
  headline: string;
  mathDetail: string;
}

export interface ActionableArea {
  id: string;
  name: string;
  shortName: string;
  price: number;
  distancePts: number;
  absDistancePts: number;
  reason: string;
  strengthLabel: "HIGH" | "STRONG" | "MODERATE";
  directionTag: "SUPPORT" | "RESISTANCE" | "UPSIDE TARGET" | "DOWNSIDE TARGET";
  sourceLevel?: KeyLevel;
}

export interface FuturesGameplan {
  activeSession: ActiveFuturesSession;
  sessionLabel: string;
  sessionWindowHuman: string;
  stopHunt: {
    shouldWait: boolean;
    badge: string;
    detail: string;
  };
  stopLoss: {
    mode: "AT_WICK" | "EXTRA_ROOM";
    badge: string;
    detail: string;
  };
  keyTips: Array<{
    label: string;
    value: string;
    tone: "emerald" | "amber" | "rose" | "neutral";
  }>;
}

export interface HorizonPrediction {
  horizon: "1H" | "4H" | "DAY";
  label: string;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  summary: string;
}

export interface PlainEnglishBrief {
  direction: BiasDirectionLabel;
  verdictTitle: string;
  verdictSubtitle: string;
  scoreSummary: string;
  riskStatus: {
    label: string;
    tone: "emerald" | "amber" | "rose";
    reason: string;
    sizeMultiplier: 1.0 | 0.5 | 0.0;
  };
  horizonPredictions: HorizonPrediction[];
  gameplan: FuturesGameplan;
  quantFacts: QuantFactItem[];
  bounceAreas: ActionableArea[];
  targetAreas: ActionableArea[];
}

function getFriendlyLevelName(shortName: string, name: string): string {
  const s = shortName.toLowerCase();
  if (s.includes("vwap")) return "Session VWAP (Fair Value)";
  if (s === "on mid") return "Overnight 50% Midpoint";
  if (s === "pdc") return "Yesterday's Close";
  if (s === "pdh") return "Yesterday's High";
  if (s === "pdl") return "Yesterday's Low";
  if (s === "onh") return "Overnight High";
  if (s === "onl") return "Overnight Low";
  if (s === "prior poc") return "Yesterday's Highest-Volume Price (POC)";
  if (s === "prior vah") return "Yesterday's Value Area High";
  if (s === "prior val") return "Yesterday's Value Area Low";
  if (s === "lon high") return "London Session High";
  if (s === "lon low") return "London Session Low";
  if (s === "asia high") return "Asia Session High";
  if (s === "asia low") return "Asia Session Low";
  if (s === "day high") return "Today's Session High";
  if (s === "day low") return "Today's Session Low";
  if (s.includes("htf 50")) return "5-Day 50% Pullback";
  if (s.includes("htf 61.8")) return "5-Day 61.8% Deep Pullback";
  if (s.includes("htf 70.5")) return "5-Day 70.5% Extreme Pullback";
  if (s.includes("upper straddle")) return "Expected Daily Move High (Straddle)";
  if (s.includes("lower straddle")) return "Expected Daily Move Low (Straddle)";
  if (s.includes("upper 1-sd")) return "1-SD Upper Volatility Bound";
  if (s.includes("lower 1-sd")) return "1-SD Lower Volatility Bound";
  return name;
}

function getBounceReason(shortName: string, direction: BiasDirectionLabel, price: number, spot: number): string {
  const s = shortName.toLowerCase();
  const isSupport = price <= spot;
  if (s.includes("vwap")) {
    return isSupport
      ? "Institutional average price today — buyers commonly step in here on dips."
      : "Institutional average price today — rallies often stall here when sellers lead.";
  }
  if (s === "on mid") {
    return "Halfway mark of the overnight range; common equilibrium bounce zone.";
  }
  if (s === "pdc") {
    return "Yesterday's 4:00 PM settlement; major dividing line between buyers and sellers.";
  }
  if (s === "prior poc") {
    return "Highest volume price from yesterday — acts as a strong magnet and reaction floor.";
  }
  if (s === "prior val" || s === "prior vah") {
    return "Edge of yesterday's 70% value area; price often reacts on first test.";
  }
  if (s === "onl" || s === "lon low" || s === "asia low" || s === "day low") {
    return "Resting sell stops below this low — watch for a quick sweep and bounce up.";
  }
  if (s === "onh" || s === "lon high" || s === "asia high" || s === "day high") {
    return "Resting buy stops above this high — watch for a quick poke and reject down.";
  }
  if (s.includes("htf 50") || s.includes("htf 61.8")) {
    return "Multi-day Fibonacci retracement level where swing buyers/sellers defend trend.";
  }
  if (s.includes("put wall")) {
    return "Heavy options put open interest — dealer hedging creates buying support here.";
  }
  if (s.includes("call wall")) {
    return "Heavy options call open interest — dealer hedging creates selling resistance here.";
  }
  if (s.includes("gamma flip")) {
    return "Options Gamma Flip level — behavior shifts from calm mean-reversion to fast swings below.";
  }
  return direction === "BEARISH"
    ? "Key overhead structure where bounces can fail."
    : "Key structural support where pullbacks can bounce.";
}

function getTargetReason(shortName: string, isUpside: boolean): string {
  const s = shortName.toLowerCase();
  if (s === "onh") return "Overnight High — resting buy stops sit above here as an upside magnet.";
  if (s === "onl") return "Overnight Low — resting sell stops sit below here as a downside magnet.";
  if (s === "pdh") return "Yesterday's High — primary multi-session upside liquidity target.";
  if (s === "pdl") return "Yesterday's Low — primary multi-session downside liquidity target.";
  if (s === "lon high") return "London High — European session resistance/magnet overhead.";
  if (s === "lon low") return "London Low — European session floor/magnet below.";
  if (s === "asia high") return "Asia High — overnight Globex ceiling/liquidity magnet overhead.";
  if (s === "asia low") return "Asia Low — overnight Globex floor/liquidity magnet below.";
  if (s === "day high") return "Today's Session High — active intraday high & buy-side liquidity target.";
  if (s === "day low") return "Today's Session Low — active intraday low & sell-side liquidity target.";
  if (s === "prior vah") return "Yesterday's Value Area High — upper fair-value boundary.";
  if (s === "prior val") return "Yesterday's Value Area Low — lower fair-value boundary.";
  if (s === "prior poc") return "Yesterday's Point of Control — high-volume price magnet.";
  if (s.includes("call wall")) return "Heavy call options strike — acts as an upside magnet and ceiling.";
  if (s.includes("put wall")) return "Heavy put options strike — acts as a downside magnet and floor.";
  if (s.includes("straddle")) return "Options-implied typical daily move boundary (~57.5% range coverage).";
  if (s.includes("1-sd")) return "1-Standard Deviation daily move bound derived from VXN/VOLQ.";
  if (s.includes("vwap")) return "Session VWAP fair-value mean-reversion target.";
  return isUpside ? "Overhead liquidity target." : "Downside liquidity target.";
}

function deduplicateAreas(areas: ActionableArea[], minGapPts = 4): ActionableArea[] {
  const kept: ActionableArea[] = [];
  for (const area of areas) {
    if (!kept.some((k) => Math.abs(k.price - area.price) < minGapPts)) {
      kept.push(area);
    }
  }
  return kept;
}

export function buildPlainEnglishBrief(
  brief: OpenBriefData,
  overrideNow?: Date
): PlainEnglishBrief {
  const spot = brief.quote.price;
  const metrics = brief.sessionMetrics;
  const bias = brief.bias;
  const plan = brief.tacticalPlan;
  const layer1 = plan.layer1RiskGates ?? bias.layer1RiskGates;
  const layer2 = plan.layer2DirectionalScore;
  const vol = brief.macro.volatilitySurface ?? bias.volatilitySurface;
  const macro = brief.macro.macroRegime ?? bias.macroRegime;
  const gex = brief.gex ?? bias.gex;
  const footprint = brief.footprint;

  const sessionInfo = overrideNow
    ? getCMESessionInfo(overrideNow)
    : brief.sessionInfo?.activeSession
    ? brief.sessionInfo
    : getCMESessionInfo(brief.sessionInfo?.nowET ? new Date(brief.sessionInfo.nowET) : new Date());
  const activeSession = sessionInfo.activeSession;
  const etNow = getETParts(sessionInfo.nowET ? new Date(sessionInfo.nowET) : new Date());
  const etTotalMins = etNow.hour * 60 + etNow.minute;

  // 1. Determine Direction
  let direction: BiasDirectionLabel = "NO CLEAR EDGE";
  if (bias.verdict.includes("BULLISH")) {
    direction = "BULLISH";
  } else if (bias.verdict.includes("BEARISH")) {
    direction = "BEARISH";
  } else if (layer2?.direction === "BULLISH" && layer1?.allowTrading && !layer1?.reversalVetoActive) {
    direction = "BULLISH";
  } else if (layer2?.direction === "BEARISH" && layer1?.allowTrading && !layer1?.reversalVetoActive) {
    direction = "BEARISH";
  }

  // 2. Plain-English Risk Reason (never contradicts 0x vs 0.5x)
  const buildPlainRiskReason = (): string => {
    const reasons: string[] = [];
    if (vol && (vol.termRatio > 1.0 || vol.termStructureRegime === "BACKWARDATION (STRESS)")) {
      reasons.push(
        `Short-term fear is elevated (VIX is ${vol.termRatio.toFixed(2)}x 3-month VIX), meaning price often spikes sharply and reverses both ways to run stops.`
      );
    }
    if (vol?.isNegativeVrp) {
      reasons.push("Actual price swings are larger than options priced in — expect sharper wicks and stop sweeps.");
    }
    if (vol && vol.vvix >= 110) {
      reasons.push(`Volatility itself is spiking (VVIX ${vol.vvix.toFixed(0)}), making clean trends less reliable.`);
    }
    if (layer1?.reversalVetoActive) {
      const crowdNoun = activeSession === "ASIA" ? "Asia session" : "Overnight";
      const midName = activeSession === "ASIA" ? "session midpoint" : "overnight midpoint";
      reasons.push(
        metrics.inventoryPercent >= 70
          ? `${crowdNoun} buyers (${metrics.inventoryPercent}%) are trapped below the ${midName}, risking a long liquidation sweep.`
          : `${crowdNoun} sellers (${100 - metrics.inventoryPercent}%) are trapped above the ${midName}, risking a short squeeze.`
      );
    }
    if (reasons.length === 0) {
      return "Market volatility is normal and levels are clean.";
    }
    return reasons.join(" ");
  };

  const plainRiskReason = buildPlainRiskReason();

  // 3. Verdict Headline & Subtitle (Direct, zero jargon)
  let verdictTitle = "No Clear Bias — Wait for Direction";
  let verdictSubtitle = "Quant signals are split right now. Wait for price to clearly pick a side before trading.";

  if (bias.verdict === "STAND ASIDE / HIGH VOL") {
    verdictTitle = "Do Not Trade — Sharp Two-Way Swings";
    verdictSubtitle = `${plainRiskReason} Best move is to stay flat.`;
  } else if (layer1?.reversalVetoActive) {
    verdictTitle =
      activeSession === "ASIA"
        ? "Be Careful — Early Session Crowd Is Trapped"
        : "Be Careful — Overnight Crowd Is Trapped";
    verdictSubtitle = plainRiskReason;
  } else if (direction === "BULLISH") {
    verdictTitle = "Lean Bullish — Look for Dips to Bounce";
    const aboveVwap = spot >= metrics.sessionVwap;
    const abovePdc = spot >= metrics.pdc;
    verdictSubtitle =
      aboveVwap && abovePdc
        ? `Price is holding above Session VWAP (${metrics.sessionVwap.toFixed(1)}) and Yesterday's Close (${metrics.pdc.toFixed(1)}) with buyers in control.`
        : aboveVwap
        ? `Buyers are leading intraday above Session VWAP (${metrics.sessionVwap.toFixed(1)}); next key hurdle is Yesterday's Close (${metrics.pdc.toFixed(1)}).`
        : `Higher-timeframe and macro signals tilt bullish while price hovers near VWAP (${metrics.sessionVwap.toFixed(1)}).`;
  } else if (direction === "BEARISH") {
    verdictTitle = "Lean Bearish — Look for Bounces to Reject";
    const belowVwap = spot < metrics.sessionVwap;
    const belowPdc = spot < metrics.pdc;
    verdictSubtitle =
      belowVwap && belowPdc
        ? `Price is below Session VWAP (${metrics.sessionVwap.toFixed(1)}) and Yesterday's Close (${metrics.pdc.toFixed(1)}) with sellers in control.`
        : belowPdc
        ? `Price remains below Yesterday's Close (${metrics.pdc.toFixed(1)}) with bearish flow pressure near VWAP (${metrics.sessionVwap.toFixed(1)}).`
        : `Sellers hold the edge on momentum/macro flow while price tests Session VWAP (${metrics.sessionVwap.toFixed(1)}).`;
  }

  // 4. Honest, Easy-to-Read Signal Tally
  const bullCount = layer2?.signals.filter((s) => s.score > 0).length ?? 0;
  const bearCount = layer2?.signals.filter((s) => s.score < 0).length ?? 0;

  const scoreSummary =
    direction === "BULLISH"
      ? `${bullCount} of 4 Signals Bullish`
      : direction === "BEARISH"
      ? `${bearCount} of 4 Signals Bearish`
      : bullCount === 0 && bearCount === 0
      ? "All 4 Signals Neutral"
      : `Signals Split (${bullCount} Bull, ${bearCount} Bear)`;

  // 5. Risk Status Badge
  const sizeMultiplier = bias.regimeRiskMultiplier;
  let riskStatus: PlainEnglishBrief["riskStatus"];
  if (sizeMultiplier === 0.0 || !layer1?.allowTrading) {
    riskStatus = {
      label: "STAY FLAT (0x SIZE)",
      tone: "rose",
      reason: plainRiskReason,
      sizeMultiplier: 0.0
    };
  } else if (sizeMultiplier === 0.5) {
    riskStatus = {
      label: "USE HALF SIZE (0.5x)",
      tone: "amber",
      reason: plainRiskReason,
      sizeMultiplier: 0.5
    };
  } else {
    riskStatus = {
      label: "NORMAL SIZE (1.0x)",
      tone: "emerald",
      reason: "Volatility is calm and normal.",
      sizeMultiplier: 1.0
    };
  }

  // 5. Quant Facts (Plain English + Exact Math)
  const quantFacts: QuantFactItem[] = [];

  // Fact 1: Price Location vs VWAP & Prior Close
  const diffVwap = spot - metrics.sessionVwap;
  const diffPdc = spot - metrics.pdc;
  const locSignal = layer2?.signals.find((s) => s.id === "compositeLocation");
  quantFacts.push({
    id: "price-location",
    label: "Price vs Fair Value",
    status: locSignal?.score === 1 ? "BULLISH" : locSignal?.score === -1 ? "BEARISH" : "NEUTRAL",
    headline:
      diffVwap >= 0 && diffPdc >= 0
        ? "Trading above both VWAP and Yesterday's Close"
        : diffVwap < 0 && diffPdc < 0
        ? "Trading below both VWAP and Yesterday's Close"
        : "Split between VWAP and Yesterday's Close",
    mathDetail: `${diffVwap >= 0 ? "+" : ""}${diffVwap.toFixed(1)} pts vs VWAP (${metrics.sessionVwap.toFixed(1)}) · ${diffPdc >= 0 ? "+" : ""}${diffPdc.toFixed(1)} pts vs PDC (${metrics.pdc.toFixed(1)}) · 5D Trend: ${bias.htfTrend}`
  });

  // Fact 2: Session Positioning (Asia / London / NY RTH aware)
  const inv = metrics.inventoryPercent;
  const sessionNoun =
    activeSession === "ASIA"
      ? "Asia session"
      : activeSession === "LONDON"
      ? "Asia + London"
      : "Overnight Globex";
  quantFacts.push({
    id: "overnight-inventory",
    label: activeSession === "ASIA" ? "Asia Session Positioning" : "Overnight Positioning",
    status:
      layer1?.reversalVetoActive
        ? "CAUTION"
        : inv >= 65
        ? "BULLISH"
        : inv <= 35
        ? "BEARISH"
        : "NEUTRAL",
    headline:
      layer1?.reversalVetoActive
        ? `${sessionNoun} crowd is trapped offside — watch for stop sweep`
        : inv >= 65
        ? `${sessionNoun} buyers controlled most of the session`
        : inv <= 35
        ? `${sessionNoun} sellers controlled most of the session`
        : `${sessionNoun} session is balanced (two-sided)`,
    mathDetail: `${inv}% of Globex candles closed above Yesterday's Close (${metrics.pdc.toFixed(1)}). Range: ${metrics.onl.toFixed(1)}–${metrics.onh.toFixed(1)} (${metrics.overnightRange.toFixed(1)} pts).`
  });

  // Fact 3: NQ vs ES Divergence (SMT)
  const smt = metrics.smtDivergence;
  const smtHasDiv = Boolean(smt?.hasDivergence);
  quantFacts.push({
    id: "smt-divergence",
    label: "NQ vs S&P 500 (SMT)",
    status: smtHasDiv ? (smt?.direction === "BULLISH" ? "BULLISH" : "BEARISH") : "NEUTRAL",
    headline: smtHasDiv
      ? smt!.direction === "BULLISH"
        ? "Bullish divergence — one index swept lows while the other held"
        : "Bearish divergence — one index poked highs while the other lagged"
      : "NQ and S&P 500 (ES) are moving in sync",
    mathDetail: smtHasDiv
      ? smt!.divergenceType
      : `Synced: NQ ${spot.toFixed(1)} vs ES ${smt?.esPrice ? smt.esPrice.toFixed(1) : "--"} (no manipulation divergence).`
  });

  // Fact 4: Options Dealer Positioning (GEX)
  if (gex) {
    const isPosGamma = gex.netGammaRegime === "POSITIVE_GAMMA";
    quantFacts.push({
      id: "dealer-gex",
      label: "Options Dealer Gamma (GEX)",
      status: isPosGamma ? "NEUTRAL" : "CAUTION",
      headline: isPosGamma
        ? "Positive Gamma — dealers dampen big moves (bounces mean-revert)"
        : "Negative Gamma — dealers amplify momentum (faster, wider swings)",
      mathDetail: `Net GEX: ${gex.totalNetGex >= 0 ? "+" : "-"}$${Math.abs(gex.totalNetGex / 1e6).toFixed(0)}M · Flip: ${gex.gammaFlipNq.toFixed(0)} · Put Wall: ${gex.putWallNq.toFixed(0)} · Call Wall: ${gex.callWallNq.toFixed(0)}`
    });
  }

  // Fact 5: Volatility Math (VXN vs Realized Vol)
  if (vol) {
    const vrpRatio = vol.vrpRatio ?? (vol.realizedVolYZ20d > 0 ? vol.vxn / vol.realizedVolYZ20d : 1.0);
    const isStressed = vol.isNegativeVrp || vol.termRatio > 1.0 || vol.vvix >= 110;
    quantFacts.push({
      id: "volatility-math",
      label: "Volatility & Expected Range",
      status: isStressed ? "CAUTION" : "NEUTRAL",
      headline: vol.isNegativeVrp
        ? "Market is moving faster than options priced — expect sharper wicks"
        : vol.termRatio > 1.0
        ? "Short-term fear higher than 3-month (Backwardation) — choppy"
        : "Normal volatility pricing — cleaner respect of key levels",
      mathDetail: `VXN ${vol.vxn.toFixed(1)}% vs 20d Realized ${vol.realizedVolYZ20d.toFixed(1)}% (Ratio ${vrpRatio.toFixed(2)}) · Daily Expected Move: ±${metrics.expectedMoveStraddle.toFixed(0)} pts (1-SD: ±${metrics.expectedMove1SD.toFixed(0)} pts)`
    });
  }

  // Fact 6: Macro (10Y Treasury / Dollar)
  if (macro) {
    quantFacts.push({
      id: "macro-rates",
      label: "Bonds & Dollar Macro",
      status:
        macro.macroHeadwindScore > 0
          ? "BULLISH"
          : macro.macroHeadwindScore < 0
          ? "BEARISH"
          : "NEUTRAL",
      headline:
        macro.macroHeadwindScore > 0
          ? "Bond rally / easing yields acting as a tailwind for tech"
          : macro.macroHeadwindScore < 0
          ? "Rising yields / strong dollar pressuring tech futures"
          : "Rates and US Dollar are relatively flat",
      mathDetail: `10Y Note (ZN): ${macro.znChange !== undefined ? `${macro.znChange >= 0 ? "+" : ""}${macro.znChange.toFixed(2)}` : "--"} · DXY: ${macro.dxyPercentChange >= 0 ? "+" : ""}${macro.dxyPercentChange.toFixed(2)}% · 60d Stock-Bond r = ${macro.stockBondCorrelation60d.toFixed(2)}`
    });
  }

  // Fact 7: Order Flow (1m Derived Delta)
  if (footprint) {
    const cvd = footprint.sessionCvd;
    quantFacts.push({
      id: "order-flow",
      label: "1m Buying vs Selling Flow",
      status: cvd > 500 ? "BULLISH" : cvd < -500 ? "BEARISH" : "NEUTRAL",
      headline:
        cvd > 500
          ? "Net buying pressure across 1-minute volume bars"
          : cvd < -500
          ? "Net selling pressure across 1-minute volume bars"
          : "1-minute buying and selling volume is balanced",
      mathDetail: `Session Delta Proxy: ${cvd >= 0 ? "+" : ""}${Math.round(cvd).toLocaleString()} · RTH Delta: ${footprint.rthCvd >= 0 ? "+" : ""}${Math.round(footprint.rthCvd).toLocaleString()} (1m derived)`
    });
  }

  // 6. Build Candidate Pool Including GEX Levels & Active Session High/Low
  const allCandidates: KeyLevel[] = [...brief.keyLevels];
  const addSyntheticLevel = (
    id: string,
    shortName: string,
    name: string,
    price: number | undefined,
    role: KeyLevel["role"]
  ) => {
    if (!price || !Number.isFinite(price) || price <= 0) return;
    if (allCandidates.some((l) => l.id === id || l.shortName.toLowerCase() === shortName.toLowerCase())) {
      return;
    }
    allCandidates.push({
      id,
      name,
      shortName,
      price,
      role,
      distancePoints: Math.round((price - spot) * 10) / 10,
      distancePercent: Math.round(((price - spot) / spot) * 10000) / 100,
      timeframe: "INTRADAY",
      note: name
    });
  };

  if (metrics.asiaHigh && metrics.asiaLow) {
    addSyntheticLevel("lvl-asia-h", "Asia High", "Asia Session High", metrics.asiaHigh, "LIQUIDITY POOL");
    addSyntheticLevel("lvl-asia-l", "Asia Low", "Asia Session Low", metrics.asiaLow, "LIQUIDITY POOL");
  }
  if (
    (activeSession === "NY_AM" ||
      activeSession === "NY_LUNCH" ||
      activeSession === "NY_PM" ||
      activeSession === "POST_CLOSE") &&
    brief.quote.high > 0 &&
    brief.quote.low > 0
  ) {
    addSyntheticLevel("lvl-day-high", "Day High", "Today's Session High", brief.quote.high, "LIQUIDITY POOL");
    addSyntheticLevel("lvl-day-low", "Day Low", "Today's Session Low", brief.quote.low, "LIQUIDITY POOL");
  }
  if (gex) {
    addSyntheticLevel("gex-put-wall", "Put Wall", "Options Put Wall", gex.putWallNq, "LIQUIDITY POOL");
    addSyntheticLevel("gex-call-wall", "Call Wall", "Options Call Wall", gex.callWallNq, "LIQUIDITY POOL");
    addSyntheticLevel("gex-flip", "Gamma Flip", "Options Gamma Flip", gex.gammaFlipNq, "EQUILIBRIUM");
  }

  const bouncePool: ActionableArea[] = [];
  const targetPool: ActionableArea[] = [];

  for (const lvl of allCandidates) {
    if (!Number.isFinite(lvl.price) || lvl.price <= 0) continue;
    const s = lvl.shortName.toLowerCase();
    const dist = Math.round((lvl.price - spot) * 10) / 10;
    const absDist = Math.abs(dist);
    const vitality = computeLevelVitality(lvl, spot);
    const strengthLabel: ActionableArea["strengthLabel"] =
      vitality.structuralWeight >= 85 || s.includes("wall") || s.includes("flip")
        ? "HIGH"
        : vitality.structuralWeight >= 70
        ? "STRONG"
        : "MODERATE";

    const friendlyName = getFriendlyLevelName(lvl.shortName, lvl.name);

    // Bounce / Pullback candidates:
    const isBounceType =
      s.includes("vwap") ||
      s === "on mid" ||
      s === "pdc" ||
      s === "prior poc" ||
      s === "prior val" ||
      s === "prior vah" ||
      s.includes("htf 50") ||
      s.includes("htf 61.8") ||
      s.includes("put wall") ||
      s.includes("call wall") ||
      s.includes("gamma flip") ||
      s === "onl" ||
      s === "onh" ||
      s === "lon low" ||
      s === "lon high" ||
      s === "asia low" ||
      s === "asia high" ||
      s === "day low" ||
      s === "day high";

    if (isBounceType) {
      // Direction filter for clean bounce areas:
      const matchesBullBounce = direction === "BULLISH" && lvl.price <= spot + 12;
      const matchesBearBounce = direction === "BEARISH" && lvl.price >= spot - 12;
      const matchesNeutralBounce = direction === "NO CLEAR EDGE" && absDist <= 220;

      if (matchesBullBounce || matchesBearBounce || matchesNeutralBounce) {
        bouncePool.push({
          id: `bounce-${lvl.id}`,
          name: friendlyName,
          shortName: lvl.shortName,
          price: lvl.price,
          distancePts: dist,
          absDistancePts: absDist,
          reason: getBounceReason(lvl.shortName, direction, lvl.price, spot),
          strengthLabel,
          directionTag: lvl.price <= spot ? "SUPPORT" : "RESISTANCE",
          sourceLevel: lvl
        });
      }
    }

    // Target / Magnet candidates:
    const isTargetType =
      s === "onh" ||
      s === "onl" ||
      s === "pdh" ||
      s === "pdl" ||
      s === "lon high" ||
      s === "lon low" ||
      s === "asia high" ||
      s === "asia low" ||
      s === "day high" ||
      s === "day low" ||
      s === "prior vah" ||
      s === "prior val" ||
      s === "prior poc" ||
      s.includes("call wall") ||
      s.includes("put wall") ||
      s.includes("straddle") ||
      s.includes("1-sd") ||
      s.includes("vwap");

    if (isTargetType && absDist >= 5) {
      const isUpside = lvl.price > spot;
      const matchesBullTarget = direction === "BULLISH" && isUpside;
      const matchesBearTarget = direction === "BEARISH" && !isUpside;
      const matchesNeutralTarget =
        direction === "NO CLEAR EDGE" &&
        (s === "onh" ||
          s === "onl" ||
          s === "pdh" ||
          s === "pdl" ||
          s === "asia high" ||
          s === "asia low" ||
          s === "lon high" ||
          s === "lon low" ||
          s === "day high" ||
          s === "day low" ||
          s.includes("wall") ||
          s.includes("straddle"));

      if (matchesBullTarget || matchesBearTarget || matchesNeutralTarget) {
        targetPool.push({
          id: `target-${lvl.id}`,
          name: friendlyName,
          shortName: lvl.shortName,
          price: lvl.price,
          distancePts: dist,
          absDistancePts: absDist,
          reason: getTargetReason(lvl.shortName, isUpside),
          strengthLabel,
          directionTag: isUpside ? "UPSIDE TARGET" : "DOWNSIDE TARGET",
          sourceLevel: lvl
        });
      }
    }
  }

  // Sort bounce areas by structural importance + closeness
  bouncePool.sort((a, b) => {
    const scoreA = (a.strengthLabel === "HIGH" ? 30 : a.strengthLabel === "STRONG" ? 15 : 0) - a.absDistancePts * 0.25;
    const scoreB = (b.strengthLabel === "HIGH" ? 30 : b.strengthLabel === "STRONG" ? 15 : 0) - b.absDistancePts * 0.25;
    return scoreB - scoreA;
  });

  // Sort targets by closeness (nearest reachable targets first, excluding tiny <5pt noise)
  targetPool.sort((a, b) => a.absDistancePts - b.absDistancePts);

  // 7. Dynamic Session-Aware Futures Gameplan (Asia, London, NY Pre-Mkt, NY AM, NY Lunch, NY PM, Post-Close)
  const atr15 = metrics.atr15mIntraday || metrics.atrOpen15m || 25;
  const sweepCandidates: Array<{ label: string; price: number }> = [];

  if (activeSession === "LONDON") {
    if (metrics.asiaHigh) sweepCandidates.push({ label: `Asia High (${metrics.asiaHigh.toFixed(1)})`, price: metrics.asiaHigh });
    if (metrics.asiaLow) sweepCandidates.push({ label: `Asia Low (${metrics.asiaLow.toFixed(1)})`, price: metrics.asiaLow });
    sweepCandidates.push({ label: `Prior Day High (${metrics.pdh.toFixed(1)})`, price: metrics.pdh });
    sweepCandidates.push({ label: `Prior Day Low (${metrics.pdl.toFixed(1)})`, price: metrics.pdl });
  } else if (activeSession === "ASIA") {
    if (metrics.asiaHigh && Math.abs(metrics.asiaHigh - spot) > 2) {
      sweepCandidates.push({ label: `Asia High (${metrics.asiaHigh.toFixed(1)})`, price: metrics.asiaHigh });
    }
    if (metrics.asiaLow && Math.abs(metrics.asiaLow - spot) > 2) {
      sweepCandidates.push({ label: `Asia Low (${metrics.asiaLow.toFixed(1)})`, price: metrics.asiaLow });
    }
    sweepCandidates.push({ label: `Yesterday's Close (${metrics.pdc.toFixed(1)})`, price: metrics.pdc });
    sweepCandidates.push({ label: `Prior Day High (${metrics.pdh.toFixed(1)})`, price: metrics.pdh });
    sweepCandidates.push({ label: `Prior Day Low (${metrics.pdl.toFixed(1)})`, price: metrics.pdl });
  } else if (activeSession === "NY_LUNCH" || activeSession === "NY_PM" || activeSession === "POST_CLOSE") {
    if (brief.quote.high > 0) sweepCandidates.push({ label: `Today's Session High (${brief.quote.high.toFixed(1)})`, price: brief.quote.high });
    if (brief.quote.low > 0) sweepCandidates.push({ label: `Today's Session Low (${brief.quote.low.toFixed(1)})`, price: brief.quote.low });
    sweepCandidates.push({ label: `Overnight High (${metrics.onh.toFixed(1)})`, price: metrics.onh });
    sweepCandidates.push({ label: `Overnight Low (${metrics.onl.toFixed(1)})`, price: metrics.onl });
  } else {
    sweepCandidates.push({ label: `Overnight High (${metrics.onh.toFixed(1)})`, price: metrics.onh });
    sweepCandidates.push({ label: `Overnight Low (${metrics.onl.toFixed(1)})`, price: metrics.onl });
  }

  sweepCandidates.sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot));
  const nearestSweep = sweepCandidates[0] || { label: `Overnight High (${metrics.onh.toFixed(1)})`, price: metrics.onh };
  const nearSweepZone = Math.abs(nearestSweep.price - spot) <= Math.max(35, atr15 * 1.5);

  const isVolatileSurface = Boolean(vol?.isNegativeVrp || (vol && vol.termRatio > 1.0) || (vol && vol.vvix >= 110));
  const stopHuntHigh = Boolean(
    plan.trader5Answers?.stopHuntProbability?.includes("HIGH") ||
      layer1?.reversalVetoActive ||
      isVolatileSurface ||
      nearSweepZone ||
      smtHasDiv
  );

  const isOpeningBellWindow = activeSession === "NY_PREMARKET" || (etTotalMins >= 9 * 60 + 30 && etTotalMins <= 9 * 60 + 33);

  const buildStopHuntDetail = (): string => {
    if (stopHuntHigh) {
      if (smtHasDiv) {
        return `NQ/ES divergence active. Wait for price to sweep ${nearestSweep.label} and snap back before entering.`;
      }
      if (isOpeningBellWindow) {
        return `Price is near ${nearestSweep.label}${isVolatileSurface ? " in elevated volatility" : ""}. Let the 09:30–09:33 ET opening sweep poke and reject first — don't buy/sell the first spike.`;
      }
      if (activeSession === "ASIA") {
        return `Asia session: price is near ${nearestSweep.label}. Wait for a clear sweep and 5m–15m reclaim/rejection before entering — Globex moves slower with thinner books.`;
      }
      if (activeSession === "LONDON") {
        return `London session: price is near ${nearestSweep.label}. Wait for the European sweep and snap-back inside range rather than chasing the initial spike.`;
      }
      if (activeSession === "CME_BREAK" || activeSession === "WEEKEND") {
        return `Market is currently paused (${sessionInfo.activeSessionLabel}). Watch ${nearestSweep.label} as the first key sweep zone when trading resumes.`;
      }
      const sessionDisplay = activeSession === "NY_PM" ? "NY PM" : activeSession === "NY_LUNCH" ? "NY Lunch" : "NY AM";
      return `${sessionDisplay}: price is near ${nearestSweep.label}${isVolatileSurface ? " in elevated volatility" : ""}. Let price sweep that level and reclaim/reject cleanly on 5m before entering — don't chase spikes.`;
    }

    if (isOpeningBellWindow) {
      return "No extreme sweep trap right now, but skip the opening 3 minutes (09:30–09:33 ET) and enter on a clean pullback to VWAP or midpoint.";
    }
    if (activeSession === "CME_BREAK" || activeSession === "WEEKEND") {
      return `Market is between sessions (${sessionInfo.activeSessionCountdown}). Wait for live open and look for clean pullbacks to VWAP or key levels below.`;
    }
    return `No extreme sweep trap nearby — wait for a clean pullback to Session VWAP (${metrics.sessionVwap.toFixed(1)}) or one of the key levels below instead of chasing mid-range candles.`;
  };

  const stopHunt: FuturesGameplan["stopHunt"] = stopHuntHigh
    ? {
        shouldWait: true,
        badge: "YES — WAIT FOR STOP HUNT",
        detail: buildStopHuntDetail()
      }
    : {
        shouldWait: false,
        badge: "WAIT FOR PULLBACK",
        detail: buildStopHuntDetail()
      };

  const needsExtraSlRoom = Boolean(
    isVolatileSurface || gex?.netGammaRegime === "NEGATIVE_GAMMA" || atr15 >= 32
  );
  const stopLoss: FuturesGameplan["stopLoss"] = needsExtraSlRoom
    ? {
        mode: "EXTRA_ROOM",
        badge: "GIVE EXTRA ROOM (+5–8 pts past wick)",
        detail: `15m swings are wide (~${atr15.toFixed(0)} pts${vol?.isNegativeVrp ? ", realized vol > implied" : ""}). Place your stop 5–8 pts beyond the swing wick so normal noise doesn't tag you.`
      }
    : {
        mode: "AT_WICK",
        badge: "AT THE WICK (+2–3 pts buffer)",
        detail: `Volatility is normal (15m ATR ~${atr15.toFixed(0)} pts${gex?.netGammaRegime === "POSITIVE_GAMMA" ? ", +GEX dampening" : ""}). Putting your stop 2–3 pts beyond the sweep/swing wick is enough.`
      };

  const sessionNoteText = (() => {
    switch (activeSession) {
      case "ASIA":
        return "Asia Session live: thinner liquidity & tighter ranges — fade extremes cleanly or watch sweeps of Asia High/Low & Yesterday's Close.";
      case "LONDON":
        return "London Session live: European flow frequently sweeps Asia High/Low before picking pre-NY direction.";
      case "NY_PREMARKET":
        return "NY Pre-Market: overnight & London levels are locking in; wait 3 mins past the 09:30 ET bell before clicking.";
      case "NY_AM":
        return etTotalMins <= 9 * 60 + 33
          ? "Opening bell 3-min window (09:30–09:33 ET) — let initial stop sweeps settle before entering."
          : "NY AM Session live: highest liquidity window — enter on clean VWAP or level pullbacks instead of chasing green/red candles.";
      case "NY_LUNCH":
        return "NY Lunch hour: volume drops and mid-range chops — stick to outer session edges or VWAP sweeps.";
      case "NY_PM":
        return "NY Afternoon (PM) live: watch intraday swing sweeps, VWAP trend holds, and closing imbalance flow into the bell.";
      case "POST_CLOSE":
        return "Post-close settlement window — liquidity thins out ahead of CME maintenance break; use levels to prep Asia.";
      default:
        return `Market paused (${sessionInfo.activeSessionCountdown}) — review key levels to plan the upcoming session.`;
    }
  })();

  const upcomingNews = getUpcomingSessionNews(
    brief.macro.events || [],
    sessionInfo.nowET ? new Date(sessionInfo.nowET) : new Date(),
    brief.targetTradeDate,
    75
  );

  const newsTip =
    upcomingNews.imminent.length > 0
      ? {
          label: "News",
          value: `High-impact Red-folder release ahead: ${upcomingNews.imminent[0].timeET} ET ${upcomingNews.imminent[0].event} — flatten or lock breakeven ahead of print.`,
          tone: "rose" as const
        }
      : upcomingNews.imminentMedium.length > 0
      ? {
          label: "News",
          value: `Orange-folder release ahead (${upcomingNews.imminentMedium[0].timeET} ET ${upcomingNews.imminentMedium[0].event}) — minor spread bump possible, NOT a trade veto.`,
          tone: "amber" as const
        }
      : upcomingNews.laterToday.length > 0
      ? {
          label: "News",
          value: `Later today: ${upcomingNews.laterToday[0].timeET} ET ${upcomingNews.laterToday[0].event}. Session clear until then.`,
          tone: "amber" as const
        }
      : {
          label: "News",
          value: "No high-impact US news remaining ahead in this session.",
          tone: "emerald" as const
        };

  const gexTip = gex
    ? gex.netGammaRegime === "POSITIVE_GAMMA"
      ? { label: "Take Profit Style", value: "Positive Gamma: take profits at targets cleanly (bounces tend to fade back).", tone: "neutral" as const }
      : { label: "Take Profit Style", value: "Negative Gamma: moves run faster; trail stops once in profit.", tone: "amber" as const }
    : { label: "Daily Range", value: `Overnight used ${metrics.overnightRangeConsumedPercent.toFixed(0)}% of today's expected move.`, tone: "neutral" as const };

  const sizeTip =
    sizeMultiplier === 0
      ? { label: "Risk Rule", value: "Stay flat (0x) — choppy / high-risk session.", tone: "rose" as const }
      : sizeMultiplier === 0.5
      ? { label: "Risk Rule", value: "Use 0.5x half size and demand A+ sweep/reclaim confirmation.", tone: "amber" as const }
      : { label: "Risk Rule", value: "Standard 1.0x size — honor your stop loss and avoid forcing mid-range entries.", tone: "emerald" as const };

  const gameplan: FuturesGameplan = {
    activeSession,
    sessionLabel: sessionInfo.activeSessionLabel,
    sessionWindowHuman: sessionInfo.activeSessionWindowHuman,
    stopHunt,
    stopLoss,
    keyTips: [
      { label: "Session", value: sessionNoteText, tone: "neutral" },
      newsTip,
      gexTip,
      sizeTip
    ]
  };

  const dedupedBounces = deduplicateAreas(bouncePool, 4).slice(0, 5);
  const dedupedTargets = deduplicateAreas(targetPool, 4).slice(0, 5);

  const fmtPrice = (p: number) =>
    p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const horizonPredictions: HorizonPrediction[] = (() => {
    const rawPool: Array<{ shortName: string; price: number }> = [
      ...dedupedBounces.map((b) => ({ shortName: b.shortName, price: b.price })),
      { shortName: "Session VWAP", price: metrics.sessionVwap },
      { shortName: "ON Mid", price: metrics.onMid },
      { shortName: "PDC", price: metrics.pdc },
      { shortName: "ONH", price: metrics.onh },
      { shortName: "ONL", price: metrics.onl },
      { shortName: "PDH", price: metrics.pdh },
      { shortName: "PDL", price: metrics.pdl },
      ...(metrics.asiaHigh ? [{ shortName: "Asia High", price: metrics.asiaHigh }] : []),
      ...(metrics.asiaLow ? [{ shortName: "Asia Low", price: metrics.asiaLow }] : []),
      ...(metrics.londonHigh ? [{ shortName: "Lon High", price: metrics.londonHigh }] : []),
      ...(metrics.londonLow ? [{ shortName: "Lon Low", price: metrics.londonLow }] : []),
      ...(gex?.callWallNq ? [{ shortName: "Call Wall", price: gex.callWallNq }] : []),
      ...(gex?.putWallNq ? [{ shortName: "Put Wall", price: gex.putWallNq }] : []),
      ...(gex?.gammaFlipNq ? [{ shortName: "Gamma Flip", price: gex.gammaFlipNq }] : []),
    ].filter((c) => Number.isFinite(c.price) && c.price > 0);

    const isGammaFlip = (c: { shortName: string }) =>
      c.shortName.toLowerCase().includes("gamma flip");

    // Pick closest meaningful pullback strictly on the opposite side (>= 5 pts away from spot)
    const maxPullbackDist = Math.max(180, atr15 * 5);
    const belowPullbacks = rawPool
      .filter((c) => c.price <= spot - 5 && spot - c.price <= maxPullbackDist)
      .sort((a, b) => {
        const scoreA = spot - a.price + (isGammaFlip(a) ? 25 : 0);
        const scoreB = spot - b.price + (isGammaFlip(b) ? 25 : 0);
        return scoreA - scoreB;
      });
    const abovePullbacks = rawPool
      .filter((c) => c.price >= spot + 5 && c.price - spot <= maxPullbackDist)
      .sort((a, b) => {
        const scoreA = a.price - spot + (isGammaFlip(a) ? 25 : 0);
        const scoreB = b.price - spot + (isGammaFlip(b) ? 25 : 0);
        return scoreA - scoreB;
      });

    const nearAtSpot = rawPool
      .filter((c) => Math.abs(c.price - spot) < 5)
      .sort((a, b) => {
        const gA = isGammaFlip(a) ? 1 : 0;
        const gB = isGammaFlip(b) ? 1 : 0;
        if (gA !== gB) return gA - gB;
        return Math.abs(a.price - spot) - Math.abs(b.price - spot);
      })[0];

    const retraceDown = belowPullbacks[0] || null;
    const retraceUp = abovePullbacks[0] || null;

    const nearTargetUp =
      dedupedTargets.find((t) => t.price >= spot + 5) ||
      rawPool
        .filter((c) => c.price >= spot + 5)
        .sort((a, b) => a.price - b.price)[0] || {
        shortName: "Upper 1H Target",
        price: spot + Math.max(25, Math.round(atr15)),
      };

    const nearTargetDown =
      dedupedTargets.find((t) => t.price <= spot - 5) ||
      rawPool
        .filter((c) => c.price <= spot - 5)
        .sort((a, b) => b.price - a.price)[0] || {
        shortName: "Lower 1H Target",
        price: spot - Math.max(25, Math.round(atr15)),
      };

    const macroTargetUp =
      dedupedTargets.find((t) => t.price > nearTargetUp.price + 5) ||
      (metrics.pdh > nearTargetUp.price + 5
        ? { shortName: "PDH", price: metrics.pdh }
        : metrics.upperStraddle > nearTargetUp.price + 5
        ? { shortName: "Upper Straddle", price: metrics.upperStraddle }
        : { shortName: "4H Expansion", price: nearTargetUp.price + Math.max(40, Math.round(atr15 * 1.5)) });

    const macroTargetDown =
      dedupedTargets.find((t) => t.price < nearTargetDown.price - 5) ||
      (metrics.pdl < nearTargetDown.price - 5
        ? { shortName: "PDL", price: metrics.pdl }
        : metrics.lowerStraddle < nearTargetDown.price - 5
        ? { shortName: "Lower Straddle", price: metrics.lowerStraddle }
        : { shortName: "4H Expansion", price: nearTargetDown.price - Math.max(40, Math.round(atr15 * 1.5)) });

    const isRunawayArchetype =
      plan.retraceAnalysis.archetype === "OPEN-DRIVE (RUNAWAY / SHALLOW RETRACE ONLY)" ||
      !plan.retraceAnalysis.isRetraceProbable;
    const retraceStretchLimit = Math.max(38, atr15 * 1.3);

    if (direction === "BULLISH") {
      const bullFloor =
        retraceDown ||
        (metrics.sessionVwap < spot
          ? { shortName: "Session VWAP", price: metrics.sessionVwap }
          : { shortName: "ONL", price: Math.min(metrics.onl, spot - 10) });

      const directPump =
        isRunawayArchetype ||
        (layer2?.totalScore ?? 0) >= 3 ||
        !retraceDown ||
        spot - retraceDown.price > retraceStretchLimit ||
        (gex?.netGammaRegime === "NEGATIVE_GAMMA" &&
          spot > metrics.sessionVwap + 15 &&
          spot > metrics.onMid + 10);

      const summary1h = directPump
        ? `Buying momentum favors a direct pump toward ${fmtPrice(nearTargetUp.price)} (${nearTargetUp.shortName}) without a deep pullback while holding above ${fmtPrice(bullFloor.price)}.`
        : nearAtSpot && spot - retraceDown.price > atr15 * 0.9
        ? `Holding ${fmtPrice(nearAtSpot.price)} (${nearAtSpot.shortName}) right now favors bullish continuation toward ${fmtPrice(nearTargetUp.price)}.`
        : `Expecting a pullback to ${fmtPrice(retraceDown.price)} (${retraceDown.shortName}), then continue bullish toward ${fmtPrice(nearTargetUp.price)}.`;

      return [
        {
          horizon: "1H",
          label: "Next 1 Hr",
          bias: "BULLISH",
          summary: summary1h,
        },
        {
          horizon: "4H",
          label: "Next 4 Hr",
          bias: "BULLISH",
          summary: directPump
            ? `Bullish expansion above ${fmtPrice(bullFloor.price)} (${bullFloor.shortName}) targets a push up to ${fmtPrice(macroTargetUp.price)} (${macroTargetUp.shortName}).`
            : `Holding above ${fmtPrice(bullFloor.price)} targets ${fmtPrice(macroTargetUp.price)} (${macroTargetUp.shortName}) next.`,
        },
        {
          horizon: "DAY",
          label: "Full Day",
          bias: "BULLISH",
          summary: `Above ${fmtPrice(metrics.pdc)} (PDC) keeps the day bullish toward ${fmtPrice(Math.max(metrics.pdh, macroTargetUp.price))}.`,
        },
      ];
    }

    if (direction === "BEARISH") {
      const bearCap =
        retraceUp ||
        (metrics.sessionVwap > spot
          ? { shortName: "Session VWAP", price: metrics.sessionVwap }
          : { shortName: "ONH", price: Math.max(metrics.onh, spot + 10) });

      const directDump =
        isRunawayArchetype ||
        (layer2?.totalScore ?? 0) <= -3 ||
        !retraceUp ||
        retraceUp.price - spot > retraceStretchLimit ||
        (gex?.netGammaRegime === "NEGATIVE_GAMMA" &&
          spot < metrics.sessionVwap - 15 &&
          spot < metrics.onMid - 10);

      const summary1h = directDump
        ? `Selling pressure favors a direct dump toward ${fmtPrice(nearTargetDown.price)} (${nearTargetDown.shortName}) without a deep bounce while capped under ${fmtPrice(bearCap.price)}.`
        : nearAtSpot && retraceUp.price - spot > atr15 * 0.9
        ? `Testing ${fmtPrice(nearAtSpot.price)} (${nearAtSpot.shortName}) right now; rejecting here favors bearish continuation toward ${fmtPrice(nearTargetDown.price)}.`
        : `Expecting a bounce to ${fmtPrice(retraceUp.price)} (${retraceUp.shortName}), then continue bearish toward ${fmtPrice(nearTargetDown.price)}.`;

      return [
        {
          horizon: "1H",
          label: "Next 1 Hr",
          bias: "BEARISH",
          summary: summary1h,
        },
        {
          horizon: "4H",
          label: "Next 4 Hr",
          bias: "BEARISH",
          summary: directDump
            ? `Bearish momentum under ${fmtPrice(bearCap.price)} (${bearCap.shortName}) targets a continuation dump to ${fmtPrice(macroTargetDown.price)} (${macroTargetDown.shortName}).`
            : `Staying capped under ${fmtPrice(bearCap.price)} targets ${fmtPrice(macroTargetDown.price)} (${macroTargetDown.shortName}) next.`,
        },
        {
          horizon: "DAY",
          label: "Full Day",
          bias: "BEARISH",
          summary: `Below ${fmtPrice(metrics.pdc)} (PDC) keeps the day bearish toward ${fmtPrice(Math.min(metrics.pdl, macroTargetDown.price))}.`,
        },
      ];
    }

    const lowEdge = Math.min(metrics.onl, retraceDown?.price ?? metrics.pdl);
    const highEdge = Math.max(metrics.onh, retraceUp?.price ?? metrics.pdh);
    return [
      {
        horizon: "1H",
        label: "Next 1 Hr",
        bias: "NEUTRAL",
        summary: `Expecting two-way range rotation between ${fmtPrice(lowEdge)} and ${fmtPrice(highEdge)} until a break holds.`,
      },
      {
        horizon: "4H",
        label: "Next 4 Hr",
        bias: "NEUTRAL",
        summary: `Range-bound near ${fmtPrice(metrics.sessionVwap)} (VWAP); wait for a sweep of ${fmtPrice(lowEdge)} or ${fmtPrice(highEdge)}.`,
      },
      {
        horizon: "DAY",
        label: "Full Day",
        bias: "NEUTRAL",
        summary: `Balanced inside ${fmtPrice(metrics.pdl)}–${fmtPrice(metrics.pdh)}; fade range edges or stay flat.`,
      },
    ];
  })();

  return {
    direction,
    verdictTitle,
    verdictSubtitle,
    scoreSummary,
    riskStatus,
    horizonPredictions,
    gameplan,
    quantFacts,
    bounceAreas: dedupedBounces,
    targetAreas: dedupedTargets
  };
}
