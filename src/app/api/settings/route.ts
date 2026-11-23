import { NextRequest, NextResponse } from "next/server";
import { getProfiles, getProfile, upsertProfile } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const profiles = getProfiles();
    const current = userId ? getProfile(userId) : profiles[0] || null;

    return NextResponse.json({
      success: true,
      profiles,
      current
    });
  } catch (error: any) {
    console.error("API /api/settings GET error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id || !body.name) {
      return NextResponse.json(
        { success: false, error: "Profile id and name are required" },
        { status: 400 }
      );
    }

    const saved = upsertProfile(body);
    const profiles = getProfiles();

    return NextResponse.json({
      success: true,
      profile: saved,
      profiles
    });
  } catch (error: any) {
    console.error("API /api/settings POST error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to save settings" },
      { status: 500 }
    );
  }
}
