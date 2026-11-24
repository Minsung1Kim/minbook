import {
  OHLCVBar,
  KeyLevel,
  SessionMetrics,
  LTFTradeCard,
  ReachabilityTarget,
  HTFDemotedLevel,
  PropProfile,
  EconomicEvent,
  Layer1RiskGates,
  Layer2DirectionalScore
} from "@/types/market";
import { computeDetailedRiskPlan } from "../risk/sizing";
import { checkTier1NewsBlackout } from "../market/economicCalendar";
import { getBarETParts } from "../market/levels";

/**
 * Standard Normal Cumulative Distribution Function (Rational approximation, error < 1.5e-7)
 */
export function normalCdf(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * y);
}

/**
 * Computes Brownian motion first-passage touch probability:
 * P(max_{0<=s<=t} W_s >= d) = 2 * (1 - Phi(d / (sigma_15m * sqrt(t / 15))))
 * Parameter: sigma_15m_post = 0.50 * ATR_Open_15m
 */
export function computeBrownianTouchProbability(
  distancePts: number,
  horizonMinutes: 5 | 10 | 15,
  atrOpen15m: number
): number {
  if (distancePts <= 0) return 1.0;
  const safeAtr = Math.max(10, atrOpen15m);
  const sigma15m = 0.5 * safeAtr;
  const sigmaT = sigma15m * Math.sqrt(horizonMinutes / 15);
  if (sigmaT <= 0) return 0;

  const z = distancePts / sigmaT;
  const cdf = normalCdf(z);
  const touchProb = Math.min(1.0, Math.max(0.0, 2 * (1 - cdf)));
  return Math.round(touchProb * 1000) / 1000;
}

export interface EvaluateLTFExecutionParams {
  m1Bars: OHLCVBar[];
  currentPrice: number;
  atrOpen15m: number;
  metrics: SessionMetrics;
  layer1?: Layer1RiskGates;
  layer2?: Layer2DirectionalScore;
  keyLevels?: KeyLevel[];
  propProfile?: PropProfile;
  events?: EconomicEvent[];
  forcedTimeET?: { hour: number; minute: number }; // For deterministic backtests
}

/**
 * Evaluates real-time 1-minute execution context between 09:30 and 09:50 AM ET.
 */
export function evaluateLTFExecution(params: EvaluateLTFExecutionParams): LTFTradeCard {
  const {
    m1Bars,
    currentPrice,
    atrOpen15m,
    metrics,
    layer1,
    layer2,
    keyLevels = [],
    propProfile,
    events = [],
    forcedTimeET
  } = params;

  const safeAtrOpen15m = atrOpen15m > 0 ? atrOpen15m : (metrics.atrOpen15m || 30.0);

  // 1. Isolate 1m bars from 09:30 AM ET onward
  const rthBars = m1Bars.filter((b) => {
    const et = getBarETParts(b.timestamp);
    const mins = et.hour * 60 + et.minute;
    return mins >= 9 * 60 + 30 && mins <= 10 * 60;
  });

  // Resolve current ET time
  let curHour = 9;
  let curMinute = 34;
  if (forcedTimeET) {
    curHour = forcedTimeET.hour;
    curMinute = forcedTimeET.minute;
  } else if (rthBars.length > 0) {
    const lastBarET = getBarETParts(rthBars[rthBars.length - 1].timestamp);
    curHour = lastBarET.hour;
    curMinute = lastBarET.minute;
  }
  const curTotalMins = curHour * 60 + curMinute;

  // 2. Compute 09:30–09:33 ET 3-minute Opening Range (ORH_3m, ORL_3m)
  const bars930to933 = rthBars.filter((b) => {
    const et = getBarETParts(b.timestamp);
    const m = et.hour * 60 + et.minute;
    return m >= 9 * 60 + 30 && m <= 9 * 60 + 33;
  });

  let orh3m = metrics.onh;
  let orl3m = metrics.onl;
  let initialImpulseRange = safeAtrOpen15m;
  if (bars930to933.length > 0) {
    orh3m = Math.max(...bars930to933.map((b) => b.high));
    orl3m = Math.min(...bars930to933.map((b) => b.low));
    initialImpulseRange = Math.max(5, orh3m - orl3m);
  }

  // Check Tier 1 News Blackout
  const blackoutCheck = checkTier1NewsBlackout(
    events,
    new Date(),
    propProfile?.newsBlackoutMinutes ?? 2
  );

  // Default direction determination from Layer 2 / HTF impulse
  let direction: "LONG" | "SHORT" = "SHORT";
  if (layer2) {
    direction = layer2.direction === "BULLISH" ? "LONG" : "SHORT";
  } else if (metrics.htfImpulseDirection) {
    direction = metrics.htfImpulseDirection === "BULLISH" ? "LONG" : "SHORT";
  }

  // 3. Phase A: 09:30–09:33 ET Observation Lock
  if (curTotalMins <= 9 * 60 + 33) {
    const stopPts = 14.0; // Scalper baseline stop (14 pts)
    const stopLoss = direction === "LONG" ? currentPrice - 14.0 : currentPrice + 14.0;
    const dummySizing = computeDetailedRiskPlan({
      entryPrice: currentPrice,
      stopPrice: stopLoss,
      instrument: "MNQ",
      propProfile
    });

    return {
      status: "OBSERVATION_LOCK",
      archetype: "OBSERVATION_FREEZE",
      direction,
      entryZone: {
        low: orl3m,
        high: orh3m,
        mid: Math.round(((orh3m + orl3m) / 2) * 100) / 100
      },
      stopLoss,
      stopPts,
      antiChaseWarning: false,
      tp1: {
        price: direction === "LONG" ? currentPrice + 14.0 : currentPrice - 14.0,
        distancePts: 14.0,
        hitProb5m: 0.65,
        hitProb10m: 0.80,
        hitProb15m: 0.88,
        rationale: "Scalp Target 1 (14 pts)"
      },
      tp2: {
        price: direction === "LONG" ? currentPrice + 26.0 : currentPrice - 26.0,
        distancePts: 26.0,
        hitProb5m: 0.40,
        hitProb10m: 0.60,
        hitProb15m: 0.72,
        rationale: "Scalp Runner (26 pts)"
      },
      htfDemotedLevels: [],
      killSwitchPrice: currentPrice,
      killSwitchMessage: "HANDS OFF MOUSE (09:30–09:33 ET). Observe initial impulse, spread expansion, and track ORH_3m / ORL_3m.",
      contracts: dummySizing.suggestedContracts,
      contractSplitDirective: "OBSERVATION PHASE: No orders permitted during 09:30–09:33 ET opening noise.",
      netRR: dummySizing.netRR,
      netTargetDollars: dummySizing.netTargetDollars,
      netRiskDollars: dummySizing.netRiskDollars,
      orh3m,
      orl3m,
      initialImpulseRange,
      propProfile,
      newsBlackoutWarning: blackoutCheck.hasBlackoutAlarm ? blackoutCheck.alarmMessage : undefined
    };
  }

  // 4. Phase B: 09:34–09:50 ET Active Execution Window
  // Isolate bars strictly after 09:33 ET for LTF execution & sweep detection
  const post933Bars = rthBars.filter((b) => {
    const et = getBarETParts(b.timestamp);
    const m = et.hour * 60 + et.minute;
    return m > 9 * 60 + 33;
  });
  const atr1mPost933 =
    post933Bars.length > 0
      ? post933Bars.reduce((sum, b) => sum + (b.high - b.low), 0) / post933Bars.length
      : safeAtrOpen15m / 8;

  const stopBuffer = Math.max(3.0, Math.round(0.25 * atr1mPost933 * 10) / 10);

  // Detect Setup Archetypes:
  // a) Sweep + MSS Reversal Check in post-09:33 bars
  let isSweepMssReversal = false;
  let sweepLevel = 0;
  let sweepExtreme = 0;

  // Bullish Sweep + MSS Reversal: Sweeps ORL 3m (or ONL if not already broken) then displaces above
  const sweptLowBar = post933Bars.find((b) => b.low < orl3m || (orl3m >= metrics.onl && b.low < metrics.onl));
  if (sweptLowBar) {
    const sweepLvl = sweptLowBar.low < orl3m ? orl3m : metrics.onl;
    const sweepIdx = post933Bars.indexOf(sweptLowBar);
    const subsequentBars = post933Bars.slice(sweepIdx);
    const lowestLow = Math.min(...subsequentBars.map((b) => b.low));
    // Bullish displacement: closing back above the swept level
    const displacement = subsequentBars.find(
      (b) => b.close > sweepLvl && b.close > b.open
    );
    if (displacement) {
      isSweepMssReversal = true;
      direction = "LONG";
      sweepLevel = sweepLvl;
      sweepExtreme = lowestLow;
    }
  }

  // Bearish Sweep + MSS Reversal: Sweeps ORH 3m (or ONH if not already broken) then displaces below
  if (!isSweepMssReversal) {
    const sweptHighBar = post933Bars.find((b) => b.high > orh3m || (orh3m <= metrics.onh && b.high > metrics.onh));
    if (sweptHighBar) {
      const sweepLvl = sweptHighBar.high > orh3m ? orh3m : metrics.onh;
      const sweepIdx = post933Bars.indexOf(sweptHighBar);
      const subsequentBars = post933Bars.slice(sweepIdx);
      const highestHigh = Math.max(...subsequentBars.map((b) => b.high));
      // Bearish displacement: closing back below the swept level
      const displacement = subsequentBars.find(
        (b) => b.close < sweepLvl && b.close < b.open
      );
      if (displacement) {
        isSweepMssReversal = true;
        direction = "SHORT";
        sweepLevel = sweepLvl;
        sweepExtreme = highestHigh;
      }
    }
  }

  let archetype: LTFTradeCard["archetype"] = isSweepMssReversal ? "SWEEP_MSS_REVERSAL" : "RETRACE_CONTINUATION";
  let entryZone = { low: 0, high: 0, mid: 0 };
  let stopLoss = 0;
  let stopPts = 14.0;

  if (archetype === "SWEEP_MSS_REVERSAL") {
    if (direction === "SHORT") {
      entryZone = {
        low: Math.round((sweepLevel - 2.5) * 100) / 100,
        high: Math.round((sweepLevel + 1.5) * 100) / 100,
        mid: Math.round(sweepLevel * 100) / 100
      };
      const rawDist = Math.abs(sweepExtreme + stopBuffer - entryZone.mid);
      stopPts = Math.max(10.0, Math.min(18.0, Math.round(rawDist * 10) / 10));
      stopLoss = Math.round((entryZone.mid + stopPts) * 100) / 100;
    } else {
      entryZone = {
        low: Math.round((sweepLevel - 1.5) * 100) / 100,
        high: Math.round((sweepLevel + 2.5) * 100) / 100,
        mid: Math.round(sweepLevel * 100) / 100
      };
      const rawDist = Math.abs(entryZone.mid - (sweepExtreme - stopBuffer));
      stopPts = Math.max(10.0, Math.min(18.0, Math.round(rawDist * 10) / 10));
      stopLoss = Math.round((entryZone.mid - stopPts) * 100) / 100;
    }
  } else {
    // Retrace Continuation: 40%–50% impulse retrace zone
    const impulseHigh = Math.max(...bars930to933.map((b) => b.high));
    const impulseLow = Math.min(...bars930to933.map((b) => b.low));
    const impulseRange = Math.max(8.0, impulseHigh - impulseLow);

    if (direction === "SHORT") {
      const retrace40 = impulseLow + 0.40 * impulseRange;
      const retrace50 = impulseLow + 0.50 * impulseRange;
      entryZone = {
        low: Math.round(Math.min(retrace40, retrace50) * 100) / 100,
        high: Math.round(Math.max(retrace40, retrace50) * 100) / 100,
        mid: Math.round(((retrace40 + retrace50) / 2) * 100) / 100
      };

      // 1m structural micro-swing stop bounded strictly to [10.0, 18.0] pts for scalpers
      const recentBars = post933Bars.slice(-3);
      const localHigh = recentBars.length > 0 ? Math.max(...recentBars.map((b) => b.high)) : entryZone.mid + 12;
      const rawDist = Math.abs(localHigh + stopBuffer - entryZone.mid);
      stopPts = Math.max(10.0, Math.min(18.0, Math.round(rawDist * 10) / 10));
      stopLoss = Math.round((entryZone.mid + stopPts) * 100) / 100;
    } else {
      const retrace40 = impulseHigh - 0.40 * impulseRange;
      const retrace50 = impulseHigh - 0.50 * impulseRange;
      entryZone = {
        low: Math.round(Math.min(retrace40, retrace50) * 100) / 100,
        high: Math.round(Math.max(retrace40, retrace50) * 100) / 100,
        mid: Math.round(((retrace40 + retrace50) / 2) * 100) / 100
      };

      // 1m structural micro-swing stop bounded strictly to [10.0, 18.0] pts for scalpers
      const recentBars = post933Bars.slice(-3);
      const localLow = recentBars.length > 0 ? Math.min(...recentBars.map((b) => b.low)) : entryZone.mid - 12;
      const rawDist = Math.abs(entryZone.mid - (localLow - stopBuffer));
      stopPts = Math.max(10.0, Math.min(18.0, Math.round(rawDist * 10) / 10));
      stopLoss = Math.round((entryZone.mid - stopPts) * 100) / 100;
    }
  }

  // 5. Anti-Chase Gate (Flag when price runs away > 15-20 pts from limit entry)
  const liveDistFromEntry = Math.abs(currentPrice - entryZone.mid);
  const chaseThreshold = Math.max(12.0, Math.min(20.0, 0.25 * safeAtrOpen15m));
  const antiChaseWarning =
    archetype === "SWEEP_MSS_REVERSAL"
      ? false
      : (direction === "LONG" ? currentPrice > entryZone.high + 5.0 : currentPrice < entryZone.low - 5.0) &&
        liveDistFromEntry > chaseThreshold;
  const antiChaseMessage = antiChaseWarning
    ? `ANTI-CHASE GATE TRIGGERED: Live price (${currentPrice.toFixed(2)}) is ${liveDistFromEntry.toFixed(1)} pts away from entry zone mid (${entryZone.mid.toFixed(2)}). DO NOT chase market orders! Set limit order inside [${entryZone.low.toFixed(1)} – ${entryZone.high.toFixed(1)}].`
    : undefined;

  // 6. Reachability Target Engine (TP1 & TP2 & HTF Demotion)
  // CRITICAL: Anchor candidate distances to entryZone.mid (the limit execution benchmark), NOT fluctuating currentPrice
  const entryRefPrice = entryZone.mid;
  const minTP1Dist = Math.min(10.0, 0.25 * safeAtrOpen15m);
  const maxTP1Dist = Math.min(18.0, 0.45 * safeAtrOpen15m);
  const minTP2Dist = Math.min(20.0, 0.50 * safeAtrOpen15m);
  const maxTP2Dist = Math.min(35.0, 0.75 * safeAtrOpen15m);
  const htfDemoteDist = Math.min(35.0, 0.75 * safeAtrOpen15m);

  // Candidate levels
  const candidates: Array<{ name: string; price: number; distance: number }> = [];
  if (orh3m) candidates.push({ name: "ORH 3m", price: orh3m, distance: Math.abs(orh3m - entryRefPrice) });
  if (orl3m) candidates.push({ name: "ORL 3m", price: orl3m, distance: Math.abs(orl3m - entryRefPrice) });
  if (metrics.sessionVwap) candidates.push({ name: "Session VWAP", price: metrics.sessionVwap, distance: Math.abs(metrics.sessionVwap - entryRefPrice) });
  if (metrics.onMid) candidates.push({ name: "ON Mid", price: metrics.onMid, distance: Math.abs(metrics.onMid - entryRefPrice) });
  if (metrics.priorDayPoc) candidates.push({ name: "Prior POC", price: metrics.priorDayPoc, distance: Math.abs(metrics.priorDayPoc - entryRefPrice) });

  for (const kl of keyLevels) {
    if (!candidates.some((c) => Math.abs(c.price - kl.price) < 2.0)) {
      candidates.push({ name: kl.shortName || kl.name, price: kl.price, distance: Math.abs(kl.price - entryRefPrice) });
    }
  }

  // Filter in direction of trade
  const directionalCandidates = candidates.filter((c) => {
    return direction === "LONG" ? c.price > entryRefPrice : c.price < entryRefPrice;
  });

  // Select TP1 (Tight 1:1 Scalp inside [minTP1Dist, maxTP1Dist])
  const defaultTp1Dist = Math.max(minTP1Dist, Math.min(maxTP1Dist, Math.round(1.0 * stopPts * 10) / 10));
  const tp1Candidates = directionalCandidates.filter((c) => c.distance >= minTP1Dist && c.distance <= maxTP1Dist);
  let tp1Dist = defaultTp1Dist;
  let tp1Price = direction === "LONG" ? entryRefPrice + tp1Dist : entryRefPrice - tp1Dist;
  let tp1Rationale = `Quick 1:1 Scalp Target (+${tp1Dist.toFixed(1)} pts)`;

  if (tp1Candidates.length > 0) {
    tp1Candidates.sort((a, b) => Math.abs(a.distance - defaultTp1Dist) - Math.abs(b.distance - defaultTp1Dist));
    tp1Price = tp1Candidates[0].price;
    tp1Dist = tp1Candidates[0].distance;
    tp1Rationale = `${tp1Candidates[0].name} (+${tp1Dist.toFixed(1)} pts)`;
  }

  // Select TP2 (Scalp Extension / Runner inside [minTP2Dist, maxTP2Dist])
  const defaultTp2Dist = Math.max(minTP2Dist, Math.min(maxTP2Dist, Math.round(1.8 * stopPts * 10) / 10));
  const tp2Candidates = directionalCandidates.filter((c) => c.distance >= minTP2Dist && c.distance <= maxTP2Dist);
  let tp2Dist = defaultTp2Dist;
  let tp2Price = direction === "LONG" ? entryRefPrice + tp2Dist : entryRefPrice - tp2Dist;
  let tp2Rationale = `Scalp Runner Extension (+${tp2Dist.toFixed(1)} pts)`;

  if (tp2Candidates.length > 0) {
    tp2Candidates.sort((a, b) => Math.abs(a.distance - defaultTp2Dist) - Math.abs(b.distance - defaultTp2Dist));
    tp2Price = tp2Candidates[0].price;
    tp2Dist = tp2Candidates[0].distance;
    tp2Rationale = `${tp2Candidates[0].name} (+${tp2Dist.toFixed(1)} pts)`;
  }

  // Intraday Unrealized Drawdown Cap on TP2
  if (propProfile?.drawdownMode === "INTRADAY_UNREALIZED") {
    const maxAllowedTp2Dist = Math.round(1.8 * stopPts * 10) / 10;
    if (tp2Dist > maxAllowedTp2Dist) {
      tp2Dist = maxAllowedTp2Dist;
      tp2Price = direction === "LONG" ? entryZone.mid + tp2Dist : entryZone.mid - tp2Dist;
      tp2Rationale = `Capped at 1.8R (${tp2Dist.toFixed(1)} pts) - Intraday Unrealized Mode`;
    }
  }

  const tp1: ReachabilityTarget = {
    price: Math.round(tp1Price * 100) / 100,
    distancePts: Math.round(tp1Dist * 100) / 100,
    hitProb5m: computeBrownianTouchProbability(tp1Dist, 5, safeAtrOpen15m),
    hitProb10m: computeBrownianTouchProbability(tp1Dist, 10, safeAtrOpen15m),
    hitProb15m: computeBrownianTouchProbability(tp1Dist, 15, safeAtrOpen15m),
    rationale: tp1Rationale
  };

  const tp2: ReachabilityTarget = {
    price: Math.round(tp2Price * 100) / 100,
    distancePts: Math.round(tp2Dist * 100) / 100,
    hitProb5m: computeBrownianTouchProbability(tp2Dist, 5, safeAtrOpen15m),
    hitProb10m: computeBrownianTouchProbability(tp2Dist, 10, safeAtrOpen15m),
    hitProb15m: computeBrownianTouchProbability(tp2Dist, 15, safeAtrOpen15m),
    rationale: tp2Rationale
  };

  // HTF Demoted Levels (distance > 35 pts — Demoted so they never masquerade as scalp targets)
  const htfDemotedLevels: HTFDemotedLevel[] = directionalCandidates
    .filter((c) => c.distance > htfDemoteDist)
    .map((c) => {
      const prob10m = computeBrownianTouchProbability(c.distance, 10, safeAtrOpen15m);
      return {
        name: c.name,
        price: Math.round(c.price * 100) / 100,
        distancePts: Math.round(c.distance * 100) / 100,
        hitProb10m: prob10m,
        badge: `Distant HTF Pivot (> 35 pts) — Not a Scalp Target (${(prob10m * 100).toFixed(0)}% 10m Hit Prob)`
      };
    })
    .sort((a, b) => a.distancePts - b.distancePts);

  // 7. 1m MSS Exit / Kill-Switch Price
  let killSwitchPrice = entryZone.mid;
  let killSwitchMessage = `1m MSS Kill-Switch at ${killSwitchPrice.toFixed(2)}. If trade reaches >= 0.8R MFE and an opposing 1m candle closes back across entry, flatten immediately.`;

  if (propProfile?.drawdownMode === "INTRADAY_UNREALIZED") {
    // Under Intraday Unrealized Trailing mode, protect profit once reached:
    killSwitchPrice =
      direction === "LONG"
        ? Math.round((entryZone.mid + 0.3 * stopPts) * 100) / 100
        : Math.round((entryZone.mid - 0.3 * stopPts) * 100) / 100;
    killSwitchMessage = `1m MSS Kill-Switch at ${killSwitchPrice.toFixed(2)}. In Intraday Unrealized trailing mode, locks +0.3R profit to defend against phantom drawdown once trade advances.`;
  }

  // 8. Contract Sizing & Quantization
  const riskPlan = computeDetailedRiskPlan({
    entryPrice: entryZone.mid,
    stopPrice: stopLoss,
    targetPrice: tp1.price,
    instrument: "MNQ",
    propProfile
  });

  // If contracts quantize to 0, status transitions to STAND_ASIDE to prevent phantom execution
  let status: LTFTradeCard["status"] =
    archetype === "SWEEP_MSS_REVERSAL" ? "ARMED_SWEEP_REVERSAL" : antiChaseWarning ? "STAND_ASIDE" : "ARMED_RETRACE";
  if (riskPlan.suggestedContracts === 0) {
    status = "STAND_ASIDE";
  }

  return {
    status,
    archetype,
    direction,
    entryZone,
    stopLoss,
    stopPts,
    antiChaseWarning,
    antiChaseMessage,
    tp1,
    tp2,
    htfDemotedLevels,
    killSwitchPrice,
    killSwitchMessage,
    contracts: riskPlan.suggestedContracts,
    contractSplitDirective: riskPlan.contractSplitDirective,
    netRR: riskPlan.netRR,
    netTargetDollars: riskPlan.netTargetDollars,
    netRiskDollars: riskPlan.netRiskDollars,
    orh3m,
    orl3m,
    initialImpulseRange,
    propProfile,
    phantomDrawdownWarning: riskPlan.phantomDrawdownWarning,
    consistencyCapWarning: riskPlan.consistencyCapWarning,
    newsBlackoutWarning: blackoutCheck.hasBlackoutAlarm ? blackoutCheck.alarmMessage : undefined
  };
}
