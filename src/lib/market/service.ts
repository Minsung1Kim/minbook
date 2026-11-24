import { getMarketDataProvider } from "./factory";
import { SeedFallbackProvider } from "./fallback";
import { getCached, setCached, invalidateCache } from "./cache";
import { computeSessionLevels } from "./levels";
import { evaluateBiasAndRegime } from "./regime";
import { generateTacticalPlaybook } from "./playbook";
import { getCMESessionInfo, getETParts } from "./sessionClock";
import { getMarketGEX } from "./gex";
import { fetch1mBars, buildFootprintSummary } from "./footprint";
import { getCalibrationRepository } from "@/lib/calibration/store";
import { freezePredictionSnapshot, gradePendingPredictions } from "@/lib/calibration/grader";
import { OpenBriefData, GEXExposureData, FootprintSummary } from "@/types/market";
import { saveDailyBrief } from "@/lib/db";

export async function getOpenBrief(options?: {
  symbol?: "NQ" | "MNQ";
  forceRefresh?: boolean;
}): Promise<OpenBriefData> {
  const symbol = options?.symbol || "NQ";
  const cacheKey = `brief_${symbol}`;

  if (options?.forceRefresh) {
    invalidateCache(cacheKey);
  } else {
    const cached = getCached<OpenBriefData>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const provider = getMarketDataProvider();
  const fallbackProvider = new SeedFallbackProvider();

  let quote;
  let dailyBars = [];
  let intradayBars = [];
  let macro;
  let events = [];
  let providerUsed = provider.name;
  let providerNotice = "";

  try {
    const [quoteRes, dailyRes, intradayRes, macroRes, eventsRes] = await Promise.all([
      provider.getQuote(symbol),
      provider.getDailyBars(symbol, 30),
      provider.getIntradayBars(symbol, "15m"),
      provider.getMacroData(),
      provider.getEconomicEvents()
    ]);

    quote = quoteRes;
    dailyBars = dailyRes;
    intradayBars = intradayRes;
    macro = macroRes;
    events = eventsRes;
    providerNotice = `Real market data provided via ${provider.name}. Rate-limit protected via server cache.`;
  } catch (err: any) {
    console.warn(`Primary provider ${provider.name} failed:`, err?.message || err);
    quote = await fallbackProvider.getQuote(symbol);
    dailyBars = await fallbackProvider.getDailyBars(symbol, 30);
    intradayBars = await fallbackProvider.getIntradayBars(symbol, "15m");
    macro = await fallbackProvider.getMacroData();
    events = await fallbackProvider.getEconomicEvents();
    providerUsed = fallbackProvider.name;
    providerNotice = "Notice: Live feed temporarily unreachable or rate-limited. Structured demo session data loaded.";
  }

  // CME Futures Centralized Session Clock (5:00 PM / 6:00 PM ET Rollover)
  const sessionInfo = getCMESessionInfo();
  const targetTradeDate = sessionInfo.targetTradeDate;

  // Implied Volatility for Rule of 16 Expected Move
  const ivPct = macro.volatilitySurface?.vxn || macro.vix?.value || 24.0;

  // Compute session levels with SMT divergence, expected move, and target trade date anchoring
  const { sessionMetrics, keyLevels } = computeSessionLevels(
    quote.price,
    dailyBars,
    intradayBars,
    ivPct,
    macro.esData,
    targetTradeDate
  );

  // Free Delayed GEX Engine & Free 1m-Derived Footprint Proxy
  let gex: GEXExposureData | undefined;
  let footprint: FootprintSummary | undefined;

  try {
    const [gexRes, m1Bars] = await Promise.all([
      getMarketGEX(quote.price, ivPct, options?.forceRefresh),
      fetch1mBars(symbol === "MNQ" ? "MNQ=F" : "NQ=F")
    ]);
    gex = gexRes;
    footprint = buildFootprintSummary(intradayBars, m1Bars, 900, keyLevels, sessionMetrics);
  } catch (err: any) {
    console.warn("GEX / Footprint module warning:", err?.message || err);
  }

  // Check if red/orange folder news scheduled between 9:30 and 10:00 AM ET on target trade date
  const hasOpenNews = events.some(
    (e) =>
      (e.isNearOpenWindow || (e.alert && (e.timeET.includes("09:45") || e.timeET.includes("10:00")))) &&
      (e.date === targetTradeDate || !e.date)
  );

  // Evaluate bias & chop risk with full volatility surface, macro regime, and dealer GEX tilt
  const bias = evaluateBiasAndRegime(
    quote.price,
    sessionMetrics,
    macro.vix,
    hasOpenNews,
    macro.volatilitySurface,
    macro.macroRegime,
    gex
  );

  // Resolve calibrated model factor weights
  let activeFactorWeights: Record<string, number> | undefined = undefined;
  try {
    const calibRepo = getCalibrationRepository();
    const activeRec = await calibRepo.getActiveModelWeights();
    activeFactorWeights = activeRec.weights;
  } catch (err) {
    console.warn("Could not load active calibration weights:", err);
  }

  // Generate actionable tactical playbook & scenarios with calibrated factor weights, time-decay and delayed feed protection
  const tacticalPlan = generateTacticalPlaybook(quote.price, sessionMetrics, bias, {
    isDelayed: quote.status === "DELAYED",
    qqqProxyQuote: macro.qqqProxyQuote,
    economicEvents: events,
    sessionInfo,
    factorWeights: activeFactorWeights,
    intradayBars,
    keyLevels
  });

  const ttlSeconds = parseInt(process.env.CACHE_TTL_SECONDS || "10", 10);
  const cacheExpiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const briefData: OpenBriefData = {
    tradeDate: targetTradeDate,
    targetTradeDate,
    priorTradeDate: sessionInfo.priorTradeDate,
    sessionInfo,
    generatedAt: new Date().toISOString(),
    instrument: symbol,
    underlyingAsset: quote.symbol,
    quote,
    sessionMetrics,
    keyLevels,
    bias,
    tacticalPlan,
    macro: {
      vix: macro.vix,
      us10y: macro.us10y,
      dxy: macro.dxy,
      volatilitySurface: macro.volatilitySurface,
      macroRegime: macro.macroRegime,
      megaCaps: macro.megaCaps,
      events,
      dealerGammaTilt: gex
        ? {
            regime: `${gex.netGammaRegime} (Flip: ${gex.gammaFlipNq} • CallWall: ${gex.callWallNq})`,
            source: "DERIVED_HEURISTIC" as const,
            note: gex.disclaimer
          }
        : macro.dealerGammaTilt
    },
    dataSource: {
      providerName: providerUsed,
      quoteStatus: quote.status,
      levelsStatus: quote.status === "SAMPLE" ? "SAMPLE" : "DERIVED",
      lastUpdated: quote.timestamp,
      cacheExpiresAt,
      notice: providerNotice
    },
    intradayBars,
    gex,
    footprint,
    ltfTradeCard: tacticalPlan.ltfTradeCard
  };

  // Cache in-memory
  setCached(cacheKey, briefData, ttlSeconds);

  // Persist snapshot to SQLite daily_briefs asynchronously
  try {
    saveDailyBrief({
      tradeDate: targetTradeDate,
      symbol,
      data: briefData,
      notes: bias.summary,
      createdBy: "minbook-engine"
    });
  } catch (err) {
    console.error("Could not persist daily brief to SQLite:", err);
  }

  // Automatic Calibration Pipeline:
  // 1. Auto-freeze immutable pre-market prediction snapshot (09:15–10:00 ET)
  try {
    const etParts = getETParts(new Date());
    const timeMins = etParts.hour * 60 + etParts.minute;
    if (
      (sessionInfo.phase === "PRE_MARKET_LOCK" && timeMins >= 555) ||
      sessionInfo.phase === "NY_OPEN_WINDOW"
    ) {
      freezePredictionSnapshot(briefData).catch((e) =>
        console.warn("Auto-freeze prediction notice:", e?.message || e)
      );
    }
  } catch (err) {
    console.warn("Auto-freeze check error:", err);
  }

  // 2. Auto-grade pending sessions after 10:20 ET or during post-window / recap phases
  try {
    const etParts = getETParts(new Date());
    const timeMins = etParts.hour * 60 + etParts.minute;
    if (timeMins >= 620 || sessionInfo.phase === "POST_WINDOW_RECAP" || sessionInfo.phase === "CME_BREAK_OR_WEEKEND") {
      gradePendingPredictions().catch((e) =>
        console.warn("Auto-grade pending notice:", e?.message || e)
      );
    }
  } catch (err) {
    console.warn("Auto-grade check error:", err);
  }

  return briefData;
}
