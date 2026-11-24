import { NextRequest, NextResponse } from "next/server";
import { resolveChatUser } from "@/lib/chat/auth";
import { buildMarketContext } from "@/lib/chat/build-market-context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Please sign in to access MinBook AI Chat" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const symbolParam = (searchParams.get("symbol") || "NQ").toUpperCase();
    const symbol = symbolParam.startsWith("MNQ") ? "MNQ" : "NQ";
    const refresh = searchParams.get("refresh") === "true";

    const { snapshot } = await buildMarketContext({
      symbol,
      userId: auth.userId,
      forceRefresh: refresh,
    });

    return NextResponse.json(
      { success: true, snapshot },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load market context";
    console.error("API /api/chat/context GET error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
