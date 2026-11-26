import { createGoogle } from "@ai-sdk/google";
import {
  generateObject,
  jsonSchema,
  streamText,
  type ModelMessage,
} from "ai";
import {
  CHAT_FALLBACK_MODEL_ID,
  CHAT_MODEL_ID,
  ChatMarketContextSnapshot,
  ChatMode,
  ChatModePreference,
  ExtractedChartState,
  JournalQueryResult,
  ScalpAccountProfile,
} from "@/types/chat";
import { getETParts } from "@/lib/market/sessionClock";
import {
  computeScalpVerdict,
  type ScalpVerdictResult,
} from "@/lib/chat/screenshot-quant";
import { queryPersonalJournal } from "@/lib/chat/journal-ingest";

export { computeScalpVerdict, queryPersonalJournal };

export const STATIC_SCALP_SYSTEM_PREFIX = `You are MinBook Scalping Co-Pilot — a low-latency, mathematically honest NQ/MNQ futures scalping engine grounded in the trader's personal journal, dealer GEX, and diurnal volatility.
RULES:
1. Never invent or alter R:R, double-barrier probabilities, stop distances, or contract sizing — echo the deterministic quant verdict verbatim.
2. Always honor the live screenshot price re-anchoring and flag stale backend feeds (>90s lag).
3. In LIVE_SCALP mode, output ONLY the exact 5-line Scalper Card with zero preamble, zero extra headers, and zero trailing notes.`;

/**
 * Two-Mode Chat Router:
 * - DEEP_DIVE if user text contains "explain", "deep dive", or "review"
 * - Or explicit modePreference ("LIVE_SCALP" | "DEEP_DIVE")
 * - Otherwise LIVE_SCALP during 09:20–16:00 ET, DEEP_DIVE outside RTH
 */
export function resolveChatMode(params: {
  userText: string;
  modePreference?: ChatModePreference;
  minutesET?: number;
}): ChatMode {
  const lower = (params.userText || "").toLowerCase();
  if (
    lower.includes("explain") ||
    lower.includes("deep dive") ||
    lower.includes("review")
  ) {
    return "DEEP_DIVE";
  }

  if (params.modePreference === "LIVE_SCALP" || params.modePreference === "DEEP_DIVE") {
    return params.modePreference;
  }

  let mins = params.minutesET;
  if (mins === undefined) {
    const et = getETParts(new Date());
    mins = et.hour * 60 + et.minute;
  }

  // 09:20–16:00 ET (560..960) defaults to LIVE_SCALP
  return mins >= 560 && mins <= 960 ? "LIVE_SCALP" : "DEEP_DIVE";
}

/**
 * Returns true when a text-only prompt is a conversational / planning / calendar / advisory
 * question rather than a live chart screenshot or explicit entry/SL/TP scalper-card check.
 */
export function isConversationalAssistantQuery(
  userText: string,
  hasImages: boolean
): boolean {
  if (hasImages) return false;
  const text = (userText || "").trim();
  if (!text) return false;
  const hasExplicitSetupNumbers =
    /\b(long|short|buy|sell|limit|entry)\b.{0,24}\d{4,5}/i.test(text) &&
    /\b(sl|stop|tp|target|risk)\b/i.test(text);
  const asksForCard = /\b(scalper card|5-line|5 line)\b/i.test(text);
  return !hasExplicitSetupNumbers && !asksForCard;
}

/**
 * Detects upstream HTTP 429 / rate-limit / quota exhaustion errors.
 */
export function isRateLimitError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted") ||
    msg.includes("too many requests")
  );
}

/**
 * Step 1: Strict JSON multimodal chart state extraction (`extract_chart_state(image)`).
 * Uses gemini-2.5-flash-lite first and falls back to gemini-2.5-flash on 429.
 */
export async function extractChartState(params: {
  apiKey: string;
  imageUrls: string[];
  userText: string;
  snapshot: ChatMarketContextSnapshot;
  modelId?: string;
}): Promise<ExtractedChartState> {
  const google = createGoogle({ apiKey: params.apiKey });

  const contentParts: Array<
    { type: "text"; text: string } | { type: "image"; image: string }
  > = [
    {
      type: "text",
      text: `Extract the exact chart & order state from the uploaded trading screenshot(s) as strict JSON.
User note: "${params.userText || "Analyze setup"}"
Fallback instrument if unclear: ${params.snapshot.instrument}. Fallback price only if unreadable: ${params.snapshot.quote.price}.
Classify detectedSetupArchetype into: SWEEP_MSS_REVERSAL, RETRACE_CONTINUATION, VWAP_ONMID_PULLBACK, OPEN_RANGE_BREAK, or UNKNOWN.
Classify orderState into: OPEN_POSITION, PENDING_LIMIT_ORDER, MARKET_ENTRY_NOW, or ANALYSIS_ONLY.
Classify newsImpact: RED_HIGH only for CPI/NFP/FOMC/PCE/PPI/GDP/Retail Sales/ISM; ORANGE_MEDIUM/YELLOW_LOW for housing/PMI/New Home Sales.`,
    },
  ];

  for (const url of params.imageUrls) {
    contentParts.push({ type: "image", image: url });
  }

  const runExtract = async (modelId: string) =>
    generateObject({
      model: google(modelId),
      schema: jsonSchema<ExtractedChartState>({
        type: "object",
        properties: {
          instrument: { type: "string", enum: ["NQ", "MNQ"] },
          liveSpot: { type: "number" },
          timeframe: { type: "string" },
          orderState: {
            type: "string",
            enum: [
              "OPEN_POSITION",
              "PENDING_LIMIT_ORDER",
              "MARKET_ENTRY_NOW",
              "ANALYSIS_ONLY",
            ],
          },
          direction: { type: "string", enum: ["LONG", "SHORT", "NONE"] },
          entryPx: { type: ["number", "null"] },
          entryZoneLow: { type: ["number", "null"] },
          entryZoneHigh: { type: ["number", "null"] },
          stopPx: { type: ["number", "null"] },
          tp1Px: { type: ["number", "null"] },
          tp2Px: { type: ["number", "null"] },
          contracts: { type: "number" },
          detectedSetupArchetype: {
            type: "string",
            enum: [
              "SWEEP_MSS_REVERSAL",
              "RETRACE_CONTINUATION",
              "VWAP_ONMID_PULLBACK",
              "OPEN_RANGE_BREAK",
              "UNKNOWN",
            ],
          },
          visibleKeyLevels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                price: { type: "number" },
              },
              required: ["label", "price"],
            },
          },
          newsCountdownMinutes: { type: ["number", "null"] },
          newsImpact: {
            type: "string",
            enum: ["RED_HIGH", "ORANGE_MEDIUM", "YELLOW_LOW", "UNKNOWN"],
          },
          newsEventName: { type: ["string", "null"] },
          accountBalance: { type: ["number", "null"] },
          openPnlDollars: { type: ["number", "null"] },
        },
        required: [
          "instrument",
          "liveSpot",
          "timeframe",
          "orderState",
          "direction",
          "contracts",
          "detectedSetupArchetype",
          "visibleKeyLevels",
        ],
      }),
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 0,
            includeThoughts: false,
          },
        },
      },
      messages: [{ role: "user", content: contentParts }],
    });

  const primaryModel = params.modelId || CHAT_MODEL_ID;
  let object: ExtractedChartState;
  try {
    ({ object } = await runExtract(primaryModel));
  } catch (err) {
    if (primaryModel !== CHAT_FALLBACK_MODEL_ID && isRateLimitError(err)) {
      ({ object } = await runExtract(CHAT_FALLBACK_MODEL_ID));
    } else {
      throw err;
    }
  }

  return {
    ...object,
    liveSpot:
      typeof object.liveSpot === "number" && object.liveSpot > 0
        ? object.liveSpot
        : params.snapshot.quote.price,
    contracts:
      typeof object.contracts === "number" && object.contracts > 0
        ? Math.round(object.contracts)
        : 1,
    entryPx: object.entryPx ?? null,
    entryZoneLow: object.entryZoneLow ?? null,
    entryZoneHigh: object.entryZoneHigh ?? null,
    stopPx: object.stopPx ?? null,
    tp1Px: object.tp1Px ?? null,
    tp2Px: object.tp2Px ?? null,
    visibleKeyLevels: Array.isArray(object.visibleKeyLevels) ? object.visibleKeyLevels : [],
  };
}

/**
 * Formats the exact 5-line Scalper Card deterministically from verdict + journal precedent.
 */
export function formatScalperCard5Lines(
  verdict: ScalpVerdictResult,
  journal: JournalQueryResult
): string {
  const dirLabel =
    verdict.direction !== "NONE"
      ? verdict.direction
      : verdict.liveBiasAtScreenshot.direction;
  const setupLabel = verdict.detectedSetupArchetype;
  const entryDisplay = (verdict.entryPrice ?? verdict.screenshotCurrentPrice).toFixed(2);
  const spotDisplay = verdict.screenshotCurrentPrice.toFixed(2);
  const deltaSign = verdict.feedDeltaPts >= 0 ? "+" : "";
  const staleSuffix = verdict.isStaleBackendFeed
    ? ` [STALE ${verdict.feedLagSeconds}s]`
    : "";

  const slPts = verdict.stopDistancePts ?? verdict.volatilityScaledStop.recommendedPts;
  const mnqRiskPerContract = Math.round(slPts * 2 * 100) / 100;
  const tp1Pts =
    verdict.targetDistancePts ??
    (verdict.takeProfitTargets[0]
      ? Math.abs(verdict.takeProfitTargets[0].distanceFromScreenshotPts)
      : Math.round(slPts * 1.2 * 10) / 10);
  const r1 = slPts > 0 ? (tp1Pts / slPts).toFixed(2) : "1.20";
  const hit1 = verdict.doubleBarrierOdds
    ? verdict.doubleBarrierOdds.tp1HitBeforeSlPct15m.toFixed(1)
    : "50.0";
  const tp2Target = verdict.takeProfitTargets[1];
  const tp2Pts = tp2Target
    ? Math.abs(tp2Target.distanceFromScreenshotPts).toFixed(1)
    : (slPts * 2.0).toFixed(1);
  const r2 = slPts > 0 ? (Number(tp2Pts) / slPts).toFixed(2) : "2.00";
  const stretchPct = (
    verdict.diurnalEm.pullbackStretchPct ??
    verdict.diurnalEm.targetStretchPct ??
    0
  ).toFixed(0);

  const magnetStr = verdict.blockingMagnet
    ? `${verdict.blockingMagnet.shortName} @ ${verdict.blockingMagnet.price.toFixed(2)} (${Math.abs(verdict.blockingMagnet.distanceFromScreenshotPts).toFixed(1)} pts)`
    : "Clear path";
  const gexShort =
    verdict.netGammaRegime === "POSITIVE_GAMMA"
      ? "+Gamma"
      : verdict.netGammaRegime === "NEGATIVE_GAMMA"
      ? "-Gamma"
      : "GEX N/A";
  const playbookShort = verdict.isStaleBackendFeed
    ? "HTF/Macro (1m suppressed)"
    : verdict.liveBiasAtScreenshot.direction;

  const topNote =
    journal.relevantTrades[0]?.shortNote || "No prior note logged yet";
  const tiltBadge = journal.tiltWarning ? " [TILT WARNING]" : "";

  const line1 = `1. **Verdict & Re-Anchor:** [${verdict.verdictAction}] • ${dirLabel} ${setupLabel} @ ${entryDisplay} | Spot ${spotDisplay} (Yahoo lag: ${deltaSign}${verdict.feedDeltaPts.toFixed(1)} pts re-anchored${staleSuffix})`;
  const line2 = `2. **Double-Barrier Edge:** SL ${slPts.toFixed(1)} pts (-$${mnqRiskPerContract.toFixed(0)}/MNQ) • TP1 +${tp1Pts.toFixed(1)} pts (${r1}R, ${hit1}% before SL) • TP2 +${tp2Pts} pts (${r2}R) • Diurnal Stretch: ${stretchPct}%`;
  const line3 = `3. **Structure & Regime:** Blocking Magnet: ${magnetStr} • Regime: ${gexShort}/${playbookShort} • Next Red News: ${verdict.nextRedNewsLabel}`;
  const line4 = `4. **Journal Precedent:** Your Journal (${setupLabel} + ${gexShort}): ${journal.shrunkWinRatePct.toFixed(1)}% WR / ${journal.avgRealizedR >= 0 ? "+" : ""}${journal.avgRealizedR.toFixed(2)}R EV (n=${journal.matchedCount}) • Past Note: "${topNote}"${tiltBadge}`;
  const line5 = `5. **Exit Directive (${verdict.accountDrawdownMode}):** ${verdict.exitDirective.summaryLine}`;

  return [line1, line2, line3, line4, line5].join("\n");
}

/**
 * Deterministic renderer for unit tests and Hot Path fallback.
 */
export function renderScalperCardDeterministic(
  verdict: ScalpVerdictResult,
  journal: JournalQueryResult,
  mode: ChatMode
): { text: string; maxOutputTokens: number; lineCount: number } {
  const card = formatScalperCard5Lines(verdict, journal);
  if (mode === "LIVE_SCALP") {
    return {
      text: card,
      maxOutputTokens: 280,
      lineCount: card.split("\n").length,
    };
  }
  const sizingSummary = verdict.mnqSizingTable
    .map((u) => `$${u.riskBudgetDollars}: ${u.mnqContracts} MNQ`)
    .join(" | ");
  const deepDive = `${card}\n\n### Deep Dive Breakdown\n- **MNQ Sizing:** ${sizingSummary}\n- **Volatility-Scaled Stop Window:** ${verdict.volatilityScaledStop.minPts.toFixed(1)}–${verdict.volatilityScaledStop.maxPts.toFixed(1)} pts (ideal ${verdict.volatilityScaledStop.recommendedPts.toFixed(1)} pts on ${verdict.volatilityScaledStop.atr5mDiurnalPts.toFixed(1)} pt 5m diurnal ATR)\n- **Diurnal EM (sqrt(252)):** Daily Straddle ±${verdict.diurnalEm.fullDayStraddle.toFixed(1)} pts | Remaining RTH Straddle ±${verdict.diurnalEm.remainingStraddle.toFixed(1)} pts (${(verdict.diurnalEm.diurnalScaleFactor * 100).toFixed(0)}% clock)\n- **Relevant Journal Precedents:** ${
    journal.relevantTrades.length > 0
      ? journal.relevantTrades
          .map(
            (t) =>
              `${t.tradeDate} ${t.setupArchetype} (${t.realizedR >= 0 ? "+" : ""}${t.realizedR.toFixed(2)}R, Grade ${t.executionGrade}): "${t.shortNote}"`
          )
          .join(" ; ")
      : "None yet — upload your Google Slides PDF journal."
  }`;
  return {
    text: deepDive,
    maxOutputTokens: 1400,
    lineCount: deepDive.split("\n").length,
  };
}

/**
 * Step 4: Streams either the ultra-fast 5-line LIVE_SCALP card (thinking disabled, max 280 tokens)
 * or the DEEP_DIVE analytical breakdown via Gemini 2.5 Flash-Lite (or fallback model).
 */
export function renderScalperCardStream(params: {
  apiKey: string;
  mode: ChatMode;
  verdict: ScalpVerdictResult;
  journal: JournalQueryResult;
  systemPrompt: string;
  messages: ModelMessage[];
  modelId?: string;
}) {
  const google = createGoogle({ apiKey: params.apiKey });
  const deterministicCard = formatScalperCard5Lines(verdictFix(params.verdict), params.journal);
  const modelToUse = params.modelId || CHAT_MODEL_ID;

  if (params.mode === "LIVE_SCALP") {
    return streamText({
      model: google(modelToUse),
      system: STATIC_SCALP_SYSTEM_PREFIX,
      maxOutputTokens: 280,
      temperature: 0,
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 0,
            includeThoughts: false,
          },
        },
      },
      messages: [
        {
          role: "user",
          content: `Output the following 5-line Scalper Card verbatim with zero preamble, zero extra lines, and zero commentary:\n\n${deterministicCard}`,
        },
      ],
    });
  }

  // Cold Path: DEEP_DIVE
  const deepContext = `${STATIC_SCALP_SYSTEM_PREFIX}

${params.systemPrompt}

## DETERMINISTIC 4-STEP SCALP VERDICT & JOURNAL GROUNDING
${deterministicCard}

### Extended Quant Metrics
- Diurnal EM (sqrt(252)): Full-Day 1SD ±${params.verdict.diurnalEm.fullDay1SD.toFixed(1)} pts | Full-Day Straddle ±${params.verdict.diurnalEm.fullDayStraddle.toFixed(1)} pts | Remaining RTH Straddle ±${params.verdict.diurnalEm.remainingStraddle.toFixed(1)} pts
- Volatility-Scaled Stop Sanity: [${params.verdict.volatilityScaledStop.minPts.toFixed(1)}, ${params.verdict.volatilityScaledStop.maxPts.toFixed(1)}] pts (recommended ${params.verdict.volatilityScaledStop.recommendedPts.toFixed(1)} pts) | Status: ${params.verdict.volatilityScaledStop.status}
- MNQ Contract Sizing Table: ${params.verdict.mnqSizingTable.map((u) => `$${u.riskBudgetDollars}=${u.mnqContracts} MNQ`).join(", ")}
- Stale Backend Feed (>90s): ${params.verdict.isStaleBackendFeed ? `YES (${params.verdict.feedLagSeconds}s — 1m flow suppressed)` : "NO"}
- Journal Precedents (${params.journal.matchedCount} matched / ${params.journal.overallTotalTrades} total): ${JSON.stringify(params.journal.relevantTrades)}

Provide a clear DEEP_DIVE response starting with the 5-line Scalper Card, followed by concise sections for: Alternative Entry Zones, Volatility & Double-Barrier Diagnostics, Prop-Firm Drawdown Management (${params.verdict.accountDrawdownMode}), and Post-Trade Journaling Debrief.`;

  return streamText({
    model: google(modelToUse),
    instructions: deepContext,
    messages: params.messages,
    maxOutputTokens: 1600,
  });
}

function verdictFix(v: ScalpVerdictResult): ScalpVerdictResult {
  return v;
}

/**
 * Pure TypeScript deterministic responder used automatically whenever Gemini hits 429 / quota
 * so text-only planning, holiday, regime, level, and journal queries NEVER fail with a dead error.
 */
export function buildDeterministicAssistantReply(params: {
  userText: string;
  snapshot: ChatMarketContextSnapshot;
  journal?: JournalQueryResult;
}): string {
  const { userText, snapshot, journal } = params;
  const lower = (userText || "").toLowerCase();
  const schedule = snapshot.session.upcomingSchedule || [];
  const holidaysOrHalfDays = schedule.filter(
    (d) => d.status === "HOLIDAY" || d.status === "HALF_DAY"
  );
  const events = snapshot.upcomingEvents || [];
  const vol = snapshot.volatilityAndMacro;

  const asksAboutSchedule =
    /\b(thurs|thursday|fri|friday|mon|tues|wed|week|tomorrow|holiday|thanksgiving|worth trading|should i trade|news|calendar)\b/i.test(
      lower
    );

  const lines: string[] = [];

  if (asksAboutSchedule && holidaysOrHalfDays.length > 0) {
    const summaryParts = holidaysOrHalfDays.map(
      (d) => `**${d.weekday} (${d.date}) [${d.status}]**: ${d.note}`
    );
    lines.push(
      `Here is the direct read from MinBook's schedule & volatility desk (${snapshot.session.currentETDateTime || snapshot.session.targetTradeDate}):`
    );
    lines.push("");
    for (const part of summaryParts) {
      lines.push(`- ${part}`);
    }
    if (events.length > 0) {
      lines.push("");
      lines.push("**Upcoming US Releases:**");
      for (const ev of events.slice(0, 5)) {
        lines.push(
          `- ${ev.date} ${ev.timeET} [${ev.folderColor}]: ${ev.event}${ev.forecast ? ` (fcst ${ev.forecast})` : ""}`
        );
      }
    }
  } else {
    lines.push(
      `Direct MinBook desk read (**${snapshot.instrument} ${snapshot.quote.price.toFixed(2)}** · \`${snapshot.quote.source}\` | \`${snapshot.quote.stalenessBadge}\`):`
    );
  }

  lines.push("");
  lines.push("**Volatility & Regime Context:**");
  const termNote =
    vol.termRatio > 1.0
      ? `VIX/VIX3M is inverted at **${vol.termRatio.toFixed(2)}** (backwardation) — near-term hedging demand is elevated, which increases stop-sweeps and sharp two-way reversals.`
      : `VIX/VIX3M is at **${vol.termRatio.toFixed(2)}** (${vol.termStructureRegime}), VRP ratio ${vol.vrpRatio.toFixed(2)}.`;
  lines.push(`- ${termNote}`);
  if (snapshot.gex.available) {
    lines.push(
      `- **Dealer GEX:** ${snapshot.gex.netGammaRegime} (Flip ${snapshot.gex.gammaFlipNq}, Call Wall ${snapshot.gex.callWallNq}, Put Wall ${snapshot.gex.putWallNq} | ${snapshot.gex.source}).`
    );
  }

  const topAbove = snapshot.keyLevels
    .filter((l) => l.distancePoints > 0)
    .sort((a, b) => a.distancePoints - b.distancePoints)
    .slice(0, 3);
  const topBelow = snapshot.keyLevels
    .filter((l) => l.distancePoints <= 0)
    .sort((a, b) => b.distancePoints - a.distancePoints)
    .slice(0, 3);

  lines.push("");
  lines.push("**Key Structural Magnets:**");
  if (topAbove.length > 0) {
    lines.push(
      `- Above spot: ${topAbove.map((l) => `${l.shortName} ${l.price.toFixed(2)} (+${l.distancePoints.toFixed(1)})`).join(", ")}`
    );
  }
  if (topBelow.length > 0) {
    lines.push(
      `- Below spot: ${topBelow.map((l) => `${l.shortName} ${l.price.toFixed(2)} (${l.distancePoints.toFixed(1)})`).join(", ")}`
    );
  }

  if (journal && journal.overallTotalTrades > 0) {
    lines.push("");
    lines.push(
      `**Your Journal:** ${journal.overallTotalTrades} logged trades (${journal.overallWinRatePct.toFixed(1)}% overall WR)${journal.tiltWarning ? ` • ⚠️ ${journal.tiltReason}` : ""}.`
    );
  }

  lines.push("");
  if (asksAboutSchedule && holidaysOrHalfDays.length > 0) {
    lines.push(
      `**Action Plan:** Skip full-holiday sessions, treat half-days as thin-liquidity / chop-prone (0.5x size only on an A+ 09:34–09:48 ET sweep & reclaim), and wait for VIX/VIX3M < 1.00 before pushing full size.`
    );
  } else {
    lines.push(
      `**Action Plan:** ${snapshot.regime.riskMultiplier === 0 ? "Stand aside / preserve capital until term structure cools (< 1.00)." : snapshot.regime.singleTradeDirective}`
    );
  }

  lines.push("");
  lines.push(
    `_Served deterministically by MinBook Quant Engine (Gemini free-tier quota limit active)._`
  );

  return lines.join("\n");
}

/**
 * Convenience helper to run Steps 2 + 3 synchronously for text-only or fallback scenarios.
 */
export async function runDeterministicScalpAnalysis(params: {
  chartState: ExtractedChartState;
  snapshot: ChatMarketContextSnapshot;
  accountProfile: ScalpAccountProfile;
  userId: string;
}): Promise<{ verdict: ScalpVerdictResult; journal: JournalQueryResult }> {
  const verdict = computeScalpVerdict(
    params.chartState,
    params.snapshot,
    params.accountProfile
  );
  const journal = await queryPersonalJournal({
    setupArchetype: verdict.detectedSetupArchetype,
    gexRegime: verdict.netGammaRegime,
    playbookArchetype: params.snapshot.regime.archetype,
    sessionWindow: verdict.sessionWindow,
    sessionStreak: params.accountProfile.sessionStreak,
    userId: params.userId,
  });
  return { verdict, journal };
}
