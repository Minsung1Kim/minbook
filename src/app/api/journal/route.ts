import { NextRequest, NextResponse } from "next/server";
import { getTrades, addTrade, deleteTrade, computeJournalAnalytics } from "@/lib/db";
import { TradeLogEntry } from "@/types/app";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || undefined;

    const trades = getTrades(userId);
    const analytics = computeJournalAnalytics(userId);

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
    const body = await request.json();
    const {
      userId = "minsung",
      tradeDate,
      symbol = "NQ",
      direction,
      entryPrice,
      stopPrice,
      targetPrice,
      exitPrice,
      contracts = 1,
      plannedRiskDollars,
      plannedTargetDollars,
      actualPnlDollars,
      maeR,
      mfeR,
      stoppedOut = false,
      entryTimeET,
      exitTimeET,
      retraceLevelUsed = "",
      notes = ""
    } = body;

    if (!tradeDate || !direction || entryPrice === undefined || stopPrice === undefined || exitPrice === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required trade details (tradeDate, direction, prices)" },
        { status: 400 }
      );
    }

    const risk = plannedRiskDollars || Math.abs(entryPrice - stopPrice) * (symbol === "MNQ" ? 2 : 20) * contracts;
    const actualPnl = actualPnlDollars !== undefined
      ? actualPnlDollars
      : (direction === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice) * (symbol === "MNQ" ? 2 : 20) * contracts;

    const actualR = risk > 0 ? Math.round((actualPnl / risk) * 100) / 100 : 0;

    const newTrade = addTrade({
      userId,
      tradeDate,
      symbol,
      direction,
      entryPrice: Number(entryPrice),
      stopPrice: Number(stopPrice),
      targetPrice: Number(targetPrice || entryPrice),
      exitPrice: Number(exitPrice),
      contracts: Number(contracts),
      plannedRiskDollars: Number(risk),
      plannedTargetDollars: Number(plannedTargetDollars || risk * 2.2),
      actualPnlDollars: Number(actualPnl),
      actualPnlR: actualR,
      maeR: Number(maeR !== undefined ? maeR : (stoppedOut ? 1.0 : 0.3)),
      mfeR: Number(mfeR !== undefined ? mfeR : Math.max(0, actualR)),
      stoppedOut: Boolean(stoppedOut),
      entryTimeET: entryTimeET || "09:35:00",
      exitTimeET: exitTimeET || "09:50:00",
      retraceLevelUsed,
      notes
    });

    const analytics = computeJournalAnalytics(userId);

    return NextResponse.json({
      success: true,
      trade: newTrade,
      analytics
    });
  } catch (error: any) {
    console.error("API /api/journal POST error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to log trade" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Trade ID required" }, { status: 400 });
    }

    const deleted = deleteTrade(id);
    return NextResponse.json({ success: true, deleted });
  } catch (error: any) {
    console.error("API /api/journal DELETE error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to delete trade" },
      { status: 500 }
    );
  }
}
