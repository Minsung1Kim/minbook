import { NextRequest, NextResponse } from "next/server";
import { getMarketDataProvider } from "@/lib/market/factory";
import { SeedFallbackProvider } from "@/lib/market/fallback";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolParam = (searchParams.get("symbol") || "NQ").toUpperCase();
    const symbol = symbolParam.startsWith("MNQ") ? "MNQ" : "NQ";
    const intervalParam = searchParams.get("interval") || "15m";
    const interval = (intervalParam === "5m" ? "5m" : "15m") as "5m" | "15m";

    const provider = getMarketDataProvider();
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
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120"
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
