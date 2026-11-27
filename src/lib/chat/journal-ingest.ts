import crypto from "node:crypto";
import { createGoogle } from "@ai-sdk/google";
import { generateObject, jsonSchema } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  getScalpJournalTrades,
  upsertScalpJournalTrades,
  getTrades as getLegacySqliteTrades,
} from "@/lib/db";
import {
  CHAT_FALLBACK_MODELS,
  CHAT_MODEL_ID,
  getGoogleThinkingOptions,
  JournalQueryResult,
  ScalpJournalTrade,
  ScalpSetupArchetype,
  SessionWindow,
} from "@/types/chat";

export function inferSessionWindowFromTimeET(entryTimeET: string): SessionWindow {
  const m = (entryTimeET || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return "NY_OPEN_0930_1000";
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const lower = entryTimeET.toLowerCase();
  if (lower.includes("pm") && hour < 12) hour += 12;
  if (lower.includes("am") && hour === 12) hour = 0;

  const totalMins = hour * 60 + minute;
  if (totalMins >= 570 && totalMins < 600) return "NY_OPEN_0930_1000";
  if (totalMins >= 600 && totalMins < 690) return "NY_AM_1000_1130";
  if (totalMins >= 690 && totalMins < 810) return "NY_LUNCH_1130_1330";
  if (totalMins >= 810 && totalMins < 960) return "NY_PM_1330_1600";
  return "OVERNIGHT_GLOBEX";
}

export function normalizeSetupArchetype(raw?: string | null): ScalpSetupArchetype {
  const s = (raw || "").toUpperCase().trim();
  if (s.includes("SWEEP") || s.includes("MSS") || s.includes("REVERSAL")) {
    return "SWEEP_MSS_REVERSAL";
  }
  if (s.includes("RETRACE") || s.includes("CONTINUATION") || s.includes("PULLBACK")) {
    if (s.includes("VWAP") || s.includes("ON MID") || s.includes("ONMID")) {
      return "VWAP_ONMID_PULLBACK";
    }
    return "RETRACE_CONTINUATION";
  }
  if (s.includes("VWAP") || s.includes("ONMID") || s.includes("ON_MID")) {
    return "VWAP_ONMID_PULLBACK";
  }
  if (s.includes("ORB") || s.includes("RANGE") || s.includes("BREAK")) {
    return "OPEN_RANGE_BREAK";
  }
  return "UNKNOWN";
}

export function normalizeGexRegime(raw?: string | null): string {
  const s = (raw || "").toUpperCase().trim();
  if (s.includes("NEG") || s.includes("-G") || s.includes("-Γ")) return "NEGATIVE_GAMMA";
  if (s.includes("POS") || s.includes("+G") || s.includes("+Γ")) return "POSITIVE_GAMMA";
  return s || "UNAVAILABLE";
}

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,%Rpts\s]/gi, "").trim();
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function normalizeImportedTrade(
  raw: Record<string, unknown>,
  userId: string,
  importSource: ScalpJournalTrade["importSource"],
  idx: number
): ScalpJournalTrade {
  const tradeDate =
    String(raw.tradeDate ?? raw.trade_date ?? raw.date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const entryTimeET = String(raw.entryTimeET ?? raw.entry_time_et ?? raw.time ?? "09:35");
  const rawSessionWindow = String(raw.sessionWindow ?? raw.session_window ?? "");
  const sessionWindow = rawSessionWindow
    ? rawSessionWindow.toUpperCase()
    : inferSessionWindowFromTimeET(entryTimeET);

  const rawDir = String(raw.direction ?? "LONG").toUpperCase();
  const direction: "LONG" | "SHORT" = rawDir.includes("SHORT") || rawDir.includes("SELL") ? "SHORT" : "LONG";

  const rawInst = String(raw.instrument ?? raw.symbol ?? "MNQ").toUpperCase();
  const instrument: "NQ" | "MNQ" = rawInst.startsWith("NQ") && !rawInst.startsWith("MNQ") ? "NQ" : "MNQ";

  const rawTags = raw.mistakeTags ?? raw.mistake_tags ?? [];
  const mistakeTags = Array.isArray(rawTags)
    ? rawTags.map((t) => String(t).trim()).filter(Boolean)
    : typeof rawTags === "string"
    ? rawTags
        .split(/[;|,]/)
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const slideNumber =
    raw.slideNumber != null || raw.slide_number != null
      ? Math.round(toNum(raw.slideNumber ?? raw.slide_number, idx + 1))
      : null;

  const setupRaw = String(raw.setupArchetype ?? raw.setup_archetype ?? raw.setup ?? "");
  const idSeed = `${userId}|${tradeDate}|${entryTimeET}|${slideNumber ?? idx}|${idx}|${direction}|${setupRaw}`;
  const safeId =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `sj-${crypto.createHash("sha256").update(idSeed).digest("hex").slice(0, 20)}`;

  return {
    id: safeId,
    userId,
    slideNumber,
    tradeDate,
    entryTimeET,
    instrument,
    direction,
    contracts: Math.max(1, Math.round(toNum(raw.contracts, 1))),
    sessionWindow,
    setupArchetype: normalizeSetupArchetype(
      String(raw.setupArchetype ?? raw.setup_archetype ?? raw.setup ?? "")
    ),
    stopPts: Math.round(Math.abs(toNum(raw.stopPts ?? raw.stop_pts, 14)) * 100) / 100,
    tp1Pts:
      raw.tp1Pts != null || raw.tp1_pts != null
        ? Math.round(Math.abs(toNum(raw.tp1Pts ?? raw.tp1_pts, 0)) * 100) / 100
        : null,
    realizedR: Math.round(toNum(raw.realizedR ?? raw.realized_r ?? raw.r, 0) * 100) / 100,
    mfePts: Math.round(Math.abs(toNum(raw.mfePts ?? raw.mfe_pts, 0)) * 100) / 100,
    maePts: Math.round(Math.abs(toNum(raw.maePts ?? raw.mae_pts, 0)) * 100) / 100,
    gexRegime: normalizeGexRegime(String(raw.gexRegime ?? raw.gex_regime ?? "")),
    playbookArchetype: String(
      raw.playbookArchetype ?? raw.playbook_archetype ?? "UNKNOWN"
    ).toUpperCase(),
    executionGrade: String(raw.executionGrade ?? raw.execution_grade ?? "B").toUpperCase(),
    mistakeTags,
    traderNotes: String(raw.traderNotes ?? raw.trader_notes ?? raw.notes ?? "").trim(),
    importSource,
    createdAt: new Date().toISOString(),
  };
}

export function parseJournalJsonImport(
  payload: unknown,
  userId: string = "default"
): ScalpJournalTrade[] {
  const arr = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { trades?: unknown[] }).trades)
    ? (payload as { trades: unknown[] }).trades
    : [];

  return arr
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, idx) => normalizeImportedTrade(item, userId, "JSON", idx));
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

export function parseJournalCsvImport(
  csvText: string,
  userId: string = "default"
): ScalpJournalTrade[] {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const trades: ScalpJournalTrade[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    if (values.every((v) => !v)) continue;
    const record: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = values[c] ?? "";
    }
    trades.push(normalizeImportedTrade(record, userId, "CSV", i - 1));
  }

  return trades;
}

interface PdfSlideExtractResponse {
  trades: Array<{
    slideNumber: number;
    tradeDate: string;
    entryTimeET: string;
    instrument: "NQ" | "MNQ";
    direction: "LONG" | "SHORT";
    contracts: number;
    sessionWindow: SessionWindow;
    setupArchetype: ScalpSetupArchetype;
    stopPts: number;
    tp1Pts: number | null;
    realizedR: number;
    mfePts: number;
    maePts: number;
    gexRegime: string;
    playbookArchetype: string;
    executionGrade: string;
    mistakeTags: string[];
    traderNotes: string;
  }>;
}

/**
 * Parses an exported Google Slides PDF ("1 slide with notes") using Gemini multimodal
 * document understanding (PAGE_IMAGE + PAGE_TEXT) into structured ScalpJournalTrade records.
 */
export async function parseJournalPdfSlides(params: {
  pdfBuffer: Buffer;
  apiKey: string;
  userId: string;
}): Promise<ScalpJournalTrade[]> {
  const google = createGoogle({ apiKey: params.apiKey });

  const runPdfExtract = (modelId: string) =>
    generateObject({
      model: google(modelId),
      schema: jsonSchema<PdfSlideExtractResponse>({
        type: "object",
        properties: {
          trades: {
            type: "array",
            items: {
              type: "object",
              properties: {
                slideNumber: { type: "number" },
                tradeDate: { type: "string" },
                entryTimeET: { type: "string" },
                instrument: { type: "string", enum: ["NQ", "MNQ"] },
                direction: { type: "string", enum: ["LONG", "SHORT"] },
                contracts: { type: "number" },
                sessionWindow: {
                  type: "string",
                  enum: [
                    "NY_OPEN_0930_1000",
                    "NY_AM_1000_1130",
                    "NY_LUNCH_1130_1330",
                    "NY_PM_1330_1600",
                    "OVERNIGHT_GLOBEX",
                  ],
                },
                setupArchetype: {
                  type: "string",
                  enum: [
                    "SWEEP_MSS_REVERSAL",
                    "RETRACE_CONTINUATION",
                    "VWAP_ONMID_PULLBACK",
                    "OPEN_RANGE_BREAK",
                    "UNKNOWN",
                  ],
                },
                stopPts: { type: "number" },
                tp1Pts: { type: "number" },
                realizedR: { type: "number" },
                mfePts: { type: "number" },
                maePts: { type: "number" },
                gexRegime: { type: "string" },
                playbookArchetype: { type: "string" },
                executionGrade: { type: "string" },
                mistakeTags: { type: "array", items: { type: "string" } },
                traderNotes: { type: "string" },
              },
              required: [
                "slideNumber",
                "tradeDate",
                "entryTimeET",
                "instrument",
                "direction",
                "contracts",
                "sessionWindow",
                "setupArchetype",
                "stopPts",
                "realizedR",
                "mfePts",
                "maePts",
                "gexRegime",
                "playbookArchetype",
                "executionGrade",
                "mistakeTags",
                "traderNotes",
              ],
            },
          },
        },
        required: ["trades"],
      }),
      providerOptions: getGoogleThinkingOptions(modelId),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract every NQ/MNQ futures trade slide from this Google Slides trade journal PDF (each page has a chart screenshot and speaker notes below it).
Rules:
- One entry per trade slide (skip cover/summary slides with no trade).
- Infer setupArchetype strictly into: SWEEP_MSS_REVERSAL, RETRACE_CONTINUATION, VWAP_ONMID_PULLBACK, OPEN_RANGE_BREAK, or UNKNOWN.
- Infer sessionWindow from entryTimeET in America/New_York: NY_OPEN_0930_1000, NY_AM_1000_1130, NY_LUNCH_1130_1330, NY_PM_1330_1600, or OVERNIGHT_GLOBEX.
- Extract stopPts, tp1Pts (or null), realizedR (negative for losses), mfePts, maePts, gexRegime (POSITIVE_GAMMA / NEGATIVE_GAMMA / UNAVAILABLE), playbookArchetype, executionGrade (A/B/C/D/F), concise mistakeTags[], and the trader's key lesson/mistake in traderNotes.`,
            },
            {
              type: "file",
              data: params.pdfBuffer,
              mediaType: "application/pdf",
              providerOptions: {
                google: {
                  documentMetadata: {
                    contentLayers: ["PAGE_IMAGE", "PAGE_TEXT"],
                  },
                },
              },
            },
          ],
        },
      ],
    });

  const candidates = Array.from(new Set([CHAT_MODEL_ID, ...CHAT_FALLBACK_MODELS]));
  let object: PdfSlideExtractResponse | null = null;
  let lastErr: unknown;

  for (const modelId of candidates) {
    try {
      ({ object } = await runPdfExtract(modelId));
      break;
    } catch (err) {
      lastErr = err;
      const msg = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
      if (msg.includes("api_key_invalid") || msg.includes("api key not valid")) {
        throw err;
      }
      const retryable =
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("rate limit") ||
        msg.includes("no longer available") ||
        msg.includes("not found") ||
        msg.includes("deprecated") ||
        msg.includes("unavailable") ||
        msg.includes("invalid argument") ||
        msg.includes("404") ||
        msg.includes("503");
      if (!retryable) throw err;
    }
  }

  if (!object) {
    throw lastErr instanceof Error ? lastErr : new Error("Failed to parse PDF slides");
  }

  return (object.trades || []).map((t, idx) =>
    normalizeImportedTrade(t as unknown as Record<string, unknown>, params.userId, "PDF_SLIDES", idx)
  );
}

/**
 * Optional Google Slides API sync stub behind ENABLE_GOOGLE_SLIDES_SYNC=true.
 * Uses presentations.pages.getThumbnail + speaker notes extraction interface.
 */
export async function syncGoogleSlidesJournalStub(params: {
  presentationId: string;
  userId: string;
}): Promise<{ enabled: boolean; trades: ScalpJournalTrade[]; message: string }> {
  if (process.env.ENABLE_GOOGLE_SLIDES_SYNC !== "true") {
    return {
      enabled: false,
      trades: [],
      message:
        "Google Slides API sync is disabled. Set ENABLE_GOOGLE_SLIDES_SYNC=true and Google OAuth credentials, or export Slides as PDF (1 slide with notes).",
    };
  }
  return {
    enabled: true,
    trades: [],
    message: `Google Slides API sync stub ready for presentation ${params.presentationId}. Use PDF export (1 slide with notes) for immediate zero-OAuth ingestion.`,
  };
}

export async function saveImportedJournalTrades(
  trades: ScalpJournalTrade[],
  userId: string = "default"
): Promise<ScalpJournalTrade[]> {
  if (trades.length === 0) return [];
  const normalized = trades.map((t, idx) =>
    normalizeImportedTrade(t as unknown as Record<string, unknown>, userId, t.importSource || "MANUAL", idx)
  );

  const supabase = await createClient();
  if (supabase && userId && userId !== "default") {
    const rows = normalized.map((t) => ({
      user_id: userId,
      trade_date: t.tradeDate,
      symbol: t.instrument,
      instrument: t.instrument,
      direction: t.direction,
      contracts: t.contracts,
      entry_time_et: t.entryTimeET || "09:35:00",
      exit_time_et: t.entryTimeET || "09:45:00",
      entry_price: 0,
      stop_price: 0,
      exit_price: 0,
      target_price: 0,
      pnl_usd: 0,
      actual_pnl_dollars: 0,
      actual_r: t.realizedR,
      actual_pnl_r: t.realizedR,
      mae_r: t.stopPts > 0 ? Math.round((t.maePts / t.stopPts) * 100) / 100 : 0,
      mfe_r: t.stopPts > 0 ? Math.round((t.mfePts / t.stopPts) * 100) / 100 : 0,
      stopped_out: t.realizedR < 0,
      retrace_level_used: t.setupArchetype,
      notes: t.traderNotes,
      slide_number: t.slideNumber,
      session_window: t.sessionWindow,
      setup_archetype: t.setupArchetype,
      stop_pts: t.stopPts,
      tp1_pts: t.tp1Pts,
      realized_r: t.realizedR,
      mfe_pts: t.mfePts,
      mae_pts: t.maePts,
      gex_regime: t.gexRegime,
      playbook_archetype: t.playbookArchetype,
      execution_grade: t.executionGrade,
      mistake_tags: t.mistakeTags,
      trader_notes: t.traderNotes,
      import_source: t.importSource || "MANUAL",
    }));

    const { error } = await supabase.from("journal_trades").insert(rows);
    if (!error) {
      return normalized;
    }
    console.warn("Supabase scalp journal insert fallback to SQLite:", error.message);
  }

  return upsertScalpJournalTrades(normalized);
}

export async function loadUserScalpJournalTrades(
  userId: string = "default"
): Promise<ScalpJournalTrade[]> {
  const supabase = await createClient();
  if (supabase && userId && userId !== "default") {
    const { data, error } = await supabase
      .from("journal_trades")
      .select("*")
      .eq("user_id", userId)
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map((r, idx) =>
        normalizeImportedTrade(
          {
            id: r.id,
            slideNumber: r.slide_number,
            tradeDate: r.trade_date,
            entryTimeET: r.entry_time_et,
            instrument: r.instrument || r.symbol,
            direction: r.direction,
            contracts: r.contracts,
            sessionWindow: r.session_window,
            setupArchetype: r.setup_archetype || r.retrace_level_used,
            stopPts: r.stop_pts ?? 14,
            tp1Pts: r.tp1_pts,
            realizedR: r.realized_r ?? r.actual_pnl_r ?? 0,
            mfePts: r.mfe_pts ?? 0,
            maePts: r.mae_pts ?? 0,
            gexRegime: r.gex_regime,
            playbookArchetype: r.playbook_archetype,
            executionGrade: r.execution_grade,
            mistakeTags: r.mistake_tags,
            traderNotes: r.trader_notes || r.notes,
          },
          userId,
          (r.import_source as ScalpJournalTrade["importSource"]) || "MANUAL",
          idx
        )
      );
    }
  }

  const sqliteTrades = getScalpJournalTrades(userId);
  if (sqliteTrades.length > 0) return sqliteTrades;

  // Bridge legacy SQLite trades if no imported scalp trades exist yet
  const legacy = getLegacySqliteTrades(userId);
  return legacy.map((t, idx) =>
    normalizeImportedTrade(
      {
        id: t.id,
        tradeDate: t.tradeDate,
        entryTimeET: t.entryTimeET,
        instrument: t.symbol,
        direction: t.direction === "SHORT" ? "SHORT" : "LONG",
        contracts: t.contracts,
        setupArchetype: t.retraceLevelUsed,
        stopPts: Math.abs(t.entryPrice - t.stopPrice) || 14,
        tp1Pts: Math.abs(t.targetPrice - t.entryPrice) || null,
        realizedR: t.actualPnlR,
        mfePts: Math.abs(t.entryPrice - t.stopPrice) * t.mfeR,
        maePts: Math.abs(t.entryPrice - t.stopPrice) * t.maeR,
        gexRegime: "UNAVAILABLE",
        playbookArchetype: t.biasVerdictSnapshot || "UNKNOWN",
        executionGrade: t.actualPnlR > 0 ? "A" : "C",
        mistakeTags: [],
        traderNotes: t.notes,
      },
      userId,
      "MANUAL",
      idx
    )
  );
}

export interface QueryPersonalJournalInput {
  setupArchetype: ScalpSetupArchetype | string;
  gexRegime?: string;
  playbookArchetype?: string;
  sessionWindow: SessionWindow | string;
  sessionStreak?: number;
  userId?: string;
  tradesOverride?: ScalpJournalTrade[];
}

/**
 * Pure deterministic personal journal analyzer with Bayesian shrinkage & Tilt detection.
 */
export function computeJournalQueryFromTrades(
  allTrades: ScalpJournalTrade[],
  input: Omit<QueryPersonalJournalInput, "userId" | "tradesOverride">
): JournalQueryResult {
  const totalCount = allTrades.length;
  const overallWins = allTrades.filter((t) => t.realizedR > 0).length;
  const overallWinRate = totalCount > 0 ? overallWins / totalCount : 0.45;
  const overallWinRatePct = Math.round(overallWinRate * 1000) / 10;

  const targetSetup = normalizeSetupArchetype(input.setupArchetype);
  const targetGex = normalizeGexRegime(input.gexRegime);
  const targetPlaybook = (input.playbookArchetype || "UNKNOWN").toUpperCase();
  const targetWindow = (input.sessionWindow || "NY_OPEN_0930_1000").toUpperCase();

  // Score similarity for every trade
  const scored = allTrades.map((t) => {
    let score = 0;
    const tSetup = normalizeSetupArchetype(t.setupArchetype);
    const tGex = normalizeGexRegime(t.gexRegime);
    const tPlaybook = (t.playbookArchetype || "UNKNOWN").toUpperCase();
    const tWindow = (t.sessionWindow || "").toUpperCase();

    if (targetSetup !== "UNKNOWN" && tSetup === targetSetup) score += 4;
    if (targetGex !== "UNAVAILABLE" && tGex === targetGex) score += 2;
    if (targetPlaybook !== "UNKNOWN" && tPlaybook === targetPlaybook) score += 2;
    if (tWindow === targetWindow) score += 2;
    return { trade: t, score };
  });

  // Exact/primary matched pool: trades matching setupArchetype (or window if setup UNKNOWN)
  let matched = scored
    .filter((s) =>
      targetSetup !== "UNKNOWN"
        ? normalizeSetupArchetype(s.trade.setupArchetype) === targetSetup
        : (s.trade.sessionWindow || "").toUpperCase() === targetWindow
    )
    .sort((a, b) => b.score - a.score);

  // If 4+ exact contextual matches exist (setup + gex/window), prefer those; else use all setup matches
  const tightMatches = matched.filter((m) => m.score >= 6);
  if (tightMatches.length >= 3) {
    matched = tightMatches;
  }

  const matchedTrades = matched.map((m) => m.trade);
  const n = matchedTrades.length;
  const matchedWins = matchedTrades.filter((t) => t.realizedR > 0).length;
  const empiricalWinRate = n > 0 ? matchedWins / n : null;
  const empiricalWinRatePct =
    empiricalWinRate !== null ? Math.round(empiricalWinRate * 1000) / 10 : null;

  // Fall back strictly to 45% if overall journal trades < 5;
  // otherwise apply Bayesian shrinkage toward overall journal WR when setup n < 10.
  const priorWinRate = overallWinRate;
  const priorWeight = 5;
  let shrunkWinRate: number;
  let winRateSource: JournalQueryResult["winRateSource"];

  if (totalCount < 5) {
    shrunkWinRate = 0.45;
    winRateSource = "BASELINE_45PCT";
  } else if (n >= 10 && empiricalWinRate !== null) {
    shrunkWinRate = empiricalWinRate;
    winRateSource = "JOURNAL_EMPIRICAL";
  } else {
    // n < 10 with >= 5 overall trades: shrink empirical wins toward overall journal WR
    shrunkWinRate = (matchedWins + priorWeight * priorWinRate) / (n + priorWeight);
    winRateSource = "JOURNAL_SHRUNK";
  }

  const shrunkWinRatePct = Math.round(shrunkWinRate * 1000) / 10;

  const avgMatchedR =
    n > 0 ? matchedTrades.reduce((s, t) => s + t.realizedR, 0) / n : null;
  const overallAvgR =
    totalCount > 0 ? allTrades.reduce((s, t) => s + t.realizedR, 0) / totalCount : 0;
  const shrunkAvgR =
    avgMatchedR !== null
      ? n >= 10
        ? avgMatchedR
        : (avgMatchedR * n + overallAvgR * priorWeight) / (n + priorWeight)
      : totalCount >= 5
      ? overallAvgR
      : 0;
  const avgRealizedR = Math.round(shrunkAvgR * 100) / 100;

  // Top 2-3 most relevant past trades
  const topScored = (matched.length > 0 ? matched : scored.sort((a, b) => b.score - a.score)).slice(
    0,
    3
  );
  const relevantTrades = topScored.map(({ trade }) => {
    const rawNote =
      trade.traderNotes ||
      (trade.mistakeTags.length > 0 ? `Tags: ${trade.mistakeTags.join(", ")}` : "No note logged");
    const shortNote = rawNote.length > 90 ? `${rawNote.slice(0, 87).trimEnd()}...` : rawNote;
    return {
      id: trade.id,
      tradeDate: trade.tradeDate,
      setupArchetype: trade.setupArchetype,
      sessionWindow: trade.sessionWindow,
      gexRegime: trade.gexRegime,
      realizedR: trade.realizedR,
      executionGrade: trade.executionGrade,
      mistakeTags: trade.mistakeTags,
      shortNote,
    };
  });

  // Streak & session-window tilt detection
  let recentConsecutiveLosses = 0;
  for (const t of allTrades) {
    if (t.realizedR < 0) recentConsecutiveLosses++;
    else break;
  }
  const streakFromParam =
    typeof input.sessionStreak === "number" && input.sessionStreak < 0
      ? Math.abs(input.sessionStreak)
      : 0;
  const consecutiveLosses = Math.max(recentConsecutiveLosses, streakFromParam);

  let outsideProfitableWindow = false;
  if (totalCount >= 5) {
    const windowTrades = allTrades.filter(
      (t) => (t.sessionWindow || "").toUpperCase() === targetWindow
    );
    if (windowTrades.length >= 3) {
      const winR = windowTrades.reduce((s, t) => s + t.realizedR, 0) / windowTrades.length;
      if (winR < 0) outsideProfitableWindow = true;
    } else if (windowTrades.length === 0) {
      // Check if user has a clear profitable window elsewhere (e.g. NY_OPEN)
      const hasProfitableHistory = allTrades.some((t) => t.realizedR > 0);
      if (hasProfitableHistory && targetWindow === "NY_LUNCH_1130_1330") {
        outsideProfitableWindow = true;
      }
    }
  }

  const tiltReasons: string[] = [];
  if (consecutiveLosses >= 2) {
    tiltReasons.push(`${consecutiveLosses} consecutive losses`);
  }
  if (outsideProfitableWindow) {
    tiltReasons.push(`outside historically profitable window (${targetWindow})`);
  }

  return {
    matchedCount: n,
    overallTotalTrades: totalCount,
    overallWinRatePct,
    empiricalWinRatePct,
    shrunkWinRatePct,
    winRateSource,
    avgRealizedR,
    relevantTrades,
    tiltWarning: tiltReasons.length > 0,
    tiltReason: tiltReasons.length > 0 ? tiltReasons.join("; ") : null,
    consecutiveLosses,
    outsideProfitableWindow,
  };
}

export async function queryPersonalJournal(
  input: QueryPersonalJournalInput
): Promise<JournalQueryResult> {
  const trades =
    input.tradesOverride ?? (await loadUserScalpJournalTrades(input.userId || "default"));
  return computeJournalQueryFromTrades(trades, input);
}
