import { getMarketDataProvider } from "./factory";
import { SeedFallbackProvider } from "./fallback";
import { getCached, setCached, invalidateCache } from "./cache";
import { computeSessionLevels } from "./levels";
import { evaluateBiasAndRegime } from "./regime";
import { computeSizingGuidance } from "./risk";
import { OpenBriefData } from "@/types/market";
import { saveDailyBrief } from "@/lib/db";

export async function getOpenBrief(options?: {
  symbol?: "NQ" | "MNQ";
  riskDollars?: number;
  targetDollars?: number;
  forceRefresh?: boolean;
}): Promise<OpenBriefData> {
  const symbol = options?.symbol || "NQ";
  const riskDollars = options?.riskDollars || 250;
  const targetDollars = options?.targetDollars || 550;
  const cacheKey = `brief_${symbol}_${riskDollars}_${targetDollars}`;

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
    // Graceful fallback to seed data
    quote = await fallbackProvider.getQuote(symbol);
    dailyBars = await fallbackProvider.getDailyBars(symbol, 30);
    intradayBars = await fallbackProvider.getIntradayBars(symbol, "15m");
    macro = await fallbackProvider.getMacroData();
    events = await fallbackProvider.getEconomicEvents();
    providerUsed = fallbackProvider.name;
    providerNotice = "Notice: Live feed temporarily unreachable or rate-limited. Structured demo session data loaded.";
  }

  // Current trading date in ET
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD

  // Compute session levels
  const { sessionMetrics, keyLevels } = computeSessionLevels(quote.price, dailyBars, intradayBars);

  // Check if red-folder news scheduled between 9:30 and 10:00 AM ET
  const hasOpenNews = events.some((e) => e.alert && (e.timeET.includes("09:45") || e.timeET.includes("10:00")));

  // Evaluate bias & chop risk
  const bias = evaluateBiasAndRegime(quote.price, sessionMetrics, macro.vix, hasOpenNews);

  // Compute stop-loss risk & sizing guidance
  const riskGuidance = computeSizingGuidance(
    riskDollars,
    targetDollars,
    symbol,
    sessionMetrics.atr15mIntraday,
    sessionMetrics.atr14Daily
  );

  const ttlSeconds = parseInt(process.env.CACHE_TTL_SECONDS || "60", 10);
  const cacheExpiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const briefData: OpenBriefData = {
    tradeDate: dateStr,
    generatedAt: new Date().toISOString(),
    instrument: symbol,
    underlyingAsset: quote.symbol,
    quote,
    sessionMetrics,
    keyLevels,
    bias,
    riskGuidance,
    macro: {
      vix: macro.vix,
      us10y: macro.us10y,
      dxy: macro.dxy,
      megaCaps: macro.megaCaps,
      events,
      dealerGammaTilt: macro.dealerGammaTilt
    },
    dataSource: {
      providerName: providerUsed,
      quoteStatus: quote.status,
      levelsStatus: quote.status === "SAMPLE" ? "SAMPLE" : "DERIVED",
      lastUpdated: quote.timestamp,
      cacheExpiresAt,
      notice: providerNotice
    }
  };

  // Cache in-memory
  setCached(cacheKey, briefData, ttlSeconds);

  // Persist snapshot to SQLite daily_briefs asynchronously
  try {
    saveDailyBrief({
      tradeDate: dateStr,
      symbol,
      data: briefData,
      notes: bias.summary,
      createdBy: "openpulse-engine"
    });
  } catch (err) {
    console.error("Could not persist daily brief to SQLite:", err);
  }

  return briefData;
}
