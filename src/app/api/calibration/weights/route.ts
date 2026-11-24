import { NextRequest, NextResponse } from "next/server";
import { getCalibrationRepository } from "@/lib/calibration/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repo = getCalibrationRepository();
    const active = await repo.getActiveModelWeights();
    const history = await repo.getAllModelWeightsHistory();

    return NextResponse.json({
      success: true,
      active,
      history
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to fetch model weights" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const repo = getCalibrationRepository();

    if (body.action === "rollback") {
      const version = body.version;
      if (!version) {
        return NextResponse.json({ success: false, error: "Missing version for rollback" }, { status: 400 });
      }
      await repo.setActiveModelWeights(version);
      const active = await repo.getActiveModelWeights();
      return NextResponse.json({
        success: true,
        message: `Rolled back to model weights ${version}`,
        active
      });
    }

    if (body.action === "apply") {
      const { version, weights, sampleSizeUsed, outOfSampleAccuracy, changeSummary } = body;
      if (!version || !weights) {
        return NextResponse.json({ success: false, error: "Missing version or weights payload" }, { status: 400 });
      }

      const saved = await repo.saveModelWeights({
        version,
        isActive: true,
        weights,
        sampleSizeUsed: sampleSizeUsed ?? 0,
        outOfSampleAccuracy: outOfSampleAccuracy ?? 0,
        changeSummary: changeSummary ?? `Applied updated weights for ${version}`
      });

      return NextResponse.json({
        success: true,
        message: `Successfully activated model weights ${version}`,
        active: saved
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to update model weights" },
      { status: 500 }
    );
  }
}
