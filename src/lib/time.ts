/**
 * Timezone helpers built on the Intl API, so the app works in any timezone
 * without shipping a date library. Medication times are stored as local
 * "HH:MM" strings plus the circle's IANA timezone.
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Returns true if the string is a valid IANA timezone known to this runtime. */
export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` from UTC (in ms) at the given instant. */
export function timezoneOffsetMs(timeZone: string, at: Date): number {
  const parts = partsFormatter(timeZone).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Converts a wall-clock date ("YYYY-MM-DD") and time ("HH:MM") in `timeZone` to a UTC instant. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let result = naive - timezoneOffsetMs(timeZone, new Date(naive));
  // Re-check once to settle DST transitions.
  const corrected = naive - timezoneOffsetMs(timeZone, new Date(result));
  if (corrected !== result) result = corrected;
  return new Date(result);
}

/** The local calendar date ("YYYY-MM-DD") of an instant in `timeZone`. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Adds whole days to a "YYYY-MM-DD" string. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}

/** Human friendly time such as "8:30 AM" in the circle's timezone. */
export function formatTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(at);
}

/** Human friendly date and time such as "Mon, 16 Nov, 10:00 AM". */
export function formatDateTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
}

/** Converts a `datetime-local` input value ("YYYY-MM-DDTHH:MM") in `timeZone` to UTC. */
export function parseLocalDateTime(value: string, timeZone: string): Date {
  const [date, time] = value.split("T");
  return zonedTimeToUtc(date, time.slice(0, 5), timeZone);
}

/** Inverse of parseLocalDateTime, for pre-filling `datetime-local` inputs. */
export function toLocalDateTimeInput(at: Date, timeZone: string): string {
  const parts = partsFormatter(timeZone).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export const TIME = { MINUTE, DAY } as const;
