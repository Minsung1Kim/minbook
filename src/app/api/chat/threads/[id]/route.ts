import { NextRequest, NextResponse } from "next/server";
import { resolveChatUser } from "@/lib/chat/auth";
import {
  deleteChatThread,
  getChatThreadWithMessages,
  toUIMessages,
  updateChatThreadTitle,
} from "@/lib/chat/store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const data = await getChatThreadWithMessages(id, auth.userId);
    if (!data) {
      return NextResponse.json({ success: false, error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      thread: data.thread,
      messages: data.messages,
      uiMessages: toUIMessages(data.messages),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load thread";
    console.error("API /api/chat/threads/[id] GET error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const title = typeof body?.title === "string" ? body.title : "";

    if (!title.trim()) {
      return NextResponse.json({ success: false, error: "Title is required" }, { status: 400 });
    }

    const updated = await updateChatThreadTitle(id, auth.userId, title);
    if (!updated) {
      return NextResponse.json({ success: false, error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update thread";
    console.error("API /api/chat/threads/[id] PATCH error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const deleted = await deleteChatThread(id, auth.userId);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete thread";
    console.error("API /api/chat/threads/[id] DELETE error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
