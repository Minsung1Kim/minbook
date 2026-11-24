import { NextResponse } from "next/server";
import { computeCalibrationSummary } from "@/lib/calibration/optimizer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await computeCalibrationSummary();
    return NextResponse.json({
      success: true,
      data: summary
    });
  } catch (err: any) {
    console.error("Failed to load calibration summary:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load calibration summary" },
      { status: 500 }
    );
  }
}
