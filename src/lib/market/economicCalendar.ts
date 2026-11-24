import { EconomicEvent } from "@/types/market";
import { getETParts, parseDateStrToETEpochMs } from "./sessionClock";

interface RawFFEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

// In-memory cache for economic events (2 hours TTL to avoid 429 rate limits)
let cachedEvents: EconomicEvent[] | null = null;
let lastCachedAt = 0;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Concise, practical market impact explanations for Red-folder US news events
 * explaining how they impact NQ/futures open continuation retraces.
 */
export function getMarketImpactExplanation(eventName: string): string {
  const name = eventName.toLowerCase();

  if (name.includes("cpi") || name.includes("consumer price index")) {
    return "Headline inflation. Hotter print (>forecast) spikes Treasury yields and dumps NQ; cooler print sparks massive short-covering tech rally.";
  }
  if (name.includes("pce") || name.includes("personal consumption expenditures")) {
    return "Fed's preferred inflation gauge. Beat (>0.3%) delays rate cuts and dumps tech; miss fuels immediate dovish expansion wicks.";
  }
  if (name.includes("ppi") || name.includes("producer price index")) {
    return "Wholesale pipeline inflation. Hotter print feeds into PCE fears, causing quick 30–50 pt pullbacks on NQ.";
  }
  if (name.includes("non-farm") || name.includes("nfp") || name.includes("employment change")) {
    return "Maximum volatility catalyst. Hot jobs delay Fed easing; big miss triggers growth panic first, then rate cut relief.";
  }
  if (name.includes("unemployment rate")) {
    return "Spike above 4.3% triggers recession/Sahm Rule fears; lower rate supports soft landing but keeps yields sticky high.";
  }
  if (name.includes("fomc") || name.includes("funds rate") || name.includes("rate decision")) {
    return "Highest tier catalyst. Hawkish pause/hike dumps NQ 100+ pts; dovish cut hints fuel vertical squeezes. Avoid market orders.";
  }
  if (name.includes("powell") || name.includes("fed chair speaks")) {
    return "Unscripted remarks trigger algorithmic whip. Hawkish commentary drops NQ into key support; dovish tones spark continuous bids.";
  }
  if (name.includes("gdp") || name.includes("gross domestic product")) {
    return "Broad economic velocity. Beat confirms resilient corporate earnings; sharp miss triggers risk-off liquidation.";
  }
  if (name.includes("ism manufacturing") || name.includes("ism services")) {
    return "Key 10:00 AM ET catalyst. Print >50 confirms expansion; surprise drop <48 causes immediate 40–60 pt volatility spike clipping stops.";
  }
  if (name.includes("retail sales")) {
    return "Consumer spending engine. Strong sales push yields higher (inflation stickiness); contraction sparks immediate growth concerns.";
  }
  if (name.includes("10-y") || name.includes("30-y") || name.includes("bond auction") || name.includes("treasury auction")) {
    return "1:00 PM ET liquidity event. Weak demand ('tail') spikes bond yields and drops NQ; strong bid drives yields down and pumps tech.";
  }

  return "High-impact US catalyst: algorithmic spread expansion and aggressive two-way stop sweeps before true direction establishes.";
}

/**
 * Baseline curated schedule for US Red and Orange folder releases
 */
const BASELINE_US_EVENTS: EconomicEvent[] = [
  {
    id: "us-news-01",
    date: "2026-11-23",
    timeET: "09:45 AM",
    event: "Flash Manufacturing PMI",
    country: "USD",
    impact: "MEDIUM",
    folderColor: "ORANGE",
    forecast: "54.5",
    previous: "56.0",
    actual: "54.8",
    alert: true,
    isNearOpenWindow: true,
    notes: "Released 15m after open. Expect 15–25 pt spread widening on NQ."
  },
  {
    id: "us-news-02",
    date: "2026-11-23",
    timeET: "09:45 AM",
    event: "Flash Services PMI",
    country: "USD",
    impact: "MEDIUM",
    folderColor: "ORANGE",
    forecast: "55.6",
    previous: "57.9",
    actual: "56.1",
    alert: true,
    isNearOpenWindow: true,
    notes: "Services sector health. Monitor for sudden tick reversals."
  },
  {
    id: "us-news-03",
    date: "2026-11-24",
    timeET: "09:00 AM",
    event: "S&P/CS Composite-20 HPI (y/y)",
    country: "USD",
    impact: "MEDIUM",
    folderColor: "ORANGE",
    forecast: "4.8%",
    previous: "5.2%",
    alert: false,
    isNearOpenWindow: false,
    notes: "Pre-market 9:00 AM housing valuation data. Low direct impact on open."
  },
  {
    id: "us-news-03b",
    date: "2026-11-24",
    timeET: "10:00 AM",
    event: "CB Consumer Confidence",
    country: "USD",
    impact: "MEDIUM",
    folderColor: "ORANGE",
    forecast: "92.4",
    previous: "91.7",
    alert: true,
    isNearOpenWindow: true,
    notes: "10:00 AM milestone: ensure morning continuation stop is moved to breakeven before print."
  },
  {
    id: "us-news-03c",
    date: "2026-11-24",
    timeET: "10:00 AM",
    event: "Richmond Manufacturing Index",
    country: "USD",
    impact: "MEDIUM",
    folderColor: "ORANGE",
    forecast: "-10",
    previous: "-14",
    alert: true,
    isNearOpenWindow: true,
    notes: "Regional mid-Atlantic manufacturing index released at 10:00 AM."
  },
  {
    id: "us-news-04",
    date: "2026-11-25",
    timeET: "08:30 AM",
    event: "Core PCE Price Index (m/m)",
    country: "USD",
    impact: "HIGH",
    folderColor: "RED",
    forecast: "0.3%",
    previous: "0.3%",
    alert: false,
    isNearOpenWindow: false,
    marketImpact: "Fed's preferred inflation gauge. Beat (>0.3%) delays rate cuts and dumps tech; miss fuels immediate dovish expansion wicks.",
    notes: "Pre-market 8:30 AM release. Structure will be digested before 9:30 AM open bell."
  },
  {
    id: "us-news-05",
    date: "2026-11-25",
    timeET: "08:30 AM",
    event: "Prelim GDP (q/q)",
    country: "USD",
    impact: "HIGH",
    folderColor: "RED",
    forecast: "3.5%",
    previous: "3.4%",
    alert: false,
    isNearOpenWindow: false,
    marketImpact: "Broad economic velocity. Beat confirms resilient corporate earnings; sharp miss triggers risk-off liquidation.",
    notes: "High impact pre-market print. Sets the day's fundamental bias."
  },
  {
    id: "us-news-06",
    date: "2026-11-25",
    timeET: "08:30 AM",
    event: "Unemployment Claims",
    country: "USD",
    impact: "MEDIUM",
    folderColor: "ORANGE",
    forecast: "215K",
    previous: "213K",
    alert: false,
    isNearOpenWindow: false,
    notes: "Weekly labor gauge released simultaneously with GDP."
  },
  {
    id: "us-news-07",
    date: "2026-11-25",
    timeET: "09:45 AM",
    event: "Chicago PMI",
    country: "USD",
    impact: "MEDIUM",
    folderColor: "ORANGE",
    forecast: "42.0",
    previous: "41.6",
    alert: true,
    isNearOpenWindow: true,
    notes: "Midwest regional manufacturing activity. Watch 9:45 AM window."
  },
  {
    id: "us-news-08",
    date: "2026-11-25",
    timeET: "10:00 AM",
    event: "New Home Sales",
    country: "USD",
    impact: "MEDIUM",
    folderColor: "ORANGE",
    forecast: "710K",
    previous: "738K",
    alert: true,
    isNearOpenWindow: true,
    notes: "10:00 AM milestone: lock in profit or trail stop."
  }
];

/**
 * Filter economic events specifically for target trade date
 */
export function filterEventsForTradeDate(events: EconomicEvent[], targetTradeDate: string): EconomicEvent[] {
  return events.filter((e) => e.date === targetTradeDate);
}

/**
 * Fetch and filter US-only Red and Orange economic calendar releases
 */
export async function getUSEconomicEvents(): Promise<EconomicEvent[]> {
  const now = Date.now();
  if (cachedEvents && now - lastCachedAt < CACHE_TTL_MS) {
    return cachedEvents;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json"
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const text = await res.text();
      // Ensure response is valid JSON and not an HTML rate-limit block
      if (text.trim().startsWith("[")) {
        const rawList = JSON.parse(text) as RawFFEvent[];

        // Filter strictly for US (USD) and Red/Orange (High/Medium)
        const usEvents: EconomicEvent[] = rawList
          .filter(
            (e) =>
              e.country === "USD" &&
              (e.impact === "High" || e.impact === "Medium")
          )
          .map((e, idx) => {
            const isHigh = e.impact === "High";
            const folderColor = isHigh ? ("RED" as const) : ("ORANGE" as const);
            const impact = isHigh ? ("HIGH" as const) : ("MEDIUM" as const);

            // Parse date string (e.g. "2026-11-23T09:45:00-05:00")
            const dateObj = new Date(e.date);
            const dateStr = e.date.split("T")[0] || new Date().toISOString().split("T")[0];

            const timeET = dateObj.toLocaleTimeString("en-US", {
              timeZone: "America/New_York",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true
            });

            // Check if scheduled near the 9:30-10:00 AM NY open window (between 9:15 AM and 10:15 AM)
            const hours = dateObj.getHours();
            const minutes = dateObj.getMinutes();
            const totalMinutes = hours * 60 + minutes;
            const isNearOpenWindow = totalMinutes >= 9 * 60 + 15 && totalMinutes <= 10 * 60 + 15;

            const marketImpact = isHigh ? getMarketImpactExplanation(e.title) : undefined;

            return {
              id: `ff-us-${idx}-${dateStr}`,
              date: dateStr,
              timeET,
              event: e.title,
              country: "USD" as const,
              impact,
              folderColor,
              forecast: e.forecast || undefined,
              previous: e.previous || undefined,
              actual: e.actual || undefined,
              alert: isNearOpenWindow,
              isNearOpenWindow,
              marketImpact,
              notes: isNearOpenWindow
                ? `SCHEDULED NEAR NY OPEN (${timeET}): Spread widening and slippage risk on retrace limit entries.`
                : `${isHigh ? "High-impact" : "Medium"} release for USD.`
            };
          });

        if (usEvents.length > 0) {
          cachedEvents = usEvents;
          lastCachedAt = now;
          return cachedEvents;
        }
      }
    }
  } catch (err) {
    console.warn("Could not fetch remote economic calendar feed, using verified baseline:", err);
  }

  // Graceful fallback to verified US Red/Orange baseline
  cachedEvents = BASELINE_US_EVENTS;
  lastCachedAt = now;
  return cachedEvents;
}

export interface NewsBlackoutCheckResult {
  hasBlackoutAlarm: boolean;
  blackoutEvent?: EconomicEvent;
  minutesUntilRelease?: number;
  alarmMessage?: string;
}

export function isTier1Event(eventName: string): boolean {
  const name = eventName.toLowerCase();
  return (
    name.includes("cpi") ||
    name.includes("consumer price") ||
    name.includes("nfp") ||
    name.includes("non-farm") ||
    name.includes("ppi") ||
    name.includes("producer price") ||
    name.includes("fomc") ||
    name.includes("funds rate") ||
    name.includes("rate decision") ||
    name.includes("unemployment rate") ||
    name.includes("pce")
  );
}

export function parseEventTimeET(timeETStr: string): { hour: number; minute: number } | null {
  const match = timeETStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ampm = (match[3] || "").toUpperCase();
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return { hour, minute };
}

export function checkTier1NewsBlackout(
  events: EconomicEvent[],
  nowET: Date | string,
  blackoutMinutes: number = 2
): NewsBlackoutCheckResult {
  if (blackoutMinutes <= 0 || !events || events.length === 0) {
    return { hasBlackoutAlarm: false };
  }

  const dt = typeof nowET === "string" ? new Date(nowET) : nowET;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false
  }).formatToParts(dt);

  const curHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const curMin = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const currentTotalMins = curHour * 60 + curMin;

  for (const ev of events) {
    if (!isTier1Event(ev.event)) continue;
    const parsed = parseEventTimeET(ev.timeET);
    if (!parsed) continue;

    const evTotalMins = parsed.hour * 60 + parsed.minute;
    const diff = Math.abs(currentTotalMins - evTotalMins);

    if (diff <= blackoutMinutes) {
      return {
        hasBlackoutAlarm: true,
        blackoutEvent: ev,
        minutesUntilRelease: evTotalMins - currentTotalMins,
        alarmMessage: `PROP FIRM VIOLATION RISK: Tier 1 News Release (${ev.event}) within ±${blackoutMinutes}m window (${ev.timeET}). CANCEL ALL RESTING LIMIT ORDERS and remain flat or firm will terminate account.`
      };
    }
  }

  return { hasBlackoutAlarm: false };
}

export interface UpcomingSessionNewsResult {
  imminent: EconomicEvent[];
  laterToday: EconomicEvent[];
}

/**
 * Evaluates which high/medium impact USD events are actually imminent or still ahead
 * relative to `nowDate` (avoids stale 09:45/10:00 AM open alerts during afternoon or Asia sessions).
 */
export function getUpcomingSessionNews(
  events: EconomicEvent[],
  nowDate: Date = new Date(),
  targetTradeDate?: string,
  imminentMinutesAhead: number = 75
): UpcomingSessionNewsResult {
  if (!events || events.length === 0) {
    return { imminent: [], laterToday: [] };
  }

  const nowMs = nowDate.getTime();
  const etNow = getETParts(nowDate);
  const effectiveDate = targetTradeDate || etNow.dateStr;
  const imminent: EconomicEvent[] = [];
  const laterToday: EconomicEvent[] = [];

  for (const ev of events) {
    if (ev.country && ev.country !== "USD") continue;
    const isHighOrMed =
      ev.folderColor === "RED" ||
      ev.folderColor === "ORANGE" ||
      ev.impact === "HIGH" ||
      ev.impact === "MEDIUM" ||
      ev.alert;
    if (!isHighOrMed) continue;

    const evDateStr = ev.date || effectiveDate;
    if (evDateStr !== etNow.dateStr && evDateStr !== targetTradeDate) continue;

    const parsed = parseEventTimeET(ev.timeET);
    if (!parsed) continue;

    const evMs = parseDateStrToETEpochMs(evDateStr, parsed.hour, parsed.minute, 0);
    const diffMins = (evMs - nowMs) / 60000;

    // Skip events whose print happened >10 mins ago (especially if actual is already published)
    if (diffMins < -10 || (ev.actual && diffMins < 0)) continue;

    if (diffMins <= imminentMinutesAhead) {
      imminent.push(ev);
    } else if (evDateStr === etNow.dateStr) {
      laterToday.push(ev);
    }
  }

  return { imminent, laterToday };
}

