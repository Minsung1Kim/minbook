import { NextRequest, NextResponse } from "next/server";
import { getTrades, addTrade, deleteTrade, computeJournalAnalytics } from "@/lib/db";
import { computeDirectionalMaeMfe } from "@/lib/market/math";

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
      worstPrice,
      bestPrice,
      contracts = 1,
      plannedRiskDollars,
      plannedTargetDollars,
      actualPnlDollars,
      stoppedOut = false,
      entryTimeET,
      exitTimeET,
      retraceLevelUsed = "",
      notes = "",
      vxnSnapshot,
      termRatioSnapshot,
      vvixSnapshot,
      vrpSnapshot,
      inventoryPercentSnapshot,
      smtSnapshot = "",
      biasVerdictSnapshot = ""
    } = body;

    if (!tradeDate || !direction || entryPrice === undefined || stopPrice === undefined || exitPrice === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required trade details (tradeDate, direction, prices)" },
        { status: 400 }
      );
    }

    const entry = Number(entryPrice);
    const stop = Number(stopPrice);
    const exit = Number(exitPrice);
    const worst = worstPrice !== undefined && worstPrice !== "" ? Number(worstPrice) : undefined;
    const best = bestPrice !== undefined && bestPrice !== "" ? Number(bestPrice) : undefined;

    const pointValue = symbol === "MNQ" ? 2 : 20;
    const plannedRiskPts = Math.abs(entry - stop);
    const risk = plannedRiskDollars || plannedRiskPts * pointValue * Number(contracts);

    // Directional MAE / MFE computation
    const { maeR, mfeR, actualPnlR, exitEfficiencyPercent } = computeDirectionalMaeMfe(
      direction,
      entry,
      stop,
      exit,
      worst,
      best
    );

    const actualPts = direction === "LONG" ? exit - entry : entry - exit;
    const calculatedPnl = actualPnlDollars !== undefined ? Number(actualPnlDollars) : actualPts * pointValue * Number(contracts);

    const newTrade = addTrade({
      userId,
      tradeDate,
      symbol,
      direction,
      entryPrice: entry,
      stopPrice: stop,
      targetPrice: Number(targetPrice || entry),
      exitPrice: exit,
      worstPrice: worst,
      bestPrice: best,
      contracts: Number(contracts),
      plannedRiskDollars: Number(risk),
      plannedTargetDollars: Number(plannedTargetDollars || risk * 2.2),
      actualPnlDollars: calculatedPnl,
      actualPnlR,
      maeR: Number(body.maeR !== undefined && body.maeR !== "" ? body.maeR : (stoppedOut ? 1.0 : maeR)),
      mfeR: Number(body.mfeR !== undefined && body.mfeR !== "" ? body.mfeR : Math.max(mfeR, actualPnlR > 0 ? actualPnlR : 0)),
      exitEfficiencyPercent,
      stoppedOut: Boolean(stoppedOut),
      entryTimeET: entryTimeET || "09:35:00",
      exitTimeET: exitTimeET || "09:50:00",
      retraceLevelUsed,
      notes,
      vxnSnapshot: vxnSnapshot ? Number(vxnSnapshot) : undefined,
      termRatioSnapshot: termRatioSnapshot ? Number(termRatioSnapshot) : undefined,
      vvixSnapshot: vvixSnapshot ? Number(vvixSnapshot) : undefined,
      vrpSnapshot: vrpSnapshot ? Number(vrpSnapshot) : undefined,
      inventoryPercentSnapshot: inventoryPercentSnapshot ? Number(inventoryPercentSnapshot) : undefined,
      smtSnapshot,
      biasVerdictSnapshot
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
    const userId = searchParams.get("userId") || undefined;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing trade ID parameter" },
        { status: 400 }
      );
    }

    const deleted = deleteTrade(id);
    const analytics = computeJournalAnalytics(userId);

    return NextResponse.json({
      success: deleted,
      analytics
    });
  } catch (error: any) {
    console.error("API /api/journal DELETE error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to delete trade" },
      { status: 500 }
    );
  }
}
