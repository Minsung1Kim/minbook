import { OpenBriefData, KeyLevel } from "../../types/market";
import { computeLevelVitality } from "../../components/KeyLevelsTable";

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
  if (s === "onl" || s === "lon low") {
    return "Resting sell stops below this low — watch for a quick sweep and bounce up.";
  }
  if (s === "onh" || s === "lon high") {
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
  if (s === "lon high") return "London High — first European session resistance/magnet overhead.";
  if (s === "lon low") return "London Low — first European session floor/magnet below.";
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

export function buildPlainEnglishBrief(brief: OpenBriefData): PlainEnglishBrief {
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
      reasons.push(`Short-term fear is elevated (VIX is ${vol.termRatio.toFixed(2)}x 3-month VIX), which usually causes violent two-way whipsaws.`);
    }
    if (vol?.isNegativeVrp) {
      reasons.push("Actual price swings are larger than options priced in — expect sharper wicks and stop sweeps.");
    }
    if (vol && vol.vvix >= 110) {
      reasons.push(`Volatility itself is spiking (VVIX ${vol.vvix.toFixed(0)}), making clean trends less reliable.`);
    }
    if (layer1?.reversalVetoActive) {
      reasons.push(
        metrics.inventoryPercent >= 70
          ? `Overnight buyers (${metrics.inventoryPercent}%) are trapped below the overnight midpoint, risking an early flush.`
          : `Overnight sellers (${100 - metrics.inventoryPercent}%) are trapped above the overnight midpoint, risking a short squeeze.`
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
    verdictTitle = "Do Not Trade — High Whipsaw Risk";
    verdictSubtitle = `${plainRiskReason} Best move is to stay flat.`;
  } else if (layer1?.reversalVetoActive) {
    verdictTitle = "Be Careful — Overnight Crowd Is Trapped";
    verdictSubtitle = plainRiskReason;
  } else if (direction === "BULLISH") {
    verdictTitle = "Lean Bullish — Look for Dips to Bounce";
    verdictSubtitle = `Price is holding above today's average (${metrics.sessionVwap.toFixed(1)} VWAP) and yesterday's close (${metrics.pdc.toFixed(1)}) with buyers in control.`;
  } else if (direction === "BEARISH") {
    verdictTitle = "Lean Bearish — Look for Bounces to Reject";
    verdictSubtitle = `Price is below today's average (${metrics.sessionVwap.toFixed(1)} VWAP) and yesterday's close (${metrics.pdc.toFixed(1)}) with sellers in control.`;
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

  // Fact 2: Overnight Positioning
  const inv = metrics.inventoryPercent;
  quantFacts.push({
    id: "overnight-inventory",
    label: "Overnight Positioning",
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
        ? "Overnight crowd is trapped offside — watch for stop sweep"
        : inv >= 65
        ? "Overnight buyers controlled most of the session"
        : inv <= 35
        ? "Overnight sellers controlled most of the session"
        : "Overnight session was balanced (two-sided)",
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

  // 6. Build Candidate Pool Including GEX Levels
  const allCandidates: KeyLevel[] = [...brief.keyLevels];
  if (gex) {
    const addGexLevel = (id: string, shortName: string, name: string, price: number, role: KeyLevel["role"]) => {
      if (!price || price <= 0) return;
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
    addGexLevel("gex-put-wall", "Put Wall", "Options Put Wall", gex.putWallNq, "LIQUIDITY POOL");
    addGexLevel("gex-call-wall", "Call Wall", "Options Call Wall", gex.callWallNq, "LIQUIDITY POOL");
    addGexLevel("gex-flip", "Gamma Flip", "Options Gamma Flip", gex.gammaFlipNq, "EQUILIBRIUM");
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
      s === "lon high";

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
        (s === "onh" || s === "onl" || s === "pdh" || s === "pdl" || s.includes("wall") || s.includes("straddle"));

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

  // 7. Futures Day-Trading Gameplan (Stop Hunt, Stop Loss Placement, Key Tips)
  const atr15 = metrics.atr15mIntraday || metrics.atrOpen15m || 25;
  const distToOnh = Math.abs(metrics.onh - spot);
  const distToOnl = Math.abs(spot - metrics.onl);
  const nearOvernightExtreme = Math.min(distToOnh, distToOnl) <= Math.max(35, atr15 * 1.5);
  const isVolatileSurface = Boolean(vol?.isNegativeVrp || (vol && vol.termRatio > 1.0) || (vol && vol.vvix >= 110));
  const stopHuntHigh = Boolean(
    plan.trader5Answers?.stopHuntProbability?.includes("HIGH") ||
      layer1?.reversalVetoActive ||
      isVolatileSurface ||
      nearOvernightExtreme ||
      smtHasDiv
  );

  const nearestSweepLabel =
    distToOnh <= distToOnl
      ? `Overnight High (${metrics.onh.toFixed(1)})`
      : `Overnight Low (${metrics.onl.toFixed(1)})`;

  const stopHunt: FuturesGameplan["stopHunt"] = stopHuntHigh
    ? {
        shouldWait: true,
        badge: "YES — WAIT FOR STOP HUNT",
        detail: smtHasDiv
          ? `NQ/ES divergence active. Wait for price to sweep ${nearestSweepLabel} and snap back before entering.`
          : `Price is near ${nearestSweepLabel}${isVolatileSurface ? " in elevated volatility" : ""}. Let the 9:30–9:33 AM sweep poke and reject first — don't buy/sell the first spike.`
      }
    : {
        shouldWait: false,
        badge: "WAIT FOR PULLBACK",
        detail: `No extreme sweep trap right now, but still skip the first 3 minutes (09:30–09:33 ET) and enter on a clean pullback to VWAP or midpoint.`
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

  const cmePhase = plan.cmePhase || brief.sessionInfo?.phase;
  const timingTip =
    cmePhase === "NY_OPEN_WINDOW"
      ? "Open window live: wait for 09:34–09:48 ET pullback, avoid chasing."
      : cmePhase === "POST_WINDOW_RECAP"
      ? "09:30–10:00 ET prime window is closed — watch out for choppy afternoon fakeouts."
      : "Wait 3 mins after 09:30 ET bell (09:30–09:33) before clicking.";

  const newsTip = plan.newsBufferWarning
    ? { label: "News", value: "High-impact release near open — flatten or lock breakeven before it hits.", tone: "rose" as const }
    : { label: "News", value: "No red-folder US news inside the 09:30–10:00 ET window.", tone: "emerald" as const };

  const gexTip = gex
    ? gex.netGammaRegime === "POSITIVE_GAMMA"
      ? { label: "Take Profit Style", value: "Positive Gamma: take profits at targets cleanly (bounces tend to fade back).", tone: "neutral" as const }
      : { label: "Take Profit Style", value: "Negative Gamma: moves run faster; trail stops once in profit.", tone: "amber" as const }
    : { label: "Daily Range", value: `Overnight used ${metrics.overnightRangeConsumedPercent.toFixed(0)}% of today's expected move.`, tone: "neutral" as const };

  const sizeTip =
    sizeMultiplier === 0
      ? { label: "Risk Rule", value: "Stay flat (0x) — choppy / high-risk session.", tone: "rose" as const }
      : sizeMultiplier === 0.5
      ? { label: "Risk Rule", value: "Use 0.5x half size and stick to 1 clean setup.", tone: "amber" as const }
      : { label: "Risk Rule", value: "Standard 1.0x size — 1–2 quality setups max, no revenge trading.", tone: "emerald" as const };

  const gameplan: FuturesGameplan = {
    stopHunt,
    stopLoss,
    keyTips: [
      { label: "Timing", value: timingTip, tone: "neutral" },
      newsTip,
      gexTip,
      sizeTip
    ]
  };

  return {
    direction,
    verdictTitle,
    verdictSubtitle,
    scoreSummary,
    riskStatus,
    gameplan,
    quantFacts,
    bounceAreas: deduplicateAreas(bouncePool, 4).slice(0, 5),
    targetAreas: deduplicateAreas(targetPool, 4).slice(0, 5)
  };
}
