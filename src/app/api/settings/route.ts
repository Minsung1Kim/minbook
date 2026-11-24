import { NextRequest, NextResponse } from "next/server";
import { getProfiles, getProfile, upsertProfile } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: userSetting } = await supabase
          .from("user_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (userSetting) {
          const profile = {
            id: user.id,
            name: user.email?.split("@")[0] || "Trader",
            defaultInstrument: (userSetting.default_instrument || "NQ") as "NQ" | "MNQ",
            riskBudgetDollars: Number(userSetting.risk_budget_dollars || 250),
            targetBudgetDollars: Number(userSetting.target_budget_dollars || 550),
            maxDailyTrades: Number(userSetting.max_daily_trades || 1),
            maxDailyLossDollars: Number(userSetting.max_daily_loss_dollars || 350),
            trailingDrawdownAlert: Number(userSetting.trailing_drawdown_alert || 2000),
            notes: userSetting.notes || "",
            updatedAt: userSetting.updated_at
          };

          return NextResponse.json({
            success: true,
            data: {
              profiles: [profile],
              current: profile
            },
            profiles: [profile],
            current: profile
          });
        }
      }
    }

    const profiles = getProfiles();
    const current = userId ? getProfile(userId) : profiles[0] || null;

    return NextResponse.json({
      success: true,
      data: {
        profiles,
        current
      },
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
    const supabase = await createClient();
    const body = await request.json();
    const payload = body.profile || body;

    if (!payload.id || !payload.name) {
      return NextResponse.json(
        { success: false, error: "Profile id and name are required" },
        { status: 400 }
      );
    }

    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.from("user_settings").upsert({
          user_id: user.id,
          risk_budget_dollars: payload.riskBudgetDollars,
          target_budget_dollars: payload.targetBudgetDollars,
          max_daily_trades: payload.maxDailyTrades,
          max_daily_loss_dollars: payload.maxDailyLossDollars,
          trailing_drawdown_alert: payload.trailingDrawdownAlert,
          default_instrument: payload.defaultInstrument || "NQ",
          notes: payload.notes || "",
          updated_at: new Date().toISOString()
        });
      }
    }

    const saved = upsertProfile(payload);
    const profiles = getProfiles();

    return NextResponse.json({
      success: true,
      data: {
        profile: saved,
        profiles
      },
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
