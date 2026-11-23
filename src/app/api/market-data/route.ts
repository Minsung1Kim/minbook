import { NextRequest, NextResponse } from "next/server";
import { getOpenBrief } from "@/lib/market/service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolParam = (searchParams.get("symbol") || "NQ").toUpperCase();
    const symbol = symbolParam.startsWith("MNQ") ? "MNQ" : "NQ";
    const risk = parseFloat(searchParams.get("risk") || "250");
    const target = parseFloat(searchParams.get("target") || "550");
    const refresh = searchParams.get("refresh") === "true";

    const brief = await getOpenBrief({
      symbol,
      riskDollars: isNaN(risk) ? 250 : risk,
      targetDollars: isNaN(target) ? 550 : target,
      forceRefresh: refresh
    });

    return NextResponse.json({
      success: true,
      data: brief
    });
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
