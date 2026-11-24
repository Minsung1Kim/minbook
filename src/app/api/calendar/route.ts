import { NextResponse } from "next/server";
import { getUSEconomicEvents } from "@/lib/market/economicCalendar";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await getUSEconomicEvents();
    return NextResponse.json(
      {
        success: true,
        data: {
          events,
          source: "Forex Factory Delayed JSON Feed",
          fetchedAt: new Date().toISOString()
        }
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
        }
      }
    );
  } catch (error: any) {
    console.error("API /api/calendar error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to load economic calendar"
      },
      { status: 500 }
    );
  }
}
