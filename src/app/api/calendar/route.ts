import { NextResponse } from "next/server";
import { getUSEconomicEvents } from "@/lib/market/economicCalendar";

export async function GET() {
  try {
    const events = await getUSEconomicEvents();
    return NextResponse.json({
      success: true,
      data: {
        events,
        source: "Forex Factory Delayed JSON Feed",
        fetchedAt: new Date().toISOString()
      }
    });
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
