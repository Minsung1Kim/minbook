import { NextRequest, NextResponse } from "next/server";
import { resolveChatUser } from "@/lib/chat/auth";
import { createChatThread, listChatThreads } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const threads = await listChatThreads(auth.userId);
    return NextResponse.json({ success: true, threads });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list threads";
    console.error("API /api/chat/threads GET error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    let title = "New NQ Strat Session";
    try {
      const body = await request.json();
      if (typeof body?.title === "string" && body.title.trim()) {
        title = body.title.trim().slice(0, 120);
      }
    } catch {
      // Optional JSON body
    }

    const thread = await createChatThread(auth.userId, title);
    return NextResponse.json({ success: true, thread });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create thread";
    console.error("API /api/chat/threads POST error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
