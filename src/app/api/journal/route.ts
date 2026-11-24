import { NextRequest, NextResponse } from "next/server";
import { getJournalTrades, addJournalTrade, deleteJournalTrade } from "@/lib/journal/store";
import { computeJournalAnalyticsFromTrades } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    let userId = searchParams.get("userId") || undefined;

    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: Please sign in to view your screenshot journal" },
          { status: 401 }
        );
      }
      userId = user.id;
    }

    const trades = await getJournalTrades(userId);
    const analytics = computeJournalAnalyticsFromTrades(trades);

    return NextResponse.json({
      success: true,
      trades,
      analytics
    });
  } catch (error: any) {
    console.error("API /api/journal GET error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load journal" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    let authenticatedUserId = "default";

    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: Please sign in to save screenshots" },
          { status: 401 }
        );
      }
      authenticatedUserId = user.id;
    }

    const body = await request.json();
    const {
      tradeDate,
      symbol = "NQ",
      actualPnlDollars,
      overlayColor,
      rawOcrText = "",
      ocrConfidence = "MEDIUM",
      notes = "",
      screenshotData,
      biasVerdictSnapshot = ""
    } = body;

    if (!tradeDate || actualPnlDollars === undefined || actualPnlDollars === null || isNaN(Number(actualPnlDollars))) {
      return NextResponse.json(
        { success: false, error: "Missing required tradeDate or P&L amount." },
        { status: 400 }
      );
    }

    if (!screenshotData || typeof screenshotData !== "string" || !screenshotData.startsWith("data:image/")) {
      return NextResponse.json(
        { success: false, error: "A valid trade screenshot image is required." },
        { status: 400 }
      );
    }

    const pnl = Math.round(Number(actualPnlDollars) * 100) / 100;
    const resolvedOverlayColor =
      overlayColor === "GREEN" || overlayColor === "RED"
        ? overlayColor
        : pnl >= 0
        ? "GREEN"
        : "RED";

    const newTrade = await addJournalTrade(
      {
        userId: authenticatedUserId,
        tradeDate,
        symbol: symbol === "MNQ" ? "MNQ" : "NQ",
        direction: "SCREENSHOT",
        entryPrice: 0,
        stopPrice: 0,
        targetPrice: 0,
        exitPrice: 0,
        contracts: 1,
        plannedRiskDollars: 0,
        plannedTargetDollars: 0,
        actualPnlDollars: pnl,
        actualPnlR: 0,
        maeR: 0,
        mfeR: 0,
        stoppedOut: pnl < 0,
        entryTimeET: "",
        exitTimeET: "",
        retraceLevelUsed: resolvedOverlayColor === "GREEN" ? "Green P&L Overlay" : "Red P&L Overlay",
        notes: notes || "",
        overlayColor: resolvedOverlayColor,
        rawOcrText,
        ocrConfidence,
        biasVerdictSnapshot
      },
      screenshotData
    );

    const allTrades = await getJournalTrades(authenticatedUserId);
    const analytics = computeJournalAnalyticsFromTrades(allTrades);

    return NextResponse.json({
      success: true,
      trade: newTrade,
      analytics
    });
  } catch (error: any) {
    console.error("API /api/journal POST error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to save screenshot P&L" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    let authenticatedUserId: string | undefined = undefined;

    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
      authenticatedUserId = user.id;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing entry ID parameter" },
        { status: 400 }
      );
    }

    const deleted = await deleteJournalTrade(id);
    const allTrades = await getJournalTrades(authenticatedUserId);
    const analytics = computeJournalAnalyticsFromTrades(allTrades);

    return NextResponse.json({
      success: deleted,
      analytics
    });
  } catch (error: any) {
    console.error("API /api/journal DELETE error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to delete entry" },
      { status: 500 }
    );
  }
}
