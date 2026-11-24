import { NextResponse } from "next/server";
import { gradePendingPredictions } from "@/lib/calibration/grader";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await gradePendingPredictions();
    return NextResponse.json({
      success: true,
      gradedCount: result.gradedCount,
      gradedDates: result.gradedDates,
      errors: result.errors
    });
  } catch (err: any) {
    console.error("Failed to grade pending predictions:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to grade pending predictions" },
      { status: 500 }
    );
  }
}
