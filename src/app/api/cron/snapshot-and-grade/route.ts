import { NextRequest, NextResponse } from "next/server";
import { freezePredictionSnapshot, gradePendingPredictions } from "@/lib/calibration/grader";
import { getOpenBrief } from "@/lib/market/service";
import { getCMESessionInfo, getETParts } from "@/lib/market/sessionClock";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  // Optional security check
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    const querySecret = req.nextUrl.searchParams.get("secret");
    if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const results: Record<string, any> = {};
  const sessionInfo = getCMESessionInfo();
  const etParts = getETParts(new Date());
  const timeMins = etParts.hour * 60 + etParts.minute;

  // 1. Freeze Snapshot if within 09:15–09:30 ET
  if (
    (sessionInfo.phase === "PRE_MARKET_LOCK" && timeMins >= 555) ||
    sessionInfo.phase === "NY_OPEN_WINDOW"
  ) {
    try {
      const brief = await getOpenBrief({ symbol: "NQ" });
      const freezeRes = await freezePredictionSnapshot(brief);
      results.freeze = freezeRes;
    } catch (err: any) {
      results.freezeError = err?.message || err;
    }
  } else {
    results.freeze = "Skipped (outside 09:15–09:30 ET window)";
  }

  // 2. Grade Pending Sessions if after 10:20 ET or any afternoon phase
  if (timeMins >= 620 || sessionInfo.phase === "POST_WINDOW_RECAP" || sessionInfo.phase === "CME_BREAK_OR_WEEKEND") {
    try {
      const gradeRes = await gradePendingPredictions();
      results.grade = gradeRes;
    } catch (err: any) {
      results.gradeError = err?.message || err;
    }
  } else {
    results.grade = "Skipped (awaiting 10:20 ET settlement delay)";
  }

  return NextResponse.json({
    success: true,
    sessionPhase: sessionInfo.phase,
    results
  });
}
