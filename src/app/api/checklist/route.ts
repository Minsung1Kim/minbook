import { NextRequest, NextResponse } from "next/server";
import { getChecklist, saveChecklist } from "@/lib/db";
import { ChecklistState } from "@/types/app";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];
    const userId = searchParams.get("userId") || "default";

    let state = getChecklist(date, userId);
    if (!state) {
      state = {
        date,
        htfTrendConfirmed: false,
        openingDriveAllowed: false,
        retraceKeyLevelHit: false,
        noImpendingRedNews: false,
        stopFitsDollarBudget: false,
        singleTradeCommitment: false,
        journalPledge: false
      };
    }

    return NextResponse.json({ success: true, state });
  } catch (error: any) {
    console.error("API /api/checklist GET error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load checklist" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, userId = "default", state } = body;

    if (!date || !state) {
      return NextResponse.json({ success: false, error: "Date and state required" }, { status: 400 });
    }

    saveChecklist(date, userId, state as ChecklistState);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API /api/checklist POST error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to save checklist" },
      { status: 500 }
    );
  }
}
