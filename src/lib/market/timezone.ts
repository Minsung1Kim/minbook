/**
 * MinBook Centralized Timezone Engine
 * Supports US Eastern (ET), US Central (CT), and US West / Pacific (PT).
 * Keeps charts, countdown timers, session windows, and economic calendar synchronized.
 */

export type SupportedTimezone = "America/New_York" | "America/Chicago" | "America/Los_Angeles";

export type TimezoneCode = "ET" | "CT" | "PT";

export interface TimezoneConfig {
  id: SupportedTimezone;
  code: TimezoneCode;
  label: string;
  shortLabel: string;
  city: string;
  openTimeStr: string; // e.g. "9:30 AM", "8:30 AM", "6:30 AM"
  windowCloseStr: string; // e.g. "10:00 AM", "9:00 AM", "7:00 AM"
  retraceWindowRange: string; // e.g. "09:30–10:00 ET", "08:30–09:00 CT", "06:30–07:00 PT"
  preMarketTimeStr: string; // e.g. "8:30 AM", "7:30 AM", "5:30 AM"
  globexOpenStr: string; // e.g. "18:00 ET", "17:00 CT", "15:00 PT"
}

export const TIMEZONE_CONFIGS: Record<SupportedTimezone, TimezoneConfig> = {
  "America/New_York": {
    id: "America/New_York",
    code: "ET",
    label: "US East (ET)",
    shortLabel: "East (ET)",
    city: "New York",
    openTimeStr: "9:30 AM",
    windowCloseStr: "10:00 AM",
    retraceWindowRange: "09:30–10:00 ET",
    preMarketTimeStr: "8:30 AM",
    globexOpenStr: "18:00 ET"
  },
  "America/Chicago": {
    id: "America/Chicago",
    code: "CT",
    label: "US Central (CT)",
    shortLabel: "Central (CT)",
    city: "Chicago",
    openTimeStr: "8:30 AM",
    windowCloseStr: "9:00 AM",
    retraceWindowRange: "08:30–09:00 CT",
    preMarketTimeStr: "7:30 AM",
    globexOpenStr: "17:00 CT"
  },
  "America/Los_Angeles": {
    id: "America/Los_Angeles",
    code: "PT",
    label: "US West (PT)",
    shortLabel: "West (PT)",
    city: "Los Angeles",
    openTimeStr: "6:30 AM",
    windowCloseStr: "7:00 AM",
    retraceWindowRange: "06:30–07:00 PT",
    preMarketTimeStr: "5:30 AM",
    globexOpenStr: "15:00 PT"
  }
};

export function getTimezoneConfig(tz: SupportedTimezone): TimezoneConfig {
  return TIMEZONE_CONFIGS[tz] || TIMEZONE_CONFIGS["America/New_York"];
}

export function getTimezoneCode(tz: SupportedTimezone): TimezoneCode {
  return getTimezoneConfig(tz).code;
}

/**
 * Format any timestamp into the selected timezone with custom Intl options
 */
export function formatInTimezone(
  date: Date | string | number,
  tz: SupportedTimezone,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "--:--:--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    ...options
  }).format(d);
}

/**
 * Format a time string e.g. "09:32:15 ET" or "08:32:15 CT"
 */
export function formatTimeWithZone(
  date: Date | string | number,
  tz: SupportedTimezone,
  includeSeconds: boolean = true
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "--:--:--";
  const code = getTimezoneCode(tz);
  const timeStr = d.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined
  });
  return `${timeStr} ${code}`;
}

/**
 * Format a date string e.g. "Mon, Nov 23" in target timezone
 */
export function formatDateWithZone(
  date: Date | string | number,
  tz: SupportedTimezone
): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

/**
 * Converts a string like "08:30 AM" or "10:00 AM" (which are natively ET release times in economic calendars)
 * into the trader's selected timezone with timezone code.
 * E.g., "08:30 AM" -> "8:30 AM ET" in New York, "7:30 AM CT" in Chicago, "5:30 AM PT" in Los Angeles.
 */
export function convertETTimeStringToZone(
  timeETStr: string,
  tz: SupportedTimezone,
  referenceDateStr?: string
): string {
  if (!timeETStr) return "--:--";

  // Parse timeETStr like "08:30 AM", "8:30 AM", "14:00"
  const match = timeETStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return timeETStr;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();

  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  // Use referenceDate or today's date
  const now = new Date();
  const dateBase = referenceDateStr ? referenceDateStr : now.toISOString().slice(0, 10);
  const [y, m, d] = dateBase.split("-").map(Number);

  // Parse this as an ET point in time
  // Using an ISO string with America/New_York offset or Intl trick
  // To avoid DST discrepancy, let's construct UTC using known ET offset:
  // ET is UTC-5 (EST) or UTC-4 (EDT). Let's construct a reference in ET:
  const testDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short"
  });
  const isEDT = etFormatter.format(testDate).includes("EDT");
  const etOffsetHours = isEDT ? 4 : 5;

  const utcMs = Date.UTC(y, m - 1, d, hours + etOffsetHours, minutes, 0);
  const targetDate = new Date(utcMs);

  const code = getTimezoneCode(tz);
  const formattedTime = targetDate.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour12: true,
    hour: "numeric",
    minute: "2-digit"
  });

  return `${formattedTime} ${code}`;
}
