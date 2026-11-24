import { TradeLogEntry, JournalAnalytics } from "@/types/app";
import { getTrades as getSqliteTrades, addTrade as addSqliteTrade, deleteTrade as deleteSqliteTrade, computeJournalAnalytics as computeSqliteAnalytics } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function getJournalTrades(userId?: string): Promise<TradeLogEntry[]> {
  const supabase = await createClient();

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from("journal_trades")
      .select("*")
      .eq("user_id", user.id)
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase getJournalTrades error:", error);
      return [];
    }

    const trades: TradeLogEntry[] = [];
    for (const r of data || []) {
      let signedUrl: string | undefined = undefined;
      if (r.screenshot_path) {
        try {
          const { data: urlData } = await supabase.storage
            .from("journal-screenshots")
            .createSignedUrl(r.screenshot_path, 3600);
          if (urlData?.signedUrl) {
            signedUrl = urlData.signedUrl;
          }
        } catch (e) {
          console.warn("Could not generate signed URL for screenshot:", e);
        }
      }

      trades.push({
        id: r.id,
        userId: r.user_id,
        tradeDate: typeof r.trade_date === "string" ? r.trade_date : new Date(r.trade_date).toISOString().split("T")[0],
        symbol: (r.symbol || r.instrument || "NQ") as "NQ" | "MNQ",
        direction: r.direction,
        entryPrice: Number(r.entry_price),
        stopPrice: Number(r.stop_price),
        targetPrice: Number(r.target_price),
        exitPrice: Number(r.exit_price),
        worstPrice: r.worst_price != null ? Number(r.worst_price) : undefined,
        bestPrice: r.best_price != null ? Number(r.best_price) : undefined,
        contracts: Number(r.contracts || 1),
        plannedRiskDollars: Number(r.pnl_usd || 250),
        plannedTargetDollars: Number(r.target_price ? Math.abs(r.target_price - r.entry_price) * 20 : 550),
        actualPnlDollars: Number(r.actual_pnl_dollars ?? r.pnl_usd ?? 0),
        actualPnlR: Number(r.actual_pnl_r ?? r.actual_r ?? 0),
        maeR: Number(r.mae_r ?? 0),
        mfeR: Number(r.mfe_r ?? 0),
        exitEfficiencyPercent: r.exit_efficiency_percent != null ? Number(r.exit_efficiency_percent) : undefined,
        stoppedOut: Boolean(r.stopped_out),
        entryTimeET: r.entry_time_et || "09:35:00",
        exitTimeET: r.exit_time_et || "09:50:00",
        retraceLevelUsed: r.retrace_level_used || "",
        notes: r.notes || r.setup_notes || "",
        overlayColor: (r.overlay_color as TradeLogEntry["overlayColor"]) || (Number(r.actual_pnl_dollars ?? r.pnl_usd ?? 0) >= 0 ? "GREEN" : "RED"),
        rawOcrText: r.raw_ocr_text || undefined,
        ocrConfidence: (r.ocr_confidence as TradeLogEntry["ocrConfidence"]) || undefined,
        screenshotPath: r.screenshot_path || undefined,
        screenshotSignedUrl: signedUrl,
        sessionBarsJson: r.session_bars_json ? JSON.stringify(r.session_bars_json) : undefined,
        createdAt: r.created_at
      });
    }

    return trades;
  }

  // Local SQLite fallback
  return getSqliteTrades(userId);
}

export async function addJournalTrade(
  trade: Omit<TradeLogEntry, "id" | "createdAt">,
  screenshotBase64?: string
): Promise<TradeLogEntry> {
  const supabase = await createClient();

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized: Cannot save trade without signing in");
    }

    const tradeId = crypto.randomUUID();
    let screenshotPath: string | null = null;
    let screenshotSignedUrl: string | undefined = undefined;

    // Upload screenshot to Supabase Storage if provided
    if (screenshotBase64 && screenshotBase64.startsWith("data:image/")) {
      try {
        const matches = screenshotBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const buffer = Buffer.from(matches[2], "base64");
          const ext = mimeType.split("/")[1] || "webp";
          const path = `${user.id}/${tradeId}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("journal-screenshots")
            .upload(path, buffer, {
              contentType: mimeType,
              upsert: true,
            });

          if (!uploadError) {
            screenshotPath = path;
            const { data: signedData } = await supabase.storage
              .from("journal-screenshots")
              .createSignedUrl(path, 3600);
            screenshotSignedUrl = signedData?.signedUrl;
          } else {
            console.warn("Screenshot upload error:", uploadError);
          }
        }
      } catch (e) {
        console.warn("Failed to process trade screenshot:", e);
      }
    }

    const newRecord = {
      id: tradeId,
      user_id: user.id,
      trade_date: trade.tradeDate,
      symbol: trade.symbol,
      instrument: trade.symbol,
      direction: trade.direction,
      contracts: trade.contracts,
      entry_time_et: trade.entryTimeET,
      exit_time_et: trade.exitTimeET,
      entry_price: trade.entryPrice,
      stop_price: trade.stopPrice,
      exit_price: trade.exitPrice,
      target_price: trade.targetPrice,
      worst_price: trade.worstPrice ?? null,
      best_price: trade.bestPrice ?? null,
      pnl_usd: trade.actualPnlDollars,
      actual_pnl_dollars: trade.actualPnlDollars,
      actual_r: trade.actualPnlR,
      actual_pnl_r: trade.actualPnlR,
      mae_r: trade.maeR,
      mfe_r: trade.mfeR,
      exit_efficiency_pct: trade.exitEfficiencyPercent ?? null,
      exit_efficiency_percent: trade.exitEfficiencyPercent ?? null,
      stopped_out: trade.stoppedOut,
      retrace_level_used: trade.retraceLevelUsed,
      notes: trade.notes,
      setup_notes: trade.notes,
      overlay_color: trade.overlayColor ?? null,
      raw_ocr_text: trade.rawOcrText ?? null,
      ocr_confidence: trade.ocrConfidence ?? null,
      screenshot_path: screenshotPath,
      session_bars_json: trade.sessionBarsJson ? JSON.parse(trade.sessionBarsJson) : null,
      created_at: new Date().toISOString()
    };

    const { error: insertError } = await supabase.from("journal_trades").insert(newRecord);

    if (insertError) {
      console.error("Supabase insert trade error:", insertError);
      throw new Error(`Failed to save trade to Supabase: ${insertError.message}`);
    }

    return {
      ...trade,
      id: tradeId,
      userId: user.id,
      screenshotPath: screenshotPath || undefined,
      screenshotSignedUrl,
      createdAt: newRecord.created_at
    };
  }

  // Local SQLite fallback (preserve screenshot data URL locally)
  return addSqliteTrade({
    ...trade,
    screenshotDataUrl: screenshotBase64
  });
}

export async function deleteJournalTrade(id: string): Promise<boolean> {
  const supabase = await createClient();

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    const { error } = await supabase
      .from("journal_trades")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    return !error;
  }

  // Local SQLite fallback
  return deleteSqliteTrade(id);
}

export { computeSqliteAnalytics as computeAnalytics };
