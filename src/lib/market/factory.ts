import { MarketDataProvider } from "./provider";
import { YahooFinanceProvider } from "./yahoo";
import { PolygonProvider } from "./polygon";
import { SeedFallbackProvider } from "./fallback";

export function getMarketDataProvider(): MarketDataProvider {
  const chosen = (process.env.MARKET_DATA_PROVIDER || "yahoo").toLowerCase().trim();

  if (chosen === "polygon" && process.env.POLYGON_API_KEY) {
    return new PolygonProvider();
  }

  if (chosen === "fallback" || chosen === "mock" || chosen === "seed") {
    return new SeedFallbackProvider();
  }

  // Default: Yahoo Finance (free, zero API key required)
  return new YahooFinanceProvider();
}
