import { NextRequest, NextResponse } from "next/server";
import { resolveChatUser } from "@/lib/chat/auth";
import {
  deleteUserGeminiApiKey,
  getUserGeminiApiKeyStatus,
  saveUserGeminiApiKey,
  validateGeminiApiKey,
} from "@/lib/chat/key-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const status = await getUserGeminiApiKeyStatus(auth.userId);
    return NextResponse.json({ success: true, ...status });
  } catch (error: unknown) {
    console.error("API /api/chat/key GET error");
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load key status",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "API key is required" },
        { status: 400 }
      );
    }

    const validation = await validateGeminiApiKey(apiKey);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error || "Invalid API key" },
        { status: 400 }
      );
    }

    const status = await saveUserGeminiApiKey(auth.userId, apiKey);
    return NextResponse.json({ success: true, ...status });
  } catch (error: unknown) {
    console.error("API /api/chat/key POST error");
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save API key",
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const status = await deleteUserGeminiApiKey(auth.userId);
    return NextResponse.json({ success: true, ...status });
  } catch (error: unknown) {
    console.error("API /api/chat/key DELETE error");
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete API key",
      },
      { status: 500 }
    );
  }
}
