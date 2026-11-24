import { NextRequest, NextResponse } from "next/server";
import { getOpenBrief } from "@/lib/market/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolParam = (searchParams.get("symbol") || "NQ").toUpperCase();
    const symbol = symbolParam.startsWith("MNQ") ? "MNQ" : "NQ";
    const refresh = searchParams.get("refresh") === "true";

    const brief = await getOpenBrief({
      symbol,
      forceRefresh: refresh
    });

    return NextResponse.json(
      {
        success: true,
        data: brief
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
        }
      }
    );
  } catch (error: any) {
    console.error("API /api/market-data error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to generate market brief"
      },
      { status: 500 }
    );
  }
}
