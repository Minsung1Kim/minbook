import { NextRequest, NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/market/factory";
import { SeedFallbackProvider } from "@/lib/market/fallback";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolParam = (searchParams.get("symbol") || "NQ").toUpperCase();
    const symbol = symbolParam.startsWith("MNQ") ? "MNQ" : "NQ";
    const intervalParam = (searchParams.get("interval") || "15m").toLowerCase();
    const interval = (
      intervalParam === "5m" || intervalParam === "1h" || intervalParam === "4h"
        ? intervalParam
        : "15m"
    ) as "5m" | "15m" | "1h" | "4h";
    const refresh = searchParams.get("refresh") === "true";

    const provider = getMarketDataProvider();
    if (refresh && provider.clearCache) {
      provider.clearCache();
    }
    let bars = [];
    let providerName = provider.name;

    try {
      bars = await provider.getIntradayBars(symbol, interval);
    } catch (err: any) {
      console.warn(`Primary provider chart fetch failed for ${symbol} ${interval}:`, err?.message || err);
      const fallback = new SeedFallbackProvider();
      bars = await fallback.getIntradayBars(symbol, interval);
      providerName = fallback.name;
    }

    return NextResponse.json(
      {
        success: true,
        symbol,
        interval,
        provider: providerName,
        bars
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
        }
      }
    );
  } catch (error: any) {
    console.error("API /api/market-data/chart error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to fetch chart bars"
      },
      { status: 500 }
    );
  }
}
