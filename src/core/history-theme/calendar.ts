import type { LeapPolicy } from "./types";

export const HISTORY_THEME_TIMEZONE = "Asia/Shanghai" as const;

export type PlainDate = { year: number; month: number; day: number };

export interface ChineseCalendarProvider {
  resolveLunarDate(input: { gregorianYear: number; lunarMonth: number; lunarDay: number; leapPolicy: LeapPolicy; timezone: string }): Promise<PlainDate[]>;
  resolveLunarYearLastDay(input: { gregorianYear: number; timezone: string }): Promise<PlainDate>;
  resolveSolarTerm(input: { gregorianYear: number; term: "QINGMING"; timezone: string }): Promise<PlainDate>;
}

export class HistoryThemeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "HistoryThemeError";
  }
}

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: HISTORY_THEME_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function utcEpoch(date: PlainDate, hour = 0, minute = 0, second = 0): number {
  const value = new Date(0);
  value.setUTCFullYear(date.year, date.month - 1, date.day);
  value.setUTCHours(hour, minute, second, 0);
  return value.getTime();
}

function zonedParts(epoch: number): PlainDate & { hour: number; minute: number; second: number } {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(epoch)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

export function isValidPlainDate(date: PlainDate): boolean {
  if (![date.year, date.month, date.day].every(Number.isInteger) || date.year < 1 || date.year > 9999 || date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return false;
  const value = new Date(utcEpoch(date));
  return value.getUTCFullYear() === date.year && value.getUTCMonth() + 1 === date.month && value.getUTCDate() === date.day;
}

export function comparePlainDates(left: PlainDate, right: PlainDate): number {
  return utcEpoch(left) - utcEpoch(right);
}

export function parseExplicitInstant(value: string | Date): number {
  if (value instanceof Date) {
    const epoch = value.getTime();
    if (!Number.isFinite(epoch)) throw new HistoryThemeError("INVALID_INSTANT", "Instant must be a valid Date");
    return epoch;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) {
    throw new HistoryThemeError("INVALID_INSTANT", "Instant must include an explicit UTC offset");
  }
  const [, year, month, day, hour, minute, second, , offsetHour = "00", offsetMinute = "00"] = match;
  if (!isValidPlainDate({ year: Number(year), month: Number(month), day: Number(day) })
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59
    || Number(offsetHour) > 23 || Number(offsetMinute) > 59) {
    throw new HistoryThemeError("INVALID_INSTANT", "Instant contains invalid calendar or clock components");
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new HistoryThemeError("INVALID_INSTANT", "Instant is invalid");
  return epoch;
}

export function localDateAt(instant: string | Date): PlainDate {
  const { year, month, day } = zonedParts(parseExplicitInstant(instant));
  return { year, month, day };
}

function parseLocalTime(time: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new HistoryThemeError("INVALID_LOCAL_TIME", "Local time must use HH:mm");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new HistoryThemeError("INVALID_LOCAL_TIME", "Local time is outside the clock range");
  return { hour, minute };
}

export function localDateTimeToUtc(date: PlainDate, time: string): string {
  if (!isValidPlainDate(date)) throw new HistoryThemeError("INVALID_DATE", "Gregorian date is invalid");
  const { hour, minute } = parseLocalTime(time);
  const nominal = utcEpoch(date, hour, minute);
  const offsets = new Set<number>();
  for (let delta = -48; delta <= 48; delta += 6) {
    const sample = nominal + delta * 60 * 60 * 1000;
    const local = zonedParts(sample);
    offsets.add(utcEpoch(local, local.hour, local.minute, local.second) - sample);
  }
  const matches = [...offsets]
    .map((offset) => nominal - offset)
    .filter((epoch) => {
      const local = zonedParts(epoch);
      return local.year === date.year && local.month === date.month && local.day === date.day && local.hour === hour && local.minute === minute && local.second === 0;
    })
    .filter((epoch, index, values) => values.indexOf(epoch) === index)
    .sort((left, right) => left - right);
  if (matches.length === 0) throw new HistoryThemeError("NONEXISTENT_LOCAL_TIME", "Local time does not exist in Asia/Shanghai");
  if (matches.length > 1) throw new HistoryThemeError("AMBIGUOUS_LOCAL_TIME", "Local time is ambiguous in Asia/Shanghai");
  return new Date(matches[0]).toISOString();
}

export function addCalendarDays(date: PlainDate, days: number): PlainDate {
  if (!isValidPlainDate(date)) throw new HistoryThemeError("INVALID_DATE", "Gregorian date is invalid");
  if (!Number.isInteger(days)) throw new HistoryThemeError("INVALID_DAY_OFFSET", "Calendar day offset must be an integer");
  const value = new Date(utcEpoch(date));
  value.setUTCDate(value.getUTCDate() + days);
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

export function addCalendarMonthsClipped(date: PlainDate, months: number): PlainDate {
  if (!isValidPlainDate(date)) throw new HistoryThemeError("INVALID_DATE", "Gregorian date is invalid");
  if (!Number.isInteger(months)) throw new HistoryThemeError("INVALID_MONTH_OFFSET", "Calendar month offset must be an integer");
  const monthIndex = date.month - 1 + months;
  const targetYear = date.year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12 + 1;
  const monthAfter = targetMonth === 12 ? { year: targetYear + 1, month: 1, day: 1 } : { year: targetYear, month: targetMonth + 1, day: 1 };
  const monthEnd = new Date(utcEpoch(monthAfter) - 1).getUTCDate();
  return { year: targetYear, month: targetMonth, day: Math.min(date.day, monthEnd) };
}
