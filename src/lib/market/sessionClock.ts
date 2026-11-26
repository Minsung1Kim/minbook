import { SupportedTimezone, getTimezoneConfig } from "./timezone";

/**
 * CME Futures Centralized Session Clock & Rollover Utility
 * Strictly configured for America/New_York (ET) and CME equity index futures (NQ / MNQ / ES).
 * Supports viewing in US East (ET), US Central (CT), and US West (PT).
 *
 * CME Rollover Rules:
 * - Mon–Thu 00:00–16:59 ET: targetTradeDate = today (skips holidays)
 * - Mon–Thu 17:00–23:59 ET: targetTradeDate = next trading day (skips holidays)
 * - Fri 00:00–16:59 ET: targetTradeDate = today (Friday)
 * - Fri 17:00 ET through Sun 23:59 ET: targetTradeDate = upcoming Monday (skips holidays)
 */

export type CMESessionPhase =
  | "CME_BREAK_OR_WEEKEND"
  | "DEVELOPING_OVERNIGHT"
  | "PRE_MARKET_LOCK"
  | "NY_OPEN_WINDOW"
  | "POST_WINDOW_RECAP";

export type CMESubPhase = "ASIA" | "LONDON";

export type ActiveFuturesSession =
  | "ASIA"
  | "LONDON"
  | "NY_PREMARKET"
  | "NY_AM"
  | "NY_LUNCH"
  | "NY_PM"
  | "POST_CLOSE"
  | "CME_BREAK"
  | "WEEKEND";

export interface CMESessionInfo {
  nowET: Date;
  currentETDateStr: string; // YYYY-MM-DD
  currentETTimeStr: string; // HH:MM:SS
  dayOfWeekET: "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
  targetTradeDate: string; // YYYY-MM-DD
  priorTradeDate: string; // YYYY-MM-DD
  targetTradeDateFormatted: string; // e.g. "TARGET: TUE NOV 24 • 9:30 AM ET OPEN"
  priorTradeDateFormatted: string; // e.g. "Mon, Nov 23"
  phase: CMESessionPhase;
  subPhase?: CMESubPhase;
  statusBadge: "DEVELOPING" | "FINALIZED" | "ACTIVE" | "RECAP" | "MAINTENANCE" | "WEEKEND";
  phaseTitle: string;
  nextMilestoneLabel: string;
  secondsToTargetOpen: number; // Seconds until 09:30:00 ET of targetTradeDate
  secondsToNextMilestone: number;
  countdownHuman: string;
  isWindowActive: boolean;
  isDeveloping: boolean;
  // 24/5 Session-Agnostic Fields (Asia, London, NY Pre-Mkt, NY AM, NY Lunch, NY PM, Post-Close)
  activeSession: ActiveFuturesSession;
  activeSessionLabel: string;
  activeSessionWindowHuman: string;
  activeSessionCountdown: string;
  isMarketOpen: boolean;
}

// Full-closure US / CME Equity Futures Holidays (2024–2028)
const CME_FULL_HOLIDAYS = new Set([
  // 2024
  "2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27", "2024-06-19", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25",
  // 2025
  "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  // 2028
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19", "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25"
]);

export function isCMEHoliday(dateStr: string): boolean {
  return CME_FULL_HOLIDAYS.has(dateStr);
}

export function shiftCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isTradingDay(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayOfWeek = dt.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false; // Sun, Sat
  return !isCMEHoliday(dateStr);
}

export function getNextTradingDay(dateStr: string): string {
  let cur = dateStr;
  while (true) {
    cur = shiftCalendarDays(cur, 1);
    if (isTradingDay(cur)) return cur;
  }
}

export function getPriorTradingDay(dateStr: string): string {
  let cur = dateStr;
  while (true) {
    cur = shiftCalendarDays(cur, -1);
    if (isTradingDay(cur)) return cur;
  }
}

export interface ETParts {
  year: number;
  month: number;
  day: number;
  weekday: "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
  hour: number;
  minute: number;
  second: number;
  dateStr: string;
  timeStr: string;
}

export function getETParts(d: Date = new Date()): ETParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const weekday = get("weekday") as "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    weekday,
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    timeStr: `${get("hour")}:${get("minute")}:${get("second")}`
  };
}

/**
 * Given a calendar date YYYY-MM-DD and ET hour/min/sec, computes the exact UTC epoch ms.
 * DST-safe for America/New_York.
 */
export function getETEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  sec: number = 0
): number {
  const guess = Date.UTC(year, month - 1, day, hour, min, sec);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23"
  }).formatToParts(new Date(guess));

  const getVal = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
  const asET = Date.UTC(
    getVal("year"),
    getVal("month") - 1,
    getVal("day"),
    getVal("hour"),
    getVal("minute"),
    getVal("second")
  );
  const offset = asET - guess;
  return guess - offset;
}

export function parseDateStrToETEpochMs(dateStr: string, hour: number, min: number, sec: number = 0): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return getETEpochMs(y, m, d, hour, min, sec);
}

/**
 * Format date string into human-friendly representation
 * e.g. "2026-11-24" -> "TUE NOV 24"
 */
export function formatTradeDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = dt.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }).toUpperCase();
  const month = dt.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" }).toUpperCase();
  return `${weekday} ${month} ${d}`;
}

/**
 * Format date string into "Tue, Nov 24"
 */
export function formatTradeDateReadable(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const weekday = dt.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
  const month = dt.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" });
  return `${weekday}, ${month} ${d}`;
}

export function formatSecondsToCountdown(seconds: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

/**
 * Central pure CME Session Clock evaluator.
 */
export function getCMESessionInfo(
  inputDate: Date = new Date(),
  timezone: SupportedTimezone = "America/New_York"
): CMESessionInfo {
  const nowMs = inputDate.getTime();
  const et = getETParts(inputDate);
  const totalMins = et.hour * 60 + et.minute;
  const tzConfig = getTimezoneConfig(timezone);

  // 1. Determine Target Trade Date
  let targetTradeDate = et.dateStr;
  if (et.weekday === "Fri") {
    if (totalMins >= 17 * 60) {
      targetTradeDate = getNextTradingDay(et.dateStr);
    } else {
      targetTradeDate = isTradingDay(et.dateStr) ? et.dateStr : getNextTradingDay(et.dateStr);
    }
  } else if (et.weekday === "Sat" || et.weekday === "Sun") {
    targetTradeDate = getNextTradingDay(et.dateStr);
  } else {
    // Mon - Thu
    if (totalMins >= 17 * 60) {
      targetTradeDate = getNextTradingDay(et.dateStr);
    } else {
      targetTradeDate = isTradingDay(et.dateStr) ? et.dateStr : getNextTradingDay(et.dateStr);
    }
  }

  // 2. Determine Prior Trade Date
  const priorTradeDate = getPriorTradingDay(targetTradeDate);

  // 3. Evaluate Session Phase & Sub-phase
  let phase: CMESessionPhase = "DEVELOPING_OVERNIGHT";
  let subPhase: CMESubPhase | undefined;
  let statusBadge: CMESessionInfo["statusBadge"] = "DEVELOPING";
  let phaseTitle = "";
  let nextMilestoneLabel = "";
  let secondsToNextMilestone = 0;

  const isWeekendClosed =
    (et.weekday === "Fri" && totalMins >= 17 * 60) ||
    et.weekday === "Sat" ||
    (et.weekday === "Sun" && totalMins < 18 * 60);

  const isDailyBreak =
    (et.weekday === "Mon" || et.weekday === "Tue" || et.weekday === "Wed" || et.weekday === "Thu") &&
    totalMins >= 17 * 60 &&
    totalMins < 18 * 60;

  const targetOpenMs = parseDateStrToETEpochMs(targetTradeDate, 9, 30, 0);
  const targetWindowCloseMs = parseDateStrToETEpochMs(targetTradeDate, 10, 0, 0);
  const secondsToTargetOpen = Math.max(0, Math.floor((targetOpenMs - nowMs) / 1000));

  const targetShort = formatTradeDateShort(targetTradeDate);
  const targetReadable = formatTradeDateReadable(targetTradeDate);
  const targetTradeDateFormatted = `TARGET: ${targetShort} • ${tzConfig.openTimeStr} ${tzConfig.code} OPEN`;
  const priorTradeDateFormatted = formatTradeDateReadable(priorTradeDate);

  if (isWeekendClosed || isDailyBreak) {
    phase = "CME_BREAK_OR_WEEKEND";
    statusBadge = isWeekendClosed ? "WEEKEND" : "MAINTENANCE";
    phaseTitle = `MARKET CLOSED — PREPARING FOR ${targetReadable} ${tzConfig.openTimeStr} ${tzConfig.code} OPEN`;

    // Next milestone is Globex Open
    let nextGlobexOpenMs: number;
    if (isDailyBreak) {
      nextGlobexOpenMs = parseDateStrToETEpochMs(et.dateStr, 18, 0, 0);
      nextMilestoneLabel = `${tzConfig.globexOpenStr} Globex Open`;
    } else {
      // Find Sunday 18:00 ET
      let cur = et.dateStr;
      while (getETParts(new Date(parseDateStrToETEpochMs(cur, 12, 0, 0))).weekday !== "Sun") {
        cur = shiftCalendarDays(cur, 1);
      }
      nextGlobexOpenMs = parseDateStrToETEpochMs(cur, 18, 0, 0);
      nextMilestoneLabel = `Sun ${tzConfig.globexOpenStr} Globex Open`;
    }
    secondsToNextMilestone = Math.max(0, Math.floor((nextGlobexOpenMs - nowMs) / 1000));
  } else if (
    (et.weekday === "Sun" && totalMins >= 18 * 60) ||
    ((et.weekday === "Mon" || et.weekday === "Tue" || et.weekday === "Wed" || et.weekday === "Thu") &&
      (totalMins >= 18 * 60 || totalMins < 8 * 60 + 30)) ||
    (et.weekday === "Fri" && totalMins < 8 * 60 + 30)
  ) {
    phase = "DEVELOPING_OVERNIGHT";
    statusBadge = "DEVELOPING";
    subPhase = totalMins >= 18 * 60 || totalMins < 3 * 60 ? "ASIA" : "LONDON";
    phaseTitle = `DEVELOPING — PREP FOR ${targetReadable} ${tzConfig.openTimeStr} ${tzConfig.code} OPEN`;
    nextMilestoneLabel = `${tzConfig.openTimeStr} ${tzConfig.code} Open`;
    secondsToNextMilestone = secondsToTargetOpen;
  } else if (
    (et.weekday === "Mon" || et.weekday === "Tue" || et.weekday === "Wed" || et.weekday === "Thu" || et.weekday === "Fri") &&
    totalMins >= 8 * 60 + 30 &&
    totalMins < 9 * 60 + 30
  ) {
    phase = "PRE_MARKET_LOCK";
    statusBadge = "FINALIZED";
    phaseTitle = `FINAL PRE-MARKET BRIEF — ${targetShort.split(" ")[0]} ${tzConfig.openTimeStr} ${tzConfig.code} OPEN`;
    nextMilestoneLabel = `${tzConfig.openTimeStr} ${tzConfig.code} Open Bell`;
    secondsToNextMilestone = secondsToTargetOpen;
  } else if (
    (et.weekday === "Mon" || et.weekday === "Tue" || et.weekday === "Wed" || et.weekday === "Thu" || et.weekday === "Fri") &&
    totalMins >= 9 * 60 + 30 &&
    totalMins < 10 * 60
  ) {
    phase = "NY_OPEN_WINDOW";
    statusBadge = "ACTIVE";
    phaseTitle = `NY OPEN WINDOW ACTIVE — ${targetShort.split(" ")[0]} ${tzConfig.openTimeStr} ${tzConfig.code} OPEN`;
    nextMilestoneLabel = `${tzConfig.windowCloseStr} ${tzConfig.code} Window Close`;
    secondsToNextMilestone = Math.max(0, Math.floor((targetWindowCloseMs - nowMs) / 1000));
  } else {
    // 10:00–16:59 ET
    phase = "POST_WINDOW_RECAP";
    statusBadge = "RECAP";
    phaseTitle = `${targetShort.split(" ")[0]} ${tzConfig.openTimeStr} WINDOW COMPLETE — STAY FLAT / LOG TRADE`;
    // Countdown to Globex rollover
    const rolloverMs = parseDateStrToETEpochMs(et.dateStr, 18, 0, 0);
    nextMilestoneLabel = `${tzConfig.globexOpenStr} Globex Rollover`;
    secondsToNextMilestone = Math.max(0, Math.floor((rolloverMs - nowMs) / 1000));
  }

  // Human countdown text for status bar
  let countdownHuman = "";
  if (phase === "NY_OPEN_WINDOW") {
    countdownHuman = `${formatSecondsToCountdown(secondsToNextMilestone)} left in Window`;
  } else if (phase === "PRE_MARKET_LOCK") {
    countdownHuman = `${formatSecondsToCountdown(secondsToTargetOpen)} to Open`;
  } else if (phase === "DEVELOPING_OVERNIGHT") {
    countdownHuman = `${formatSecondsToCountdown(secondsToTargetOpen)} to Open`;
  } else if (phase === "POST_WINDOW_RECAP") {
    countdownHuman = `${formatSecondsToCountdown(secondsToNextMilestone)} to 6:00 PM Rollover`;
  } else {
    countdownHuman = `${formatSecondsToCountdown(secondsToNextMilestone)} to 6:00 PM Open`;
  }

  // 4. Dynamic 24/5 Session Classification (Asia, London, NY Pre-Market, NY AM, NY Lunch, NY PM, Post-Close)
  const formatETTransitionTime = (epochMs: number): string => {
    return new Date(epochMs).toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour12: true,
      hour: "numeric",
      minute: "2-digit"
    });
  };

  let activeSession: ActiveFuturesSession = "ASIA";
  let activeSessionLabel = "ASIA SESSION";
  let activeSessionWindowHuman = "";
  let activeSessionCountdown = "";
  let isMarketOpen = true;

  if (isWeekendClosed) {
    activeSession = "WEEKEND";
    activeSessionLabel = "WEEKEND CLOSED";
    activeSessionWindowHuman = `Reopens Sun ${tzConfig.globexOpenStr}`;
    activeSessionCountdown = `${formatSecondsToCountdown(secondsToNextMilestone)} to Sun Open`;
    isMarketOpen = false;
  } else if (isDailyBreak) {
    activeSession = "CME_BREAK";
    activeSessionLabel = "CME DAILY BREAK";
    const openMs = parseDateStrToETEpochMs(et.dateStr, 18, 0, 0);
    activeSessionWindowHuman = `Resumes ${formatETTransitionTime(openMs)} ${tzConfig.code}`;
    activeSessionCountdown = `${formatSecondsToCountdown(Math.max(0, Math.floor((openMs - nowMs) / 1000)))} to Asia Open`;
    isMarketOpen = false;
  } else if (totalMins >= 18 * 60 || totalMins < 3 * 60) {
    activeSession = "ASIA";
    activeSessionLabel = "ASIA SESSION";
    const startMs =
      totalMins >= 18 * 60
        ? parseDateStrToETEpochMs(et.dateStr, 18, 0, 0)
        : parseDateStrToETEpochMs(shiftCalendarDays(et.dateStr, -1), 18, 0, 0);
    const londonMs =
      totalMins >= 18 * 60
        ? parseDateStrToETEpochMs(shiftCalendarDays(et.dateStr, 1), 3, 0, 0)
        : parseDateStrToETEpochMs(et.dateStr, 3, 0, 0);
    const secToLondon = Math.max(0, Math.floor((londonMs - nowMs) / 1000));
    activeSessionWindowHuman = `${formatETTransitionTime(startMs)}–${formatETTransitionTime(londonMs)} ${tzConfig.code}`;
    activeSessionCountdown = `${formatSecondsToCountdown(secToLondon)} to London`;
  } else if (totalMins < 8 * 60 + 30) {
    activeSession = "LONDON";
    activeSessionLabel = "LONDON SESSION";
    const startMs = parseDateStrToETEpochMs(et.dateStr, 3, 0, 0);
    const nyPreMs = parseDateStrToETEpochMs(et.dateStr, 8, 30, 0);
    const secToPre = Math.max(0, Math.floor((nyPreMs - nowMs) / 1000));
    activeSessionWindowHuman = `${formatETTransitionTime(startMs)}–${formatETTransitionTime(nyPreMs)} ${tzConfig.code}`;
    activeSessionCountdown = `${formatSecondsToCountdown(secToPre)} to NY Pre-Mkt`;
  } else if (totalMins < 9 * 60 + 30) {
    activeSession = "NY_PREMARKET";
    activeSessionLabel = "NY PRE-MARKET";
    const startMs = parseDateStrToETEpochMs(et.dateStr, 8, 30, 0);
    const openMs = parseDateStrToETEpochMs(et.dateStr, 9, 30, 0);
    const secToOpen = Math.max(0, Math.floor((openMs - nowMs) / 1000));
    activeSessionWindowHuman = `${formatETTransitionTime(startMs)}–${formatETTransitionTime(openMs)} ${tzConfig.code}`;
    activeSessionCountdown = `${formatSecondsToCountdown(secToOpen)} to NY Open`;
  } else if (totalMins < 12 * 60) {
    activeSession = "NY_AM";
    activeSessionLabel = "NY AM SESSION";
    const startMs = parseDateStrToETEpochMs(et.dateStr, 9, 30, 0);
    const lunchMs = parseDateStrToETEpochMs(et.dateStr, 12, 0, 0);
    const secToLunch = Math.max(0, Math.floor((lunchMs - nowMs) / 1000));
    activeSessionWindowHuman = `${formatETTransitionTime(startMs)}–${formatETTransitionTime(lunchMs)} ${tzConfig.code}`;
    activeSessionCountdown = `${formatSecondsToCountdown(secToLunch)} to NY Lunch`;
  } else if (totalMins < 13 * 60 + 30) {
    activeSession = "NY_LUNCH";
    activeSessionLabel = "NY LUNCH";
    const startMs = parseDateStrToETEpochMs(et.dateStr, 12, 0, 0);
    const pmMs = parseDateStrToETEpochMs(et.dateStr, 13, 30, 0);
    const secToPm = Math.max(0, Math.floor((pmMs - nowMs) / 1000));
    activeSessionWindowHuman = `${formatETTransitionTime(startMs)}–${formatETTransitionTime(pmMs)} ${tzConfig.code}`;
    activeSessionCountdown = `${formatSecondsToCountdown(secToPm)} to NY PM`;
  } else if (totalMins < 16 * 60) {
    activeSession = "NY_PM";
    activeSessionLabel = "NY PM SESSION";
    const startMs = parseDateStrToETEpochMs(et.dateStr, 13, 30, 0);
    const closeMs = parseDateStrToETEpochMs(et.dateStr, 16, 0, 0);
    const secToClose = Math.max(0, Math.floor((closeMs - nowMs) / 1000));
    activeSessionWindowHuman = `${formatETTransitionTime(startMs)}–${formatETTransitionTime(closeMs)} ${tzConfig.code}`;
    activeSessionCountdown = `${formatSecondsToCountdown(secToClose)} to ${formatETTransitionTime(closeMs)} Close`;
  } else {
    activeSession = "POST_CLOSE";
    activeSessionLabel = "POST-CLOSE SETTLEMENT";
    const startMs = parseDateStrToETEpochMs(et.dateStr, 16, 0, 0);
    const breakMs = parseDateStrToETEpochMs(et.dateStr, 17, 0, 0);
    const secToBreak = Math.max(0, Math.floor((breakMs - nowMs) / 1000));
    activeSessionWindowHuman = `${formatETTransitionTime(startMs)}–${formatETTransitionTime(breakMs)} ${tzConfig.code}`;
    activeSessionCountdown = `${formatSecondsToCountdown(secToBreak)} to CME Break`;
  }

  return {
    nowET: inputDate,
    currentETDateStr: et.dateStr,
    currentETTimeStr: et.timeStr,
    dayOfWeekET: et.weekday,
    targetTradeDate,
    priorTradeDate,
    targetTradeDateFormatted,
    priorTradeDateFormatted,
    phase,
    subPhase,
    statusBadge,
    phaseTitle,
    nextMilestoneLabel,
    secondsToTargetOpen,
    secondsToNextMilestone,
    countdownHuman,
    isWindowActive: phase === "NY_OPEN_WINDOW",
    isDeveloping: phase === "DEVELOPING_OVERNIGHT" || phase === "CME_BREAK_OR_WEEKEND",
    activeSession,
    activeSessionLabel,
    activeSessionWindowHuman,
    activeSessionCountdown,
    isMarketOpen
  };
}

export interface UpcomingMarketDay {
  date: string;
  weekday: string;
  status: "NORMAL" | "HOLIDAY" | "HALF_DAY" | "WEEKEND";
  note: string;
}

const CME_HOLIDAY_NAMES: Record<string, string> = {
  "01-01": "New Year's Day",
  "01-15": "MLK Jr. Day",
  "01-18": "MLK Jr. Day",
  "01-19": "MLK Jr. Day",
  "01-20": "MLK Jr. Day",
  "02-15": "Presidents' Day",
  "02-16": "Presidents' Day",
  "02-17": "Presidents' Day",
  "02-19": "Presidents' Day",
  "03-26": "Good Friday",
  "03-29": "Good Friday",
  "04-03": "Good Friday",
  "04-14": "Good Friday",
  "04-18": "Good Friday",
  "05-25": "Memorial Day",
  "05-26": "Memorial Day",
  "05-27": "Memorial Day",
  "05-29": "Memorial Day",
  "05-31": "Memorial Day",
  "06-18": "Juneteenth",
  "06-19": "Juneteenth",
  "07-03": "Independence Day (Observed)",
  "07-04": "Independence Day",
  "07-05": "Independence Day (Observed)",
  "09-01": "Labor Day",
  "09-02": "Labor Day",
  "09-04": "Labor Day",
  "09-06": "Labor Day",
  "09-07": "Labor Day",
  "11-23": "Thanksgiving Day",
  "11-25": "Thanksgiving Day",
  "11-26": "Thanksgiving Day",
  "11-27": "Thanksgiving Day",
  "11-28": "Thanksgiving Day",
  "12-24": "Christmas Day (Observed)",
  "12-25": "Christmas Day",
};

/**
 * Returns upcoming CME/US Equities trading schedule for the next `daysAhead` calendar days
 * in America/New_York, identifying full holidays, half-days (e.g. Black Friday), and weekends.
 */
export function getUpcomingCalendarSchedule(
  inputDate: Date = new Date(),
  daysAhead: number = 5
): UpcomingMarketDay[] {
  const et = getETParts(inputDate);
  const out: UpcomingMarketDay[] = [];

  for (let offset = 0; offset < daysAhead; offset++) {
    const dateStr = shiftCalendarDays(et.dateStr, offset);
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayOfWeek = dt.getUTCDay();
    const weekday = dt.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
    const mmdd = dateStr.slice(5);

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      out.push({
        date: dateStr,
        weekday,
        status: "WEEKEND",
        note: dayOfWeek === 6 ? "Saturday — CME closed" : "Sunday — Globex reopens 18:00 ET",
      });
      continue;
    }

    if (isCMEHoliday(dateStr)) {
      const hName = CME_HOLIDAY_NAMES[mmdd] || "US/CME Market Holiday";
      out.push({
        date: dateStr,
        weekday,
        status: "HOLIDAY",
        note: `${hName} — US equities closed; CME equity futures holiday schedule (13:00 ET halt / ultra-thin Globex, NO normal NY RTH open).`,
      });
      continue;
    }

    // Check US Equity / CME Half-Days (Black Friday, Christmas Eve, July 3)
    const isDayAfterThanksgiving = m === 11 && dayOfWeek === 5 && d >= 23 && d <= 29;
    const isChristmasEve = m === 12 && d === 24 && !isCMEHoliday(dateStr);
    const isJuly3 = m === 7 && d === 3 && !isCMEHoliday(dateStr);

    if (isDayAfterThanksgiving || isChristmasEve || isJuly3) {
      const label = isDayAfterThanksgiving
        ? "Day After Thanksgiving (Black Friday)"
        : isChristmasEve
        ? "Christmas Eve"
        : "Pre-Independence Day";
      out.push({
        date: dateStr,
        weekday,
        status: "HALF_DAY",
        note: `${label} Half-Day — US equities close 13:00 ET / CME equity futures close 13:15 ET. Expect thin holiday volume and choppy/low-conviction price action.`,
      });
      continue;
    }

    out.push({
      date: dateStr,
      weekday,
      status: "NORMAL",
      note: "Regular RTH session (09:30–16:00 ET).",
    });
  }

  return out;
}
