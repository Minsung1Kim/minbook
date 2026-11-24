import { OHLCVBar } from "@/types/market";

/**
 * Garman-Klass annualized realized volatility estimator.
 * Uses High, Low, Open, Close to achieve ~5x-8x greater statistical efficiency than Close-to-Close.
 */
export function computeGarmanKlassVol(bars: OHLCVBar[]): number {
  if (!bars || bars.length < 2) return 20.0;

  let sum = 0;
  let count = 0;
  const factor = 2 * Math.LN2 - 1; // ~0.386294

  for (const b of bars) {
    if (b.high <= 0 || b.low <= 0 || b.open <= 0 || b.close <= 0) continue;
    if (b.high < b.low) continue;

    const logHL = Math.log(b.high / b.low);
    const logCO = Math.log(b.close / b.open);

    const term = 0.5 * (logHL * logHL) - factor * (logCO * logCO);
    sum += term;
    count++;
  }

  if (count < 2) return 20.0;
  const variance = sum / count;
  const annualized = Math.sqrt(252 * Math.max(0, variance)) * 100;
  return Math.round(annualized * 100) / 100;
}

/**
 * Yang-Zhang annualized realized volatility estimator.
 * Robust to overnight price jumps and continuous intraday drift with minimum variance weighting.
 */
export function computeYangZhangVol(bars: OHLCVBar[]): number {
  if (!bars || bars.length < 3) return 22.0;

  const n = bars.length;
  const k = 0.34 / (1.34 + (n + 1) / (n - 1));

  // 1. Overnight jump variance (open relative to previous close)
  const overnightLogReturns: number[] = [];
  for (let i = 1; i < n; i++) {
    const prevC = bars[i - 1].close;
    const currO = bars[i].open;
    if (prevC > 0 && currO > 0) {
      overnightLogReturns.push(Math.log(currO / prevC));
    }
  }

  let meanO = 0;
  if (overnightLogReturns.length > 0) {
    meanO = overnightLogReturns.reduce((acc, v) => acc + v, 0) / overnightLogReturns.length;
  }
  let varO = 0;
  if (overnightLogReturns.length > 1) {
    varO =
      overnightLogReturns.reduce((acc, v) => acc + Math.pow(v - meanO, 2), 0) /
      (overnightLogReturns.length - 1);
  }

  // 2. Open-to-close drift variance
  const openToCloseReturns: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = bars[i].open;
    const c = bars[i].close;
    if (o > 0 && c > 0) {
      openToCloseReturns.push(Math.log(c / o));
    }
  }

  let meanC = 0;
  if (openToCloseReturns.length > 0) {
    meanC = openToCloseReturns.reduce((acc, v) => acc + v, 0) / openToCloseReturns.length;
  }
  let varC = 0;
  if (openToCloseReturns.length > 1) {
    varC =
      openToCloseReturns.reduce((acc, v) => acc + Math.pow(v - meanC, 2), 0) /
      (openToCloseReturns.length - 1);
  }

  // 3. Rogers-Satchell variance (intraday price movement)
  let sumRS = 0;
  let countRS = 0;
  for (const b of bars) {
    if (b.high <= 0 || b.low <= 0 || b.open <= 0 || b.close <= 0) continue;
    const u = Math.log(b.high / b.close);
    const d = Math.log(b.high / b.open);
    const l = Math.log(b.low / b.close);
    const m = Math.log(b.low / b.open);
    sumRS += u * d + l * m;
    countRS++;
  }
  const varRS = countRS > 0 ? sumRS / countRS : 0;

  // 4. Yang-Zhang total variance
  const totalVariance = varO + k * varC + (1 - k) * varRS;
  const annualized = Math.sqrt(252 * Math.max(0, totalVariance)) * 100;
  return Math.round(annualized * 100) / 100;
}

/**
 * Computes rolling Pearson correlation between daily percentage returns of two series.
 */
export function computePearsonCorrelation(seriesA: number[], seriesB: number[]): number {
  if (!seriesA || !seriesB || seriesA.length < 5 || seriesB.length < 5) return 0;

  const minLen = Math.min(seriesA.length, seriesB.length);
  const a = seriesA.slice(-minLen);
  const b = seriesB.slice(-minLen);

  // Convert to daily returns
  const returnsA: number[] = [];
  const returnsB: number[] = [];

  for (let i = 1; i < minLen; i++) {
    if (a[i - 1] !== 0 && b[i - 1] !== 0) {
      returnsA.push((a[i] - a[i - 1]) / a[i - 1]);
      returnsB.push((b[i] - b[i - 1]) / b[i - 1]);
    }
  }

  const n = returnsA.length;
  if (n < 4) return 0;

  const meanA = returnsA.reduce((sum, v) => sum + v, 0) / n;
  const meanB = returnsB.reduce((sum, v) => sum + v, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;

  for (let i = 0; i < n; i++) {
    const diffA = returnsA[i] - meanA;
    const diffB = returnsB[i] - meanB;
    num += diffA * diffB;
    denA += diffA * diffA;
    denB += diffB * diffB;
  }

  const denom = Math.sqrt(denA * denB);
  if (denom === 0) return 0;

  const r = num / denom;
  return Math.round(Math.max(-1, Math.min(1, r)) * 100) / 100;
}

export interface HTFFibonacciResult {
  impulseDirection: "BULLISH" | "BEARISH";
  swingHigh: number;
  swingLow: number;
  range: number;
  fib382: number;
  fib500: number;
  fib618: number;
  fib705: number; // Optimal Trade Entry (OTE)
  impulseHighDate: string;
  impulseLowDate: string;
}

/**
 * Computes Higher-Timeframe (HTF) Fibonacci Retracement levels from trailing daily bars.
 * Crucially compares bar timestamps to establish genuine impulse direction:
 * - If Low occurred BEFORE High: Bullish Impulse (retrace pulls DOWN into discount).
 * - If High occurred BEFORE Low: Bearish Impulse (retrace bounces UP into premium).
 */
export function computeHTFFibonacci(dailyBars: OHLCVBar[]): HTFFibonacciResult {
  const lookback = dailyBars.slice(-5);
  if (lookback.length === 0) {
    return {
      impulseDirection: "BULLISH",
      swingHigh: 21200,
      swingLow: 20800,
      range: 400,
      fib382: 21047.2,
      fib500: 21000,
      fib618: 20952.8,
      fib705: 20918,
      impulseHighDate: "",
      impulseLowDate: ""
    };
  }

  let maxHigh = -Infinity;
  let maxHighIdx = 0;
  let minLow = Infinity;
  let minLowIdx = 0;

  for (let i = 0; i < lookback.length; i++) {
    const b = lookback[i];
    if (b.high > maxHigh) {
      maxHigh = b.high;
      maxHighIdx = i;
    }
    if (b.low < minLow) {
      minLow = b.low;
      minLowIdx = i;
    }
  }

  const swingHigh = Math.round(maxHigh * 100) / 100;
  const swingLow = Math.round(minLow * 100) / 100;
  const range = Math.round((swingHigh - swingLow) * 100) / 100;

  const highTime = new Date(lookback[maxHighIdx].timestamp).getTime();
  const lowTime = new Date(lookback[minLowIdx].timestamp).getTime();

  let impulseDirection: "BULLISH" | "BEARISH";
  if (lowTime < highTime) {
    impulseDirection = "BULLISH";
  } else if (highTime < lowTime) {
    impulseDirection = "BEARISH";
  } else {
    // Same day bar or identical timestamp: check close vs open of the bar
    impulseDirection = lookback[maxHighIdx].close >= lookback[maxHighIdx].open ? "BULLISH" : "BEARISH";
  }

  let fib382: number;
  let fib500: number;
  let fib618: number;
  let fib705: number;

  if (impulseDirection === "BULLISH") {
    // Pulling down from swingHigh into discount
    fib382 = Math.round((swingHigh - 0.382 * range) * 100) / 100;
    fib500 = Math.round((swingHigh - 0.500 * range) * 100) / 100;
    fib618 = Math.round((swingHigh - 0.618 * range) * 100) / 100;
    fib705 = Math.round((swingHigh - 0.705 * range) * 100) / 100;
  } else {
    // Bouncing up from swingLow into premium
    fib382 = Math.round((swingLow + 0.382 * range) * 100) / 100;
    fib500 = Math.round((swingLow + 0.500 * range) * 100) / 100;
    fib618 = Math.round((swingLow + 0.618 * range) * 100) / 100;
    fib705 = Math.round((swingLow + 0.705 * range) * 100) / 100;
  }

  return {
    impulseDirection,
    swingHigh,
    swingLow,
    range,
    fib382,
    fib500,
    fib618,
    fib705,
    impulseHighDate: lookback[maxHighIdx].timestamp,
    impulseLowDate: lookback[minLowIdx].timestamp
  };
}

export interface ExpectedMoveResult {
  expectedMove1SD: number;
  expectedMoveStraddle: number;
  upper1SD: number;
  lower1SD: number;
  upperStraddle: number;
  lowerStraddle: number;
  straddleCoveragePercent: number; // 57.5
  coverageLabel: string; // "~57.5% Normal Coverage (0.7979 SD)"
  volSource: string; // "VOLQ" | "VXN" | "VIX" | "FALLBACK"
  volatilityUsed: number;
  annualizationDays: 365;
}

export interface ExpectedMoveOptions {
  volq?: number;
  vix1d?: number;
}

/**
 * Computes daily expected move bands using Cboe calendar-annualized volatility (sqrt(365))
 * and Expected Straddle proxy.
 * Expected Move (1-SD) = PDC * (IV / 100) / sqrt(365)
 * Expected Straddle Move = ExpectedMove1SD * sqrt(2 / PI) (~0.79788x)
 * Label coverage honestly (~57.5% Normal distribution coverage, 2*Phi(0.7979)-1), never 68%.
 */
export function computeExpectedMove(
  pdc: number,
  ivPct: number,
  options?: ExpectedMoveOptions
): ExpectedMoveResult {
  let effectiveIv = ivPct > 0 ? ivPct : 20;
  let volSource = "VXN";

  if (options?.volq && options.volq > 0) {
    effectiveIv = options.volq;
    volSource = "VOLQ";
  } else if (options?.vix1d && options.vix1d > 0) {
    // If VIX1D is available, provide context note
    volSource = "VIX1D_AWARE";
  }

  // Divide Cboe 30-day calendar-annualized volatility by sqrt(365), never sqrt(252)
  const expectedMove1SD = Math.round(((pdc * (effectiveIv / 100)) / Math.sqrt(365)) * 100) / 100;
  const straddleRatio = Math.sqrt(2 / Math.PI); // ~0.79788456
  const expectedMoveStraddle = Math.round(expectedMove1SD * straddleRatio * 100) / 100;

  return {
    expectedMove1SD,
    expectedMoveStraddle,
    upper1SD: Math.round((pdc + expectedMove1SD) * 100) / 100,
    lower1SD: Math.round((pdc - expectedMove1SD) * 100) / 100,
    upperStraddle: Math.round((pdc + expectedMoveStraddle) * 100) / 100,
    lowerStraddle: Math.round((pdc - expectedMoveStraddle) * 100) / 100,
    straddleCoveragePercent: 57.5,
    coverageLabel: "~57.5% Normal Coverage (0.7979 SD)",
    volSource,
    volatilityUsed: effectiveIv,
    annualizationDays: 365
  };
}

/**
 * Computes annualized realized volatility from 5-minute intraday bars.
 * 78 bars per 6.5h RTH session * 252 trading days = 19,656 bars/year.
 */
export function computeIntradayRealizedVol5m(
  bars5m: OHLCVBar[],
  barsPerDay: number = 78
): number {
  if (!bars5m || bars5m.length < 5) return 22.0;

  const logReturns: number[] = [];
  for (let i = 1; i < bars5m.length; i++) {
    const prevC = bars5m[i - 1].close;
    const curC = bars5m[i].close;
    if (prevC > 0 && curC > 0) {
      logReturns.push(Math.log(curC / prevC));
    }
  }

  const n = logReturns.length;
  if (n < 4) return 22.0;

  const mean = logReturns.reduce((acc, r) => acc + r, 0) / n;
  const variance =
    logReturns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / (n - 1);

  // Annualize: variance * (barsPerDay * 252)
  const annualizedVar = variance * barsPerDay * 252;
  const annualizedVol = Math.sqrt(Math.max(0, annualizedVar)) * 100;
  return Math.round(annualizedVol * 100) / 100;
}

export interface DimensionlessVRPResult {
  vrpRatio: number; // IV / RV (dimensionless ratio, e.g. 1.15)
  isNegativeVrp: boolean; // RV > IV (ratio < 1.0, tail risk / stop-run dislocation)
  iv: number;
  rv: number;
  interpretation: string;
}

/**
 * Computes Variance Risk Premium in dimensionless ratio form (IV / RV)
 * using intraday realized volatility rather than linear point subtraction.
 * When IV / RV < 1.0 => RV exceeds IV (tail risk underpriced, negative VRP).
 */
export function computeDimensionlessVRP(
  iv: number,
  rv: number
): DimensionlessVRPResult {
  const safeIv = Math.max(0.1, iv);
  const safeRv = Math.max(0.1, rv);
  const vrpRatio = Math.round((safeIv / safeRv) * 100) / 100;
  const isNegativeVrp = vrpRatio < 1.0;

  const interpretation = isNegativeVrp
    ? `NEGATIVE VRP (Ratio: ${vrpRatio.toFixed(2)} < 1.00): Realized Vol (${safeRv.toFixed(1)}%) exceeds Implied Vol (${safeIv.toFixed(1)}%). Options underprice tail moves; stop-run / dislocation risk elevated.`
    : `POSITIVE VRP (Ratio: ${vrpRatio.toFixed(2)} >= 1.00): Implied Vol (${safeIv.toFixed(1)}%) carries a premium over Realized Vol (${safeRv.toFixed(1)}%). Normal volatility cushion active.`;

  return {
    vrpRatio,
    isNegativeVrp,
    iv: safeIv,
    rv: safeRv,
    interpretation
  };
}

export interface DirectionalMaeMfeResult {
  maeR: number;
  mfeR: number;
  actualPnlR: number;
  exitEfficiencyPercent: number;
}

/**
 * Computes directional MAE (adverse drawdown heat) and MFE (peak favorable open profit)
 * in R-multiples for both LONG and SHORT trades.
 */
export function computeDirectionalMaeMfe(
  direction: "LONG" | "SHORT",
  entryPrice: number,
  stopPrice: number,
  exitPrice: number,
  worstPrice?: number,
  bestPrice?: number
): DirectionalMaeMfeResult {
  const riskPts = Math.abs(entryPrice - stopPrice);
  if (riskPts <= 0) {
    return { maeR: 0, mfeR: 0, actualPnlR: 0, exitEfficiencyPercent: 0 };
  }

  let actualPts: number;
  let maePts: number;
  let mfePts: number;

  if (direction === "LONG") {
    actualPts = exitPrice - entryPrice;
    const worst = worstPrice !== undefined ? worstPrice : Math.min(entryPrice, exitPrice);
    const best = bestPrice !== undefined ? bestPrice : Math.max(entryPrice, exitPrice);
    maePts = Math.max(0, entryPrice - worst);
    mfePts = Math.max(0, best - entryPrice);
  } else {
    // SHORT
    actualPts = entryPrice - exitPrice;
    const worst = worstPrice !== undefined ? worstPrice : Math.max(entryPrice, exitPrice);
    const best = bestPrice !== undefined ? bestPrice : Math.min(entryPrice, exitPrice);
    maePts = Math.max(0, worst - entryPrice);
    mfePts = Math.max(0, entryPrice - best);
  }

  const actualPnlR = Math.round((actualPts / riskPts) * 100) / 100;
  const maeR = Math.round((maePts / riskPts) * 100) / 100;
  const mfeR = Math.round((mfePts / riskPts) * 100) / 100;

  // Exit efficiency for winning trades: how much of peak MFE was realized upon exit
  let exitEfficiencyPercent = 0;
  if (actualPnlR > 0 && mfeR > 0) {
    exitEfficiencyPercent = Math.min(100, Math.round((actualPnlR / mfeR) * 1000) / 10);
  }

  return {
    maeR,
    mfeR,
    actualPnlR,
    exitEfficiencyPercent
  };
}
