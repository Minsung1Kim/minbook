import { NextRequest, NextResponse } from "next/server";
import { freezePredictionSnapshot } from "@/lib/calibration/grader";
import { getOpenBrief } from "@/lib/market/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let brief: any = null;
    try {
      const body = await req.json();
      if (body?.brief) brief = body.brief;
    } catch {}

    if (!brief) {
      brief = await getOpenBrief({ symbol: "NQ" });
    }

    const result = await freezePredictionSnapshot(brief);
    return NextResponse.json({
      success: true,
      data: result.prediction,
      isNew: result.isNew,
      message: result.message
    });
  } catch (err: any) {
    console.error("Failed to freeze prediction:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to freeze prediction snapshot" },
      { status: 500 }
    );
  }
}
