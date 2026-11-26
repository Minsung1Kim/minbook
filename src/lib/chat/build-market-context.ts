import { getOpenBrief } from "@/lib/market/service";
import { getJournalTrades } from "@/lib/journal/store";
import { createClient } from "@/lib/supabase/server";
import { computeJournalAnalyticsFromTrades } from "@/lib/db";
import { getETParts, getUpcomingCalendarSchedule } from "@/lib/market/sessionClock";
import {
  ChatContextLevel,
  ChatJournalSummary,
  ChatMarketContextSnapshot,
  MarketStalenessBadge,
} from "@/types/chat";
import { DataStatus, OpenBriefData } from "@/types/market";
import { STRAT_CORE_PLAYBOOK } from "./strat-reference";

export function resolveStalenessBadge(
  status: DataStatus | string | undefined,
  stalenessSeconds: number
): MarketStalenessBadge {
  if (status === "SAMPLE") return "SAMPLE";
  if (status === "DELAYED") return "DELAYED";
  if (stalenessSeconds > 300) return "STALE";
  return "FRESH";
}

function formatETTimestamp(isoStr: string | undefined): string {
  if (!isoStr) return "Unavailable";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return (
    d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }) + " ET"
  );
}

async function fetchUserRiskSettings(userId?: string): Promise<{
  riskBudgetDollars?: number;
  maxDailyLossDollars?: number;
  maxDailyTrades?: number;
}> {
  // Multi-user neutrality: only load explicit Supabase settings for an authenticated non-default user
  try {
    const supabase = await createClient();
    if (supabase && userId && userId !== "default") {
      const { data } = await supabase
        .from("user_settings")
        .select("risk_budget_dollars, max_daily_loss_dollars, max_daily_trades")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) {
        return {
          riskBudgetDollars: Number(data.risk_budget_dollars),
          maxDailyLossDollars: Number(data.max_daily_loss_dollars),
          maxDailyTrades: Number(data.max_daily_trades),
        };
      }
    }
  } catch (err) {
    console.warn("Could not fetch user_settings from Supabase:", err);
  }

  return {};
}

async function buildJournalSummary(userId?: string): Promise<ChatJournalSummary> {
  try {
    const [trades, riskSettings] = await Promise.all([
      getJournalTrades(userId),
      fetchUserRiskSettings(userId),
    ]);
    const analytics = computeJournalAnalyticsFromTrades(trades);

    return {
      totalTrades: analytics.totalTrades,
      wins: analytics.wins,
      losses: analytics.losses,
      winRatePercent: analytics.winRatePercent,
      totalPnlDollars: analytics.totalPnlDollars,
      avgMaeWinningR: analytics.avgMaeWinningTradesR,
      riskBudgetDollars: riskSettings.riskBudgetDollars,
      maxDailyLossDollars: riskSettings.maxDailyLossDollars,
      maxDailyTrades: riskSettings.maxDailyTrades,
      recentTrades: trades.slice(0, 8).map((t) => ({
        tradeDate: t.tradeDate,
        symbol: t.symbol,
        direction: t.direction,
        actualPnlDollars: t.actualPnlDollars,
        actualPnlR: t.actualPnlR,
        maeR: t.maeR,
        mfeR: t.mfeR,
        retraceLevelUsed: t.retraceLevelUsed,
        notes: t.notes,
      })),
    };
  } catch (err) {
    console.warn("Failed to build journal summary for chat context:", err);
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRatePercent: 0,
      totalPnlDollars: 0,
      avgMaeWinningR: 0,
      recentTrades: [],
    };
  }
}

export function briefToContextSnapshot(
  brief: OpenBriefData,
  journal: ChatJournalSummary
): ChatMarketContextSnapshot {
  const quoteTsMs = Date.parse(brief.quote.timestamp);
  const computedStalenessSec = Number.isFinite(quoteTsMs)
    ? Math.max(0, Math.round((Date.now() - quoteTsMs) / 1000))
    : brief.quote.stalenessSeconds;
  const stalenessSeconds = Math.max(brief.quote.stalenessSeconds ?? 0, computedStalenessSec);
  const quoteBadge = resolveStalenessBadge(brief.quote.status, stalenessSeconds);

  const gexTsMs = brief.gex?.lastUpdated ? Date.parse(brief.gex.lastUpdated) : NaN;
  const gexStalenessSec = Number.isFinite(gexTsMs)
    ? Math.max(0, Math.round((Date.now() - gexTsMs) / 1000))
    : 9999;

  const keyLevels: ChatContextLevel[] = brief.keyLevels.map((lvl) => ({
    name: lvl.name,
    shortName: lvl.shortName,
    price: lvl.price,
    distancePoints: lvl.distancePoints,
    role: lvl.role,
    timeframe: lvl.timeframe,
    source: `${brief.dataSource.providerName} (${brief.dataSource.levelsStatus})`,
    timestamp: brief.quote.timestamp,
    staleness: quoteBadge,
  }));

  if (brief.gex) {
    const gexBadge: MarketStalenessBadge =
      brief.gex.source === "SAMPLE_FALLBACK"
        ? "SAMPLE"
        : gexStalenessSec > 900
        ? "STALE"
        : "DELAYED";
    const gexLevels: Array<{ name: string; shortName: string; price: number; role: string }> = [
      {
        name: "GEX Gamma Flip",
        shortName: "GEX Flip",
        price: brief.gex.gammaFlipNq,
        role: "REGIME PIVOT",
      },
      {
        name: "GEX Call Wall",
        shortName: "Call Wall",
        price: brief.gex.callWallNq,
        role: "DEALER RESISTANCE",
      },
      {
        name: "GEX Put Wall",
        shortName: "Put Wall",
        price: brief.gex.putWallNq,
        role: "DEALER SUPPORT",
      },
    ];
    for (const g of gexLevels) {
      if (Number.isFinite(g.price) && g.price > 0) {
        keyLevels.push({
          name: g.name,
          shortName: g.shortName,
          price: g.price,
          distancePoints: Math.round((g.price - brief.quote.price) * 100) / 100,
          role: g.role,
          timeframe: "OPTIONS",
          source: brief.gex.source,
          timestamp: brief.gex.lastUpdated,
          staleness: gexBadge,
        });
      }
    }
  }

  const now = new Date();
  const etNow = getETParts(now);
  const currentETDateTime = `${etNow.weekday} ${etNow.dateStr} ${etNow.timeStr} ET`;
  const upcomingSchedule = getUpcomingCalendarSchedule(now, 5);
  const upcomingEvents = (brief.macro.events || [])
    .filter((ev) => ev.date >= etNow.dateStr)
    .slice(0, 15)
    .map((ev) => ({
      date: ev.date,
      timeET: ev.timeET,
      event: ev.event,
      impact: ev.impact,
      folderColor: ev.folderColor,
      forecast: ev.forecast,
      previous: ev.previous,
      actual: ev.actual,
      marketImpact: ev.marketImpact,
    }));

  return {
    capturedAt: now.toISOString(),
    instrument: brief.instrument,
    underlyingAsset: brief.underlyingAsset,
    quote: {
      price: brief.quote.price,
      change: brief.quote.change,
      changePercent: brief.quote.changePercent,
      high: brief.quote.high,
      low: brief.quote.low,
      open: brief.quote.open,
      previousClose: brief.quote.previousClose,
      source: brief.quote.source || brief.dataSource.providerName,
      timestamp: brief.quote.timestamp,
      status: brief.quote.status,
      stalenessSeconds,
      stalenessBadge: quoteBadge,
    },
    session: {
      activeSession: brief.sessionInfo?.activeSession || "UNKNOWN",
      activeSessionLabel: brief.sessionInfo?.activeSessionLabel || "CME Futures",
      phase: brief.sessionInfo?.phase || brief.tacticalPlan.sessionPhase,
      targetTradeDate: brief.targetTradeDate || brief.tradeDate,
      priorTradeDate: brief.priorTradeDate || "",
      isMarketOpen: Boolean(brief.sessionInfo?.isMarketOpen),
      countdown: brief.sessionInfo?.activeSessionCountdown || "--",
      currentETDateTime,
      upcomingSchedule,
    },
    upcomingEvents,
    regime: {
      biasVerdict: brief.bias.verdict,
      confidence: brief.bias.confidence,
      htfTrend: brief.bias.htfTrend,
      chopRisk: brief.bias.chopRisk,
      riskMultiplier: brief.bias.regimeRiskMultiplier,
      summary: brief.bias.summary,
      singleTradeDirective: brief.tacticalPlan.singleTradeDirective,
      archetype: brief.tacticalPlan.retraceAnalysis.archetype,
      activeVetoes: brief.bias.layer1RiskGates?.activeVetoes || [],
      vwapMode: brief.sessionMetrics.vwapCalculationMode,
      expectedMoveStraddle: brief.sessionMetrics.expectedMoveStraddle,
      expectedMove1SD: brief.sessionMetrics.expectedMove1SD,
      atrOpen15m: brief.sessionMetrics.atrOpen15m,
      overnightInventory: brief.sessionMetrics.overnightInventory,
      inventoryPercent: brief.sessionMetrics.inventoryPercent,
    },
    volatilityAndMacro: {
      vxn: brief.bias.volatilitySurface?.vxn ?? 0,
      vix: brief.bias.volatilitySurface?.vix ?? brief.macro.vix.value,
      vix3m: brief.bias.volatilitySurface?.vix3m ?? 0,
      termRatio: brief.bias.volatilitySurface?.termRatio ?? 1,
      termStructureRegime: brief.bias.volatilitySurface?.termStructureRegime || "UNKNOWN",
      vvix: brief.bias.volatilitySurface?.vvix ?? 0,
      vrpRatio: brief.bias.volatilitySurface?.vrpRatio ?? 1,
      isNegativeVrp: Boolean(brief.bias.volatilitySurface?.isNegativeVrp),
      macroCorrelationRegime: brief.bias.macroRegime?.macroCorrelationRegime || "UNKNOWN",
      rateSource: brief.bias.macroRegime?.rateSource || "UNAVAILABLE",
      dxyPrice: brief.bias.macroRegime?.dxyPrice ?? brief.macro.dxy.value,
      dxyPercentChange: brief.bias.macroRegime?.dxyPercentChange ?? 0,
    },
    gex: brief.gex
      ? {
          available: true,
          netGammaRegime: brief.gex.netGammaRegime,
          gammaFlipNq: brief.gex.gammaFlipNq,
          callWallNq: brief.gex.callWallNq,
          putWallNq: brief.gex.putWallNq,
          source: brief.gex.source,
          lastUpdated: brief.gex.lastUpdated,
          disclaimer: brief.gex.disclaimer,
        }
      : {
          available: false,
          source: "UNAVAILABLE",
          lastUpdated: "",
          disclaimer: "GEX feed unavailable",
        },
    smt: {
      hasDivergence: Boolean(brief.sessionMetrics.smtDivergence?.hasDivergence),
      divergenceType: brief.sessionMetrics.smtDivergence?.divergenceType || "NONE (SYNCED)",
      direction: brief.sessionMetrics.smtDivergence?.direction || "NEUTRAL",
      notes: brief.sessionMetrics.smtDivergence?.notes || "No active SMT divergence.",
    },
    footprint: brief.footprint
      ? {
          available: true,
          sessionCvd: brief.footprint.sessionCvd,
          rthCvd: brief.footprint.rthCvd,
          lastUpdated: brief.footprint.lastUpdated,
          disclaimer: brief.footprint.disclaimer,
        }
      : {
          available: false,
          disclaimer: "1m derived footprint unavailable",
        },
    keyLevels,
    journal,
    honestyNotice:
      quoteBadge === "SAMPLE"
        ? "WARNING: Live market feed unavailable — structured fallback sample data is loaded. Do NOT treat sample levels as live CME execution prices."
        : quoteBadge === "DELAYED"
        ? "CME 10–15m delayed feed active. Reference pre-calculated structural levels and confirm live candle triggers on your broker DOM/chart."
        : quoteBadge === "STALE"
        ? `WARNING: Quote data is stale (${stalenessSeconds}s old). Refresh before placing execution decisions.`
        : "Live feed active within freshness window.",
  };
}

export function buildSystemPromptFromContext(snapshot: ChatMarketContextSnapshot): string {
  const sortedLevels = [...snapshot.keyLevels].sort((a, b) => b.price - a.price);
  const levelsBlock = sortedLevels
    .map(
      (l) =>
        `- ${l.shortName} (${l.name}): ${l.price.toFixed(2)} | dist ${l.distancePoints >= 0 ? "+" : ""}${l.distancePoints.toFixed(2)} pts | ${l.role} | source=${l.source} | ts=${formatETTimestamp(l.timestamp)} | status=${l.staleness}`
    )
    .join("\n");

  const journalTradesBlock =
    snapshot.journal.recentTrades.length > 0
      ? snapshot.journal.recentTrades
          .map(
            (t) =>
              `  - ${t.tradeDate} ${t.symbol} ${t.direction}: $${t.actualPnlDollars.toFixed(2)} (${t.actualPnlR.toFixed(2)}R) | MAE ${t.maeR.toFixed(2)}R / MFE ${t.mfeR.toFixed(2)}R | level="${t.retraceLevelUsed || "N/A"}" | notes="${t.notes || "none"}"`
          )
          .join("\n")
      : "  - No logged trades found in user's journal yet.";

  const scheduleBlock =
    snapshot.session.upcomingSchedule && snapshot.session.upcomingSchedule.length > 0
      ? snapshot.session.upcomingSchedule
          .map((d) => `- ${d.date} (${d.weekday}) [${d.status}]: ${d.note}`)
          .join("\n")
      : "- Regular CME schedule.";

  const eventsBlock =
    snapshot.upcomingEvents && snapshot.upcomingEvents.length > 0
      ? snapshot.upcomingEvents
          .map(
            (ev) =>
              `- ${ev.date} ${ev.timeET} [${ev.folderColor}/${ev.impact}]: ${ev.event}${
                ev.forecast ? ` (fcst ${ev.forecast}, prev ${ev.previous ?? "n/a"})` : ""
              }`
          )
          .join("\n")
      : "- No Red/Orange USD releases found in feed for upcoming days.";

  return `You are MinBook Strat & Quant Co-Pilot — a sharp, practical NQ / MNQ futures trading assistant specializing in **The Strat (Rob Smith)** price action, **MinBook's Quantitative NY Open Architecture**, macro volatility, and session liquidity.

${STRAT_CORE_PLAYBOOK}

---

## HOW TO BE A GREAT TRADING ASSISTANT (CONVERSATIONAL VS CHART SCALP)
1. **Answer the user's actual question directly like an experienced desk partner.** NEVER open with robotic boilerplate like *"Based on the MinBook Live Market Snapshot: The current Bias Verdict is..."* or parrot raw enum strings verbatim when the user asks a conversational or planning question.
2. **When no chart screenshot is attached (planning, multi-day outlook, holidays, macro, journal review, strategy questions):**
   - Speak naturally, concisely, and practically — weigh **today's exact ET date/time**, the **Upcoming Market Holiday / Half-Day Schedule** (e.g., Thanksgiving closures, Black Friday half-day thin volume), **Upcoming Economic News**, the **Volatility Regime** (translate \`VIX/VIX3M\`, \`VXN\`, \`VRP\`, and \`GEX\` into plain trader English: e.g., backwardation means elevated two-way chop & stop sweeps), and the user's **Trade Journal**.
   - If the user asks *"worth trading thurs and fri or no?"*, directly evaluate **Thursday** and **Friday** day-by-day (holidays, early closes, thin liquidity, scheduled catalysts, current vol stress), give a clear **Yes / No / Half-Size A+ Only** call, and state what conditions would make it tradable.
3. **Never fabricate prices, levels, candles, news events, or timestamps.** Only cite numbers you observe directly in the context below or on an uploaded chart screenshot.
4. **Always cite Source, Timestamp, and Staleness Status** whenever quoting a specific live price, MinBook level, or GEX wall (e.g., \`26,021.25 [Yahoo Finance | 18:10 ET | DELAYED]\`). If data is \`DELAYED\`, \`STALE\`, or \`SAMPLE\` (or feed lag > 90s), note it cleanly and suppress stale 1m flow overrides.
5. **Multi-User Objectivity:** Do **NOT** invent or enforce arbitrary personal rules such as "$250 / $300 / $350 daily loss limit" or "1 trade per day". Keep risk sizing objective per contract (\`MNQ = $2/pt\`, \`NQ = $20/pt\`), \`R:R\`, and \`ATR\`.

## UPLOADED CHART SCREENSHOT PROTOCOL
1. **When a screenshot is attached**, use MinBook's deterministic quant pipeline (\`compute_scalp_verdict\` / \`runMinBookQuantAnalysis\`) to extract ticker, timeframe, live spot, order/position state, drawn levels/boxes, candle OHLC, and news countdown, and ground every number in the deterministic output.
2. **Never say "Entry Missed" for resting Limit orders** — evaluate whether the limit zone is valid, stretched, or blocked by structural magnets. Orange/Yellow housing/PMI news never vetoes valid setups.
3. In **DEEP_DIVE** conversational/chart breakdowns, end with a punchy **\`## TL;DR\`** (2–3 bullets + **\`Action Right Now:\`**).

---

## CURRENT TIME, HOLIDAY SCHEDULE & ECONOMIC CALENDAR
- **Current ET Date/Time:** ${snapshot.session.currentETDateTime || `${snapshot.session.targetTradeDate} ET`}
- **Active CME Session:** ${snapshot.session.activeSessionLabel} (\`${snapshot.session.phase}\`) | Target Trade Date: ${snapshot.session.targetTradeDate} | Countdown: ${snapshot.session.countdown}

### Upcoming 5-Day Market & Holiday Schedule
${scheduleBlock}

### Upcoming US Economic Releases (Red / Orange)
${eventsBlock}

---

## LIVE MINBOOK MARKET SNAPSHOT (${snapshot.instrument} / ${snapshot.underlyingAsset})
- **Honesty Notice:** ${snapshot.honestyNotice}
- **Spot Quote:** ${snapshot.quote.price.toFixed(2)} (${snapshot.quote.change >= 0 ? "+" : ""}${snapshot.quote.change.toFixed(2)}, ${snapshot.quote.changePercent >= 0 ? "+" : ""}${snapshot.quote.changePercent.toFixed(2)}%) | Open: ${snapshot.quote.open.toFixed(2)} | High: ${snapshot.quote.high.toFixed(2)} | Low: ${snapshot.quote.low.toFixed(2)} | PDC: ${snapshot.quote.previousClose.toFixed(2)}
- **Quote Metadata:** Source=\`${snapshot.quote.source}\` | Timestamp=\`${formatETTimestamp(snapshot.quote.timestamp)}\` | Status=\`${snapshot.quote.status}\` | Staleness=\`${snapshot.quote.stalenessBadge}\` (${snapshot.quote.stalenessSeconds}s old)
- **CME Session:** ${snapshot.session.activeSessionLabel} (\`${snapshot.session.phase}\`) | Target Trade Date: ${snapshot.session.targetTradeDate} | Countdown: ${snapshot.session.countdown}

### Regime, Layer 1 Risk Gates & Playbook
- **Bias Verdict:** ${snapshot.regime.biasVerdict} (Confidence: ${snapshot.regime.confidence} | HTF Trend: ${snapshot.regime.htfTrend} | Chop Risk: ${snapshot.regime.chopRisk})
- **Layer 1 Risk Multiplier:** ${snapshot.regime.riskMultiplier}x | Active Vetoes: ${snapshot.regime.activeVetoes.length > 0 ? snapshot.regime.activeVetoes.join("; ") : "None"}
- **Archetype:** ${snapshot.regime.archetype}
- **Summary:** ${snapshot.regime.summary}
- **Overnight Inventory:** ${snapshot.regime.overnightInventory} (${snapshot.regime.inventoryPercent.toFixed(1)}% Globex bars above PDC)
- **Expected Move & ATR:** Straddle ~${snapshot.regime.expectedMoveStraddle.toFixed(1)} pts | 1-SD ~${snapshot.regime.expectedMove1SD.toFixed(1)} pts | ATR_Open_15m ~${snapshot.regime.atrOpen15m.toFixed(1)} pts | VWAP Mode: \`${snapshot.regime.vwapMode}\`

### Volatility Surface, Macro, GEX & Order-Flow Proxy
- **Volatility:** VXN ${snapshot.volatilityAndMacro.vxn.toFixed(2)} | VIX ${snapshot.volatilityAndMacro.vix.toFixed(2)} | VIX3M ${snapshot.volatilityAndMacro.vix3m.toFixed(2)} | Term Ratio ${snapshot.volatilityAndMacro.termRatio.toFixed(2)} (${snapshot.volatilityAndMacro.termStructureRegime}) | VVIX ${snapshot.volatilityAndMacro.vvix.toFixed(1)} | VRP Ratio ${snapshot.volatilityAndMacro.vrpRatio.toFixed(2)} (${snapshot.volatilityAndMacro.isNegativeVrp ? "NEGATIVE VRP STRESS" : "NORMAL"})
- **Macro:** ${snapshot.volatilityAndMacro.macroCorrelationRegime} (Rate source: \`${snapshot.volatilityAndMacro.rateSource}\`) | DXY ${snapshot.volatilityAndMacro.dxyPrice.toFixed(2)} (${snapshot.volatilityAndMacro.dxyPercentChange >= 0 ? "+" : ""}${snapshot.volatilityAndMacro.dxyPercentChange.toFixed(2)}%)
- **Dealer GEX:** ${snapshot.gex.available ? `${snapshot.gex.netGammaRegime} | Flip ${snapshot.gex.gammaFlipNq} | Call Wall ${snapshot.gex.callWallNq} | Put Wall ${snapshot.gex.putWallNq} | Source=${snapshot.gex.source} | TS=${formatETTimestamp(snapshot.gex.lastUpdated)} (${snapshot.gex.disclaimer})` : "Unavailable"}
- **SMT Divergence (NQ vs ES):** ${snapshot.smt.hasDivergence ? `${snapshot.smt.divergenceType} (${snapshot.smt.direction}) — ${snapshot.smt.notes}` : snapshot.smt.notes}
- **1m Derived Footprint Proxy:** ${snapshot.footprint.available ? `Session CVD ${snapshot.footprint.sessionCvd} | RTH CVD ${snapshot.footprint.rthCvd} | TS=${formatETTimestamp(snapshot.footprint.lastUpdated)} (${snapshot.footprint.disclaimer})` : "Unavailable"}

### Key Reference Levels (Sorted High to Low)
${levelsBlock}

---

## USER TRADE JOURNAL (OBJECTIVE HISTORY ONLY)
${snapshot.journal.totalTrades > 0 ? `- **Stats:** ${snapshot.journal.totalTrades} trades (${snapshot.journal.wins}W / ${snapshot.journal.losses}L, ${snapshot.journal.winRatePercent.toFixed(1)}% WR)\n${journalTradesBlock}` : "- No saved trades in this user's journal yet."}
`;
}

export async function buildMarketContext(options?: {
  symbol?: "NQ" | "MNQ";
  userId?: string;
  forceRefresh?: boolean;
}): Promise<{
  snapshot: ChatMarketContextSnapshot;
  systemPrompt: string;
}> {
  const symbol = options?.symbol === "MNQ" ? "MNQ" : "NQ";
  const [brief, journal] = await Promise.all([
    getOpenBrief({ symbol, forceRefresh: options?.forceRefresh }),
    buildJournalSummary(options?.userId),
  ]);

  const snapshot = briefToContextSnapshot(brief, journal);
  const systemPrompt = buildSystemPromptFromContext(snapshot);

  return { snapshot, systemPrompt };
}
