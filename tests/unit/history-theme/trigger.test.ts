import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addCalendarDays,
  localDateAt,
  localDateTimeToUtc,
  type ChineseCalendarProvider,
} from "@/core/history-theme/calendar";
import { resolveThemes, resolveTriggerWindows } from "@/core/history-theme/trigger";
import type { ThemeCandidate, TriggerRule } from "@/core/history-theme/types";

const base = (id: number, overrides: Partial<ThemeCandidate> = {}): ThemeCandidate => ({
  id,
  slug: `theme-${id}`,
  category: "TRADITIONAL_FESTIVAL",
  tone: "FESTIVE",
  priority: 100,
  isFeatured: true,
  allowSecondary: true,
  triggerKind: "SOLAR_FIXED",
  status: "PUBLISHED",
  reviewValid: true,
  observanceKind: "NONE",
  startsAt: "2026-09-17T16:00:00.000Z",
  endsAt: "2026-09-18T16:00:00.000Z",
  ...overrides,
});

const rule = (overrides: Partial<TriggerRule> = {}): TriggerRule => ({
  id: 1,
  kind: "SOLAR_FIXED",
  timezone: "Asia/Shanghai",
  enabled: true,
  month: 9,
  day: 18,
  startOffsetDays: 0,
  endOffsetDays: 1,
  startTimeLocal: "00:00",
  endTimeLocal: "00:00",
  ...overrides,
});

const provider = (overrides: Partial<ChineseCalendarProvider> = {}): ChineseCalendarProvider => ({
  resolveLunarDate: async () => [{ year: 2026, month: 9, day: 18 }],
  resolveLunarYearLastDay: async () => ({ year: 2026, month: 2, day: 16 }),
  resolveSolarTerm: async () => ({ year: 2026, month: 4, day: 5 }),
  ...overrides,
});

test("uses Shanghai day boundaries and excludes end instant", () => {
  assert.deepEqual(localDateAt("2026-09-17T16:00:00Z"), { year: 2026, month: 9, day: 18 });
  assert.equal(resolveThemes("2026-09-17T15:59:59.999Z", [base(1)]).primary, null);
  assert.equal(resolveThemes("2026-09-17T16:00:00Z", [base(1)]).primary?.id, 1);
  assert.equal(resolveThemes("2026-09-18T16:00:00Z", [base(1)]).primary, null);
});

test("solemn national theme wins and suppresses festive secondary", () => {
  const memorial = base(3, { category: "MODERN_COMMEMORATION", tone: "SOLEMN", observanceKind: "NATIONAL_MEMORIAL", priority: 0 });
  const resolution = resolveThemes("2026-09-18T00:00:00Z", [base(1, { priority: 1000 }), memorial, base(2, { tone: "CULTURAL" })]);
  assert.equal(resolution.primary?.id, 3);
  assert.deepEqual(resolution.secondary.map((item) => item.id), [2]);
  assert.ok(resolution.suppressed.some((item) => item.theme.id === 1 && item.reason === "SOLEMN_SUPPRESSES_FESTIVE"));
});

test("filters unpublished, unreviewed, disabled-like, and malformed-priority candidates with reasons", () => {
  const result = resolveThemes("2026-09-18T00:00:00Z", [
    base(1),
    base(2, { status: "DRAFT" }),
    base(3, { status: "DISABLED" }),
    base(4, { reviewValid: false }),
    base(5, { priority: Number.NaN }),
    base(6, { priority: Number.POSITIVE_INFINITY }),
    base(7, { priority: 1.5 }),
  ]);
  assert.equal(result.primary?.id, 1);
  assert.deepEqual(result.suppressed.map(({ theme, reason }) => [theme.id, reason]), [
    [2, "UNPUBLISHED"], [3, "UNPUBLISHED"], [4, "REVIEW_INVALID"], [5, "INVALID_PRIORITY"], [6, "INVALID_PRIORITY"], [7, "INVALID_PRIORITY"],
  ]);
});

test("uses every rank tier before descending priority", () => {
  const result = resolveThemes("2026-09-18T00:00:00Z", [
    base(5, { category: "ANCIENT_BATTLE", priority: 999 }),
    base(4, { category: "HISTORICAL_FIGURE", priority: 999 }),
    base(3, { category: "TRADITIONAL_FESTIVAL", tone: "CULTURAL", priority: 999 }),
    base(2, { category: "MODERN_COMMEMORATION", tone: "NEUTRAL", priority: 999 }),
    base(1, { category: "MODERN_COMMEMORATION", tone: "SOLEMN", observanceKind: "WAR_RESISTANCE", priority: 0 }),
  ]);
  assert.equal(result.primary?.id, 1);
  assert.deepEqual(result.secondary.map((item) => item.id), [2, 3]);
});

test("orders equal ranks by priority descending, start ascending, then id ascending", () => {
  const result = resolveThemes("2026-09-18T12:00:00Z", [
    base(4, { priority: 101, startsAt: "2026-09-17T17:00:00.000Z", endsAt: "2026-09-19T00:00:00.000Z" }),
    base(3, { priority: 101, startsAt: "2026-09-17T15:00:00.000Z", endsAt: "2026-09-19T00:00:00.000Z" }),
    base(2, { priority: 101, startsAt: "2026-09-17T15:00:00.000Z", endsAt: "2026-09-19T00:00:00.000Z" }),
    base(1, { priority: 100, endsAt: "2026-09-19T00:00:00.000Z" }),
  ]);
  assert.equal(result.primary?.id, 2);
  assert.deepEqual(result.secondary.map((item) => item.id), [3, 4]);
});

test("orders equal ranks by parsed start instant across explicit offsets", () => {
  const result = resolveThemes("2026-09-18T01:00:00Z", [
    base(1, { startsAt: "2026-09-18T08:00:00+08:00", endsAt: "2026-09-19T00:00:00Z" }),
    base(2, { startsAt: "2026-09-18T00:30:00Z", endsAt: "2026-09-19T00:00:00Z" }),
  ]);
  assert.equal(result.primary?.id, 1);
});

test("deduplicates same-id windows by parsed end instant across explicit offsets", () => {
  const result = resolveThemes("2026-09-18T01:00:00Z", [
    base(1, { startsAt: "2026-09-18T00:00:00Z", endsAt: "2026-09-19T08:00:00+08:00", triggerKind: "SOLAR_FIXED" }),
    base(1, { startsAt: "2026-09-18T00:00:00Z", endsAt: "2026-09-19T00:30:00Z", triggerKind: "LUNAR_FIXED" }),
  ]);
  assert.equal(result.primary?.endsAt, "2026-09-19T08:00:00+08:00");
});

test("selection is stable across all permutations of four candidates", () => {
  const candidates = [base(4), base(2), base(3), base(1)];
  const permutations = <T>(items: readonly T[]): T[][] => items.length === 0 ? [[]] : items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
  for (const items of permutations(candidates)) {
    const result = resolveThemes("2026-09-18T00:00:00Z", items);
    assert.deepEqual([result.primary?.id, ...result.secondary.map((item) => item.id)], [1, 2, 3]);
  }
});

test("honors primary and secondary eligibility and caps secondary at two", () => {
  const result = resolveThemes("2026-09-18T00:00:00Z", [
    base(1, { isFeatured: false }), base(2, { isFeatured: false, allowSecondary: false }), base(3, { isFeatured: false }), base(4, { isFeatured: false }),
  ]);
  assert.equal(result.primary, null);
  assert.deepEqual(result.secondary.map((item) => item.id), [1, 3]);
  assert.ok(result.suppressed.some((item) => item.theme.id === 2 && item.reason === "NOT_SECONDARY"));
  assert.ok(result.suppressed.some((item) => item.theme.id === 4 && item.reason === "SECONDARY_CAPACITY"));
});

test("uses only a valid forced primary and otherwise falls back", () => {
  assert.equal(resolveThemes("2026-09-18T00:00:00Z", [base(1), base(2, { isFeatured: false })], 2).primary?.id, 2);
  assert.equal(resolveThemes("2026-09-18T00:00:00Z", [base(1), base(2, { status: "DRAFT" })], 2).primary?.id, 1);
  assert.equal(resolveThemes("2026-09-18T00:00:00Z", [base(1), base(2, { reviewValid: false })], 2).primary?.id, 1);
  assert.equal(resolveThemes("2026-09-18T00:00:00Z", [base(1), base(2, { endsAt: "2026-09-18T00:00:00.000Z" })], 2).primary?.id, 1);
  assert.equal(resolveThemes("2026-09-18T00:00:00Z", [base(1)], 999).primary?.id, 1);
});

test("deduplicates overlapping rules for one theme independent of input order", () => {
  const early = base(1, { startsAt: "2026-09-17T15:00:00.000Z", endsAt: "2026-09-19T00:00:00.000Z", triggerKind: "LUNAR_FIXED" });
  const late = base(1, { startsAt: "2026-09-17T16:00:00.000Z", endsAt: "2026-09-20T00:00:00.000Z", triggerKind: "SOLAR_FIXED" });
  const first = resolveThemes("2026-09-18T00:00:00Z", [late, early, base(2)]);
  const second = resolveThemes("2026-09-18T00:00:00Z", [base(2), early, late]);
  assert.deepEqual(first, second);
  assert.equal(first.primary?.startsAt, "2026-09-17T15:00:00.000Z");
  assert.equal(first.secondary.filter((item) => item.id === 1).length, 0);
});

test("does not mutate candidate arrays", () => {
  const candidates = [base(2), base(1)];
  const snapshot = structuredClone(candidates);
  resolveThemes("2026-09-18T00:00:00Z", candidates);
  assert.deepEqual(candidates, snapshot);
});

test("expands fixed dates at Shanghai local hour and minute boundaries", async () => {
  assert.deepEqual(await resolveTriggerWindows(rule({ startTimeLocal: "08:30", endTimeLocal: "09:45" }), 2026, provider()), [{ startsAt: "2026-09-18T00:30:00.000Z", endsAt: "2026-09-19T01:45:00.000Z" }]);
});

test("treats Feb 29 as a leap-year recurrence but rejects impossible Feb 30", async () => {
  assert.deepEqual(await resolveTriggerWindows(rule({ month: 2, day: 29 }), 2024, provider()), [{ startsAt: "2024-02-28T16:00:00.000Z", endsAt: "2024-02-29T16:00:00.000Z" }]);
  assert.deepEqual(await resolveTriggerWindows(rule({ month: 2, day: 29 }), 2025, provider()), []);
  await assert.rejects(resolveTriggerWindows(rule({ month: 2, day: 30 }), 2026, provider()), { code: "INVALID_DATE" });
});

test("applies signed offsets across calendar years", async () => {
  assert.deepEqual(await resolveTriggerWindows(rule({ month: 1, day: 1, startOffsetDays: -1, endOffsetDays: 1 }), 2026, provider()), [{ startsAt: "2025-12-30T16:00:00.000Z", endsAt: "2026-01-01T16:00:00.000Z" }]);
});

test("uses ONE_OFF exact explicit-offset intervals and rejects malformed intervals", async () => {
  assert.deepEqual(await resolveTriggerWindows(rule({ kind: "ONE_OFF", oneOffStartsAt: "2026-09-18T08:15:00+08:00", oneOffEndsAt: "2026-09-19T08:15:00+08:00" }), 2026, provider()), [{ startsAt: "2026-09-18T00:15:00.000Z", endsAt: "2026-09-19T00:15:00.000Z" }]);
  for (const candidate of [
    rule({ kind: "ONE_OFF", oneOffStartsAt: "2026-09-18", oneOffEndsAt: "2026-09-19T00:00:00Z" }),
    rule({ kind: "ONE_OFF", oneOffStartsAt: "2026-09-18T00:00:00Z", oneOffEndsAt: "2026-09-18T00:00:00Z" }),
    rule({ kind: "ONE_OFF", oneOffStartsAt: "2026-09-19T00:00:00Z", oneOffEndsAt: "2026-09-18T00:00:00Z" }),
    rule({ kind: "ONE_OFF", oneOffStartsAt: "not-an-instant", oneOffEndsAt: "2026-09-18T00:00:00Z" }),
    rule({ kind: "ONE_OFF", oneOffStartsAt: "2026-02-30T00:00:00Z", oneOffEndsAt: "2026-03-03T00:00:00Z" }),
  ]) await assert.rejects(resolveTriggerWindows(candidate, 2026, provider()), { code: /INVALID_INSTANT|INVALID_WINDOW/ });
});

test("uses a supplied editorial window and requires one", async () => {
  const window = { startsAt: "2026-06-07T16:00:00.000Z", endsAt: "2026-06-14T16:00:00.000Z" };
  assert.deepEqual(await resolveTriggerWindows(rule({ kind: "EDITORIAL_WINDOW" }), 2026, provider(), window), [window]);
  await assert.rejects(resolveTriggerWindows(rule({ kind: "EDITORIAL_WINDOW" }), 2026, provider()), { code: "MISSING_EDITORIAL_WINDOW" });
});

test("disabled rules return before calling a provider", async () => {
  const never = () => { throw new Error("provider must not be called"); };
  assert.deepEqual(await resolveTriggerWindows(rule({ kind: "LUNAR_FIXED", enabled: false }), 2026, provider({ resolveLunarDate: never, resolveLunarYearLastDay: never, resolveSolarTerm: never })), []);
});

test("forwards every lunar leap policy and uses the last-day provider contract", async () => {
  const seen: unknown[] = [];
  const lunarProvider = provider({
    resolveLunarDate: async (input) => { seen.push(input); return [{ year: 2026, month: 8, day: 20 }]; },
    resolveLunarYearLastDay: async (input) => { seen.push(input); return { year: 2026, month: 2, day: 16 }; },
  });
  for (const leapPolicy of ["REGULAR_ONLY", "LEAP_ONLY", "BOTH"] as const) await resolveTriggerWindows(rule({ kind: "LUNAR_FIXED", month: undefined, day: undefined, lunarMonth: 8, lunarDay: 15, leapPolicy }), 2026, lunarProvider);
  await resolveTriggerWindows(rule({ kind: "LUNAR_FIXED", month: undefined, day: undefined, lunarYearLastDay: true }), 2026, lunarProvider);
  assert.deepEqual(seen, [
    { gregorianYear: 2026, lunarMonth: 8, lunarDay: 15, leapPolicy: "REGULAR_ONLY", timezone: "Asia/Shanghai" },
    { gregorianYear: 2026, lunarMonth: 8, lunarDay: 15, leapPolicy: "LEAP_ONLY", timezone: "Asia/Shanghai" },
    { gregorianYear: 2026, lunarMonth: 8, lunarDay: 15, leapPolicy: "BOTH", timezone: "Asia/Shanghai" },
    { gregorianYear: 2026, timezone: "Asia/Shanghai" },
  ]);
});

test("honors the QINGMING provider date and propagates provider rejection", async () => {
  assert.deepEqual(await resolveTriggerWindows(rule({ kind: "SOLAR_TERM", month: undefined, day: undefined, solarTerm: "QINGMING" }), 2026, provider({ resolveSolarTerm: async () => ({ year: 2026, month: 4, day: 4 }) })), [{ startsAt: "2026-04-03T16:00:00.000Z", endsAt: "2026-04-04T16:00:00.000Z" }]);
  const failure = new Error("calendar unavailable");
  await assert.rejects(resolveTriggerWindows(rule({ kind: "SOLAR_TERM", month: undefined, day: undefined, solarTerm: "QINGMING" }), 2026, provider({ resolveSolarTerm: async () => { throw failure; } })), failure);
});

test("rejects malformed, wrong-year provider anchors and deduplicates duplicates", async () => {
  for (const anchor of [{ year: 2026, month: 2, day: 30 }, { year: 2025, month: 12, day: 31 }]) {
    await assert.rejects(resolveTriggerWindows(rule({ kind: "LUNAR_FIXED", month: undefined, day: undefined, lunarMonth: 8, lunarDay: 15, leapPolicy: "BOTH" }), 2026, provider({ resolveLunarDate: async () => [anchor] })), { code: anchor.year === 2026 ? "INVALID_PROVIDER_DATE" : "PROVIDER_DATE_WRONG_YEAR" });
  }
  assert.equal((await resolveTriggerWindows(rule({ kind: "LUNAR_FIXED", month: undefined, day: undefined, lunarMonth: 8, lunarDay: 15, leapPolicy: "BOTH" }), 2026, provider({ resolveLunarDate: async () => [{ year: 2026, month: 9, day: 25 }, { year: 2026, month: 9, day: 25 }] }))).length, 1);
});

test("requires the explicit Shanghai timezone and validates local times", async () => {
  await assert.rejects(resolveTriggerWindows({ ...rule(), timezone: "UTC" as "Asia/Shanghai" }, 2026, provider()), { code: "INVALID_TIMEZONE" });
  for (const time of ["8:00", "24:00", "12:60", "noon"]) await assert.rejects(resolveTriggerWindows(rule({ startTimeLocal: time }), 2026, provider()), { code: "INVALID_LOCAL_TIME" });
});

test("calendar helpers are host-timezone independent and reject DST gaps or folds", () => {
  assert.deepEqual(addCalendarDays({ year: 2026, month: 12, day: 31 }, 1), { year: 2027, month: 1, day: 1 });
  assert.equal(localDateTimeToUtc({ year: 2026, month: 9, day: 18 }, "00:00"), "2026-09-17T16:00:00.000Z");
  assert.throws(() => localDateTimeToUtc({ year: 1991, month: 4, day: 14 }, "02:30"), { code: "NONEXISTENT_LOCAL_TIME" });
  assert.throws(() => localDateTimeToUtc({ year: 1991, month: 9, day: 15 }, "01:30"), { code: "AMBIGUOUS_LOCAL_TIME" });
});
