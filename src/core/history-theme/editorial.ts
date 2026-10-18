import {
  HistoryThemeError,
  addCalendarDays,
  addCalendarMonthsClipped,
  comparePlainDates,
  isValidPlainDate,
  localDateTimeToUtc,
  parseExplicitInstant,
  type PlainDate,
} from "./calendar";
import type { EditorialCandidate, EditorialPlan, TimeWindow } from "./types";

const LABEL = "演武堂历史策划" as const;

function secondFullWeek(year: number, month: number): { start: PlainDate; end: PlainDate } {
  const first = { year, month, day: 1 };
  if (!isValidPlainDate(first)) throw new HistoryThemeError("INVALID_MONTH", "Editorial month is invalid");
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, 1);
  value.setUTCHours(0, 0, 0, 0);
  const firstMonday = addCalendarDays(first, (8 - value.getUTCDay()) % 7);
  const start = addCalendarDays(firstMonday, 7);
  return { start, end: addCalendarDays(start, 7) };
}

function windowFor(start: PlainDate, end: PlainDate): TimeWindow {
  return { startsAt: localDateTimeToUtc(start, "00:00"), endsAt: localDateTimeToUtc(end, "00:00") };
}

function parseWindow(window: TimeWindow): { start: number; end: number } {
  const start = parseExplicitInstant(window.startsAt);
  const end = parseExplicitInstant(window.endsAt);
  if (start >= end) throw new HistoryThemeError("INVALID_WINDOW", "Solemn window must have positive duration");
  return { start, end };
}

function isEligible(candidate: EditorialCandidate, windowStart: PlainDate): boolean {
  if (candidate.status !== "PUBLISHED" || !candidate.reviewValid) return false;
  if (candidate.lastShownOn === null) return true;
  if (!isValidPlainDate(candidate.lastShownOn)) return false;
  return comparePlainDates(addCalendarMonthsClipped(candidate.lastShownOn, 24), windowStart) <= 0;
}

function compareCandidates(left: EditorialCandidate, right: EditorialCandidate): number {
  if (left.lastShownOn === null && right.lastShownOn !== null) return -1;
  if (left.lastShownOn !== null && right.lastShownOn === null) return 1;
  if (left.lastShownOn && right.lastShownOn) {
    const byDate = comparePlainDates(left.lastShownOn, right.lastShownOn);
    if (byDate !== 0) return byDate;
  }
  return left.id - right.id;
}

export function planEditorialWindow(input: {
  year: number;
  month: number;
  candidates: readonly EditorialCandidate[];
  solemnWindows: readonly TimeWindow[];
  forcedThemeId?: number | null;
}): EditorialPlan {
  let { start, end } = secondFullWeek(input.year, input.month);
  const conflicts = input.solemnWindows.map(parseWindow);
  let postponedWeeks = 0;
  while (true) {
    const current = windowFor(start, end);
    const currentStart = parseExplicitInstant(current.startsAt);
    const currentEnd = parseExplicitInstant(current.endsAt);
    if (!conflicts.some((conflict) => currentStart < conflict.end && conflict.start < currentEnd)) break;
    start = addCalendarDays(start, 7);
    end = addCalendarDays(end, 7);
    postponedWeeks += 1;
    if (comparePlainDates(end, { year: input.year + 1, month: 1, day: 1 }) > 0) {
      return { themeId: null, window: null, label: LABEL, reason: "NO_AVAILABLE_WEEK", postponedWeeks };
    }
  }
  const window = windowFor(start, end);
  const available = input.candidates.filter((candidate) => isEligible(candidate, start)).sort(compareCandidates);
  if (input.forcedThemeId != null) {
    const forced = available.find((candidate) => candidate.id === input.forcedThemeId);
    return forced
      ? { themeId: forced.id, window, label: LABEL, reason: "FORCED", postponedWeeks }
      : { themeId: null, window, label: LABEL, reason: "INVALID_OVERRIDE", postponedWeeks };
  }
  const selected = available[0];
  return selected
    ? { themeId: selected.id, window, label: LABEL, reason: "SELECTED", postponedWeeks }
    : { themeId: null, window, label: LABEL, reason: "NO_ELIGIBLE_THEME", postponedWeeks };
}
