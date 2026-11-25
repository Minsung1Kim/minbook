import { OHLCVBar, OpenBriefData } from "@/types/market";
import { computeSessionLevels, getBarDateET } from "./levels";
import { evaluateBiasAndRegime } from "./regime";
import { generateTacticalPlaybook } from "./playbook";
import { getCMESessionInfo } from "./sessionClock";
import { getUpcomingSessionNews } from "./economicCalendar";
import { buildPlainEnglishBrief, BiasDirectionLabel, PlainEnglishBrief } from "./plainEnglishBrief";

export interface ReplayOutcome {
  hoursAhead: 1 | 4;
  targetTimestamp: string;
  price: number;
  deltaPts: number;
  high: number;
  low: number;
  alignment: "ALIGNED" | "OPPOSITE" | "FLAT" | "IN_PROGRESS";
  summaryLabel: string;
}

export interface ReplayHourFrame {
  id: string;
  hoursBack: number;
  anchorTimeMs: number;
  anchorTimestamp: string;
  replayBrief: OpenBriefData;
  plainBrief: PlainEnglishBrief;
  outcome1h: ReplayOutcome | null;
  outcome4h: ReplayOutcome | null;
}

function buildDailyBarsFromIntraday(
  bars: OHLCVBar[],
  cutoffMs: number,
  fallbackPrior?: { dateStr: string; high: number; low: number; close: number }
): OHLCVBar[] {
  const byDate = new Map<string, OHLCVBar>();

  for (const b of bars) {
    const ms = Date.parse(b.timestamp);
    if (!Number.isFinite(ms) || ms >= cutoffMs) continue;
    const dateStr = getBarDateET(b.timestamp);
    const existing = byDate.get(dateStr);
    if (!existing) {
      byDate.set(dateStr, {
        timestamp: `${dateStr}T12:00:00.000Z`,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume ?? 0,
      });
    } else {
      existing.high = Math.max(existing.high, b.high);
      existing.low = Math.min(existing.low, b.low);
      existing.close = b.close;
      existing.volume = (existing.volume || 0) + (b.volume || 0);
    }
  }

  if (fallbackPrior && !byDate.has(fallbackPrior.dateStr)) {
    byDate.set(fallbackPrior.dateStr, {
      timestamp: `${fallbackPrior.dateStr}T12:00:00.000Z`,
      open: fallbackPrior.close,
      high: fallbackPrior.high,
      low: fallbackPrior.low,
      close: fallbackPrior.close,
      volume: 1000,
    });
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, bar]) => bar);
}

function evaluateHorizonOutcome(
  barsAfter: Array<{ bar: OHLCVBar; ms: number }>,
  anchorTimeMs: number,
  spotAtT: number,
  direction: BiasDirectionLabel,
  hoursAhead: 1 | 4
): ReplayOutcome | null {
  const windowEndMs = anchorTimeMs + hoursAhead * 3600_000;
  const minCompleteMs = anchorTimeMs + (hoursAhead === 1 ? 45 * 60_000 : 210 * 60_000);
  const slice = barsAfter.filter((item) => item.ms >= anchorTimeMs && item.ms < windowEndMs);
  if (slice.length === 0) return null;

  const endItem = slice[slice.length - 1];
  const endPrice = endItem.bar.close;
  const deltaPts = Math.round((endPrice - spotAtT) * 100) / 100;
  const high = Math.max(...slice.map((s) => s.bar.high));
  const low = Math.min(...slice.map((s) => s.bar.low));
  const isCompleted = endItem.ms >= minCompleteMs;

  let alignment: ReplayOutcome["alignment"] = "IN_PROGRESS";
  if (isCompleted) {
    if (direction === "BULLISH") {
      alignment = deltaPts >= 3 ? "ALIGNED" : deltaPts <= -3 ? "OPPOSITE" : "FLAT";
    } else if (direction === "BEARISH") {
      alignment = deltaPts <= -3 ? "ALIGNED" : deltaPts >= 3 ? "OPPOSITE" : "FLAT";
    } else {
      alignment = Math.abs(deltaPts) <= 25 ? "ALIGNED" : "FLAT";
    }
  }

  const sign = deltaPts >= 0 ? "+" : "";
  const statusTag = !isCompleted
    ? "In progress"
    : alignment === "ALIGNED"
    ? "Aligned"
    : alignment === "OPPOSITE"
    ? "Reversed"
    : "Flat";

  return {
    hoursAhead,
    targetTimestamp: endItem.bar.timestamp,
    price: endPrice,
    deltaPts,
    high,
    low,
    alignment,
    summaryLabel: `${sign}${deltaPts.toFixed(2)} pts (${statusTag})`,
  };
}

/**
 * Reconstructs hour-by-hour historical predictions and chart cutoffs over the last 12
 * active trading hours directly from intraday OHLCV bars without lookahead leakage.
 */
export function build12HourReplayFrames(
  brief: OpenBriefData,
  maxHours: number = 12
): ReplayHourFrame[] {
  const rawBars = brief.intradayBars || [];
  if (rawBars.length < 4) return [];

  const sorted = rawBars
    .map((bar) => ({ bar, ms: Date.parse(bar.timestamp) }))
    .filter((item) => Number.isFinite(item.ms))
    .sort((a, b) => a.ms - b.ms);

  if (sorted.length < 4) return [];

  const latestBarMs = sorted[sorted.length - 1].ms;
  const latestEndMs = latestBarMs + 15 * 60_000;
  // Step back cleanly to the latest top-of-hour mark at least 25m prior to latest bar close
  let cursorMs = Math.floor((latestEndMs - 25 * 60_000) / 3600_000) * 3600_000;
  const earliestMs = sorted[0].ms;

  const candidateCutoffs: number[] = [];
  let steps = 0;
  while (candidateCutoffs.length < maxHours && cursorMs > earliestMs && steps < 72) {
    const hasActivityInHour = sorted.some(
      (item) => item.ms >= cursorMs - 3600_000 && item.ms < cursorMs
    );
    const hasHistoryBefore = sorted.some((item) => item.ms < cursorMs);
    if (hasActivityInHour && hasHistoryBefore) {
      candidateCutoffs.push(cursorMs);
    }
    cursorMs -= 3600_000;
    steps++;
  }

  // Chronological oldest -> newest
  candidateCutoffs.reverse();

  const ivPct = brief.macro.volatilitySurface?.vxn || brief.macro.vix?.value || 24.0;
  const totalCount = candidateCutoffs.length;

  return candidateCutoffs.map((anchorTimeMs, idx): ReplayHourFrame => {
    const hoursBack = totalCount - idx;
    const anchorDate = new Date(anchorTimeMs);
    const anchorIso = anchorDate.toISOString();

    const slicedItems = sorted.filter((item) => item.ms < anchorTimeMs);
    const slicedBars = slicedItems.map((item) => item.bar);
    const afterItems = sorted.filter((item) => item.ms >= anchorTimeMs);

    const lastBar = slicedBars[slicedBars.length - 1];
    const spotAtT = lastBar.close;
    const sessionInfoAtT = getCMESessionInfo(anchorDate);

    const fallbackPrior =
      sessionInfoAtT.targetTradeDate === brief.targetTradeDate
        ? {
            dateStr: brief.priorTradeDate || sessionInfoAtT.priorTradeDate,
            high: brief.sessionMetrics.pdh,
            low: brief.sessionMetrics.pdl,
            close: brief.sessionMetrics.pdc,
          }
        : undefined;

    const replayDailyBars = buildDailyBarsFromIntraday(slicedBars, anchorTimeMs, fallbackPrior);

    const { sessionMetrics: replayMetrics, keyLevels: replayKeyLevels } = computeSessionLevels(
      spotAtT,
      replayDailyBars,
      slicedBars,
      ivPct,
      undefined,
      sessionInfoAtT.targetTradeDate,
      anchorDate
    );

    const hasOpenNewsAtT =
      getUpcomingSessionNews(
        brief.macro.events || [],
        anchorDate,
        sessionInfoAtT.targetTradeDate,
        75
      ).imminent.length > 0;

    const replayBias = evaluateBiasAndRegime(
      spotAtT,
      replayMetrics,
      brief.macro.vix,
      hasOpenNewsAtT,
      brief.macro.volatilitySurface,
      brief.macro.macroRegime,
      brief.gex
    );

    const replayFootprintBars = brief.footprint?.bars?.filter(
      (fb) => fb.timeSec * 1000 < anchorTimeMs
    );

    const replayPlan = generateTacticalPlaybook(spotAtT, replayMetrics, replayBias, {
      isDelayed: false,
      economicEvents: brief.macro.events,
      sessionInfo: sessionInfoAtT,
      footprintBars: replayFootprintBars,
      intradayBars: slicedBars,
      keyLevels: replayKeyLevels,
    });

    const change = Math.round((spotAtT - replayMetrics.pdc) * 100) / 100;
    const changePercent =
      replayMetrics.pdc > 0
        ? Math.round((change / replayMetrics.pdc) * 10000) / 100
        : 0;

    const replayBrief: OpenBriefData = {
      ...brief,
      tradeDate: sessionInfoAtT.targetTradeDate,
      targetTradeDate: sessionInfoAtT.targetTradeDate,
      priorTradeDate: sessionInfoAtT.priorTradeDate,
      sessionInfo: sessionInfoAtT,
      generatedAt: anchorIso,
      quote: {
        ...brief.quote,
        price: spotAtT,
        change,
        changePercent,
        high: replayMetrics.onh,
        low: replayMetrics.onl,
        timestamp: lastBar.timestamp,
        status: "DERIVED",
        source: `${brief.dataSource.providerName} (Hourly Replay)`,
      },
      sessionMetrics: replayMetrics,
      keyLevels: replayKeyLevels,
      bias: replayBias,
      tacticalPlan: replayPlan,
      dataSource: {
        ...brief.dataSource,
        quoteStatus: "DERIVED",
        levelsStatus: "DERIVED",
        lastUpdated: lastBar.timestamp,
        notice: `Historical hourly replay anchored at ${anchorIso}. Levels & VWAP recalculated using bars prior to cutoff.`,
      },
      intradayBars: slicedBars,
      footprint:
        brief.footprint && replayFootprintBars
          ? { ...brief.footprint, bars: replayFootprintBars }
          : undefined,
      ltfTradeCard: replayPlan.ltfTradeCard,
    };

    const plainBrief = buildPlainEnglishBrief(replayBrief, anchorDate);
    const outcome1h = evaluateHorizonOutcome(afterItems, anchorTimeMs, spotAtT, plainBrief.direction, 1);
    const outcome4h = evaluateHorizonOutcome(afterItems, anchorTimeMs, spotAtT, plainBrief.direction, 4);

    return {
      id: anchorIso,
      hoursBack,
      anchorTimeMs,
      anchorTimestamp: anchorIso,
      replayBrief,
      plainBrief,
      outcome1h,
      outcome4h,
    };
  });
}
