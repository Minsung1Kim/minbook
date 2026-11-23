import { NextRequest, NextResponse } from "next/server";
import { getDailyBrief, getRecentBriefs, saveDailyBrief } from "@/lib/db";
import { getOpenBrief } from "@/lib/market/service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const symbol = (searchParams.get("symbol") || "NQ").toUpperCase() as "NQ" | "MNQ";

    if (date) {
      let brief = getDailyBrief(date, symbol);
      if (!brief) {
        // If not in database yet for today, generate it on demand
        const generated = await getOpenBrief({ symbol });
        brief = saveDailyBrief({
          tradeDate: date,
          symbol,
          data: generated,
          createdBy: "on-demand"
        });
      }
      return NextResponse.json({ success: true, brief });
    }

    const recents = getRecentBriefs(20);
    return NextResponse.json({ success: true, briefs: recents });
  } catch (error: any) {
    console.error("API /api/briefs GET error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load briefs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tradeDate, symbol, data, notes, createdBy } = body;

    if (!tradeDate || !symbol || !data) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (tradeDate, symbol, data)" },
        { status: 400 }
      );
    }

    const saved = saveDailyBrief({
      tradeDate,
      symbol,
      data,
      notes: notes || "",
      createdBy: createdBy || "friend-share"
    });

    return NextResponse.json({ success: true, brief: saved });
  } catch (error: any) {
    console.error("API /api/briefs POST error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to save brief" },
      { status: 500 }
    );
  }
}
