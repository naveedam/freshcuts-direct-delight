import { format as formatDate } from 'date-fns';
import { istDateString, istDateOf } from '@/lib/live-rate';

// India Standard Time everywhere. The app runs on IST whatever timezone the browser or phone is
// set to: "today", day/week/month boundaries, date filters and every date shown are IST.
// Timestamps are stored as exact instants; plain dates (YYYY-MM-DD) are IST calendar days.

export const IST_TZ = 'Asia/Kolkata';
const IST_OFFSET_MIN = 330;

/** Today's IST date, YYYY-MM-DD. */
export const istToday = (d: Date = new Date()) => istDateString(d);
export { istDateString, istDateOf };

/** First and last instant of an IST day, for filtering timestamp columns. */
export const istDayStart = (day: string) => `${day}T00:00:00+05:30`;
export const istDayEnd = (day: string) => `${day}T23:59:59.999+05:30`;
/** The IST day as a Date (midnight IST). */
export const istMidnight = (day: string) => new Date(istDayStart(day));

/** Shift a YYYY-MM-DD day by n days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Calendar parts of an instant in IST. month is 1–12, weekday 0 (Sun) – 6 (Sat). */
export function istParts(d: Date = new Date()) {
  const s = new Date(d.getTime() + IST_OFFSET_MIN * 60000);
  return {
    year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, day: s.getUTCDate(), weekday: s.getUTCDay(),
    hour: s.getUTCHours(), minute: s.getUTCMinutes(),
  };
}

/** Monday of the IST week containing `day`. */
export function istWeekStartMonday(day: string = istToday()): string {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}
/** First day of the IST month containing `day`. */
export const istMonthStart = (day: string = istToday()) => `${day.slice(0, 7)}-01`;

/**
 * A Date whose local fields read as IST wall-clock time, so date-fns `format` (which uses the
 * browser's timezone) prints IST. Only for display; don't store or compare these.
 */
export function toISTWallClock(input: Date | string | number): Date {
  const d = typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)
    ? new Date(`${input}T00:00:00+05:30`) // a plain date is an IST calendar day
    : new Date(input);
  const local = new Date(d.getTime() + IST_OFFSET_MIN * 60000);
  return new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(),
    local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds());
}

/** date-fns `format`, in IST. Accepts a Date, a timestamp string or a YYYY-MM-DD day. */
export function formatIST(input: Date | string | number, pattern: string): string {
  return formatDate(toISTWallClock(input), pattern);
}

/** toLocaleDateString / toLocaleString options pinned to IST. */
export const IST_DATE: Intl.DateTimeFormatOptions = { timeZone: IST_TZ, day: '2-digit', month: 'short', year: 'numeric' };
export const IST_DATETIME: Intl.DateTimeFormatOptions = {
  timeZone: IST_TZ, day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
};
