import {
  HISTORY_THEME_TIMEZONE,
  HistoryThemeError,
  addCalendarDays,
  isValidPlainDate,
  localDateTimeToUtc,
  parseExplicitInstant,
  type ChineseCalendarProvider,
  type PlainDate,
} from "./calendar";
import type { ThemeCandidate, ThemeResolution, TimeWindow, TriggerRule } from "./types";

function validatedWindow(startsAt: string, endsAt: string): TimeWindow {
  const start = parseExplicitInstant(startsAt);
  const end = parseExplicitInstant(endsAt);
  if (start >= end) throw new HistoryThemeError("INVALID_WINDOW", "Window must have positive duration");
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
}

function validateProviderAnchors(anchors: readonly PlainDate[], gregorianYear: number): PlainDate[] {
  const unique = new Map<string, PlainDate>();
  for (const anchor of anchors) {
    if (!isValidPlainDate(anchor)) throw new HistoryThemeError("INVALID_PROVIDER_DATE", "Calendar provider returned an invalid date");
    if (anchor.year !== gregorianYear) throw new HistoryThemeError("PROVIDER_DATE_WRONG_YEAR", "Calendar provider returned a date outside the requested year");
    unique.set(`${anchor.year}-${anchor.month}-${anchor.day}`, { ...anchor });
  }
  return [...unique.values()].sort((left, right) => left.month - right.month || left.day - right.day);
}

function validateRuleEnvelope(rule: TriggerRule, gregorianYear: number): void {
  if (rule.timezone !== HISTORY_THEME_TIMEZONE) throw new HistoryThemeError("INVALID_TIMEZONE", "History theme rules require Asia/Shanghai");
  if (!Number.isInteger(gregorianYear) || gregorianYear < 1 || gregorianYear > 9999) throw new HistoryThemeError("INVALID_YEAR", "Gregorian year is invalid");
  if (!Number.isInteger(rule.startOffsetDays) || !Number.isInteger(rule.endOffsetDays)) throw new HistoryThemeError("INVALID_DAY_OFFSET", "Trigger offsets must be integer calendar days");
}

async function annualAnchors(rule: TriggerRule, gregorianYear: number, provider: ChineseCalendarProvider): Promise<PlainDate[]> {
  if (rule.kind === "SOLAR_FIXED") {
    if (!Number.isInteger(rule.month) || !Number.isInteger(rule.day)) throw new HistoryThemeError("MISSING_SOLAR_DATE", "Fixed solar trigger requires month and day");
    const shape = { year: 2000, month: rule.month!, day: rule.day! };
    if (!isValidPlainDate(shape)) throw new HistoryThemeError("INVALID_DATE", "Fixed solar date is impossible");
    const anchor = { year: gregorianYear, month: rule.month!, day: rule.day! };
    return isValidPlainDate(anchor) ? [anchor] : [];
  }
  if (rule.kind === "LUNAR_FIXED") {
    if (rule.lunarYearLastDay) return validateProviderAnchors([await provider.resolveLunarYearLastDay({ gregorianYear, timezone: HISTORY_THEME_TIMEZONE })], gregorianYear);
    if (!Number.isInteger(rule.lunarMonth) || !Number.isInteger(rule.lunarDay) || !rule.leapPolicy) throw new HistoryThemeError("MISSING_LUNAR_DATE", "Fixed lunar trigger requires month, day, and leap policy");
    return validateProviderAnchors(await provider.resolveLunarDate({ gregorianYear, lunarMonth: rule.lunarMonth!, lunarDay: rule.lunarDay!, leapPolicy: rule.leapPolicy, timezone: HISTORY_THEME_TIMEZONE }), gregorianYear);
  }
  if (rule.kind === "SOLAR_TERM") {
    if (rule.solarTerm !== "QINGMING") throw new HistoryThemeError("MISSING_SOLAR_TERM", "Solar-term trigger requires QINGMING");
    return validateProviderAnchors([await provider.resolveSolarTerm({ gregorianYear, term: "QINGMING", timezone: HISTORY_THEME_TIMEZONE })], gregorianYear);
  }
  throw new HistoryThemeError("INVALID_TRIGGER_KIND", "Trigger kind is not annual");
}

export async function resolveTriggerWindows(
  rule: TriggerRule,
  gregorianYear: number,
  provider: ChineseCalendarProvider,
  editorialWindow?: TimeWindow,
): Promise<TimeWindow[]> {
  if (!rule.enabled) return [];
  validateRuleEnvelope(rule, gregorianYear);
  if (rule.kind === "ONE_OFF") {
    if (!rule.oneOffStartsAt || !rule.oneOffEndsAt) throw new HistoryThemeError("MISSING_ONE_OFF_WINDOW", "One-off trigger requires both instants");
    return [validatedWindow(rule.oneOffStartsAt, rule.oneOffEndsAt)];
  }
  if (rule.kind === "EDITORIAL_WINDOW") {
    if (!editorialWindow) throw new HistoryThemeError("MISSING_EDITORIAL_WINDOW", "Editorial trigger requires a planned window");
    return [validatedWindow(editorialWindow.startsAt, editorialWindow.endsAt)];
  }
  const anchors = await annualAnchors(rule, gregorianYear, provider);
  return anchors.map((anchor) => validatedWindow(
    localDateTimeToUtc(addCalendarDays(anchor, rule.startOffsetDays), rule.startTimeLocal),
    localDateTimeToUtc(addCalendarDays(anchor, rule.endOffsetDays), rule.endTimeLocal),
  ));
}

function rank(theme: ThemeCandidate): number {
  if (theme.tone === "SOLEMN" && (theme.observanceKind === "NATIONAL_MEMORIAL" || theme.observanceKind === "WAR_RESISTANCE")) return 0;
  if (theme.observanceKind !== "NONE") return 1;
  if (theme.category === "TRADITIONAL_FESTIVAL") return 2;
  if (theme.category === "HISTORICAL_FIGURE") return 3;
  if (theme.category === "ANCIENT_BATTLE") return 4;
  return 1;
}

function compareCandidates(left: ThemeCandidate, right: ThemeCandidate): number {
  return rank(left) - rank(right)
    || right.priority - left.priority
    || parseExplicitInstant(left.startsAt) - parseExplicitInstant(right.startsAt)
    || left.id - right.id
    || parseExplicitInstant(left.endsAt) - parseExplicitInstant(right.endsAt)
    || left.triggerKind.localeCompare(right.triggerKind);
}

function isSpecialSolemn(theme: ThemeCandidate | null): boolean {
  return theme?.tone === "SOLEMN" && (theme.observanceKind === "NATIONAL_MEMORIAL" || theme.observanceKind === "WAR_RESISTANCE");
}

export function resolveThemes(
  now: string | Date,
  candidates: readonly ThemeCandidate[],
  forcedPrimaryThemeId?: number | null,
): ThemeResolution {
  const nowEpoch = parseExplicitInstant(now);
  const suppressed: ThemeResolution["suppressed"] = [];
  const eligible: ThemeCandidate[] = [];
  for (const theme of candidates) {
    let reason: string | null = null;
    if (theme.status !== "PUBLISHED") reason = "UNPUBLISHED";
    else if (!theme.reviewValid) reason = "REVIEW_INVALID";
    else if (!Number.isFinite(theme.priority) || !Number.isInteger(theme.priority)) reason = "INVALID_PRIORITY";
    else {
      try {
        const start = parseExplicitInstant(theme.startsAt);
        const end = parseExplicitInstant(theme.endsAt);
        if (start >= end || nowEpoch < start || nowEpoch >= end) reason = "OUTSIDE_WINDOW";
      } catch {
        reason = "INVALID_WINDOW";
      }
    }
    if (reason) suppressed.push({ theme, reason });
    else eligible.push(theme);
  }
  suppressed.sort((left, right) => left.theme.id - right.theme.id || left.reason.localeCompare(right.reason));
  const sorted = [...eligible].sort(compareCandidates);
  const unique: ThemeCandidate[] = [];
  const seen = new Set<number>();
  for (const theme of sorted) {
    if (seen.has(theme.id)) suppressed.push({ theme, reason: "DUPLICATE_THEME" });
    else {
      seen.add(theme.id);
      unique.push(theme);
    }
  }
  const forced = forcedPrimaryThemeId == null ? null : unique.find((theme) => theme.id === forcedPrimaryThemeId) ?? null;
  const primary = forced ?? unique.find((theme) => theme.isFeatured) ?? null;
  const secondary: ThemeCandidate[] = [];
  for (const theme of unique) {
    if (theme === primary) continue;
    if (isSpecialSolemn(primary) && theme.tone === "FESTIVE") suppressed.push({ theme, reason: "SOLEMN_SUPPRESSES_FESTIVE" });
    else if (!theme.allowSecondary) suppressed.push({ theme, reason: "NOT_SECONDARY" });
    else if (secondary.length >= 2) suppressed.push({ theme, reason: "SECONDARY_CAPACITY" });
    else secondary.push(theme);
  }
  return { primary, secondary, suppressed };
}
