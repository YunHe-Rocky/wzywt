import assert from "node:assert/strict";
import { test } from "node:test";

import { planEditorialWindow } from "@/core/history-theme/editorial";
import type { EditorialCandidate, TimeWindow } from "@/core/history-theme/types";

const candidate = (id: number, overrides: Partial<EditorialCandidate> = {}): EditorialCandidate => ({
  id,
  status: "PUBLISHED",
  reviewValid: true,
  lastShownOn: null,
  ...overrides,
});

test("uses the second full Monday-Sunday week in January and June 2026", () => {
  assert.deepEqual(planEditorialWindow({ year: 2026, month: 1, candidates: [candidate(1)], solemnWindows: [] }).window, {
    startsAt: "2026-01-11T16:00:00.000Z", endsAt: "2026-01-18T16:00:00.000Z",
  });
  assert.deepEqual(planEditorialWindow({ year: 2026, month: 6, candidates: [candidate(1)], solemnWindows: [] }).window, {
    startsAt: "2026-06-07T16:00:00.000Z", endsAt: "2026-06-14T16:00:00.000Z",
  });
});

test("chooses second full week without postponing for a preceding memorial", () => {
  const result = planEditorialWindow({ year: 2026, month: 12, candidates: [candidate(12)], solemnWindows: [{ startsAt: "2026-12-12T16:00:00.000Z", endsAt: "2026-12-13T16:00:00.000Z" }] });
  assert.deepEqual(result.window, { startsAt: "2026-12-13T16:00:00.000Z", endsAt: "2026-12-20T16:00:00.000Z" });
  assert.equal(result.postponedWeeks, 0);
});

test("postpones a whole week for a conflict inside the December window", () => {
  const result = planEditorialWindow({ year: 2026, month: 12, candidates: [candidate(12)], solemnWindows: [{ startsAt: "2026-12-18T00:00:00.000Z", endsAt: "2026-12-19T00:00:00.000Z" }] });
  assert.deepEqual(result.window, { startsAt: "2026-12-20T16:00:00.000Z", endsAt: "2026-12-27T16:00:00.000Z" });
  assert.equal(result.postponedWeeks, 1);
});

test("enforces the exact 24-calendar-month cooldown boundary", () => {
  const exact = planEditorialWindow({ year: 2026, month: 6, candidates: [candidate(1, { lastShownOn: { year: 2024, month: 6, day: 8 } })], solemnWindows: [] });
  const oneDayEarly = planEditorialWindow({ year: 2026, month: 6, candidates: [candidate(1, { lastShownOn: { year: 2024, month: 6, day: 9 } })], solemnWindows: [] });
  assert.equal(exact.themeId, 1);
  assert.equal(exact.reason, "SELECTED");
  assert.equal(oneDayEarly.themeId, null);
  assert.equal(oneDayEarly.reason, "NO_ELIGIBLE_THEME");
});

test("clips leap-day cooldown overflow to the target month's last day", () => {
  const result = planEditorialWindow({ year: 2026, month: 2, candidates: [candidate(1, { lastShownOn: { year: 2024, month: 2, day: 29 } })], solemnWindows: [] });
  assert.equal(result.themeId, null);
  assert.equal(result.reason, "NO_ELIGIBLE_THEME");
});

test("selects never-shown first, then oldest date, then stable id", () => {
  assert.equal(planEditorialWindow({ year: 2026, month: 6, candidates: [candidate(3, { lastShownOn: { year: 2020, month: 1, day: 1 } }), candidate(2), candidate(1)], solemnWindows: [] }).themeId, 1);
  assert.equal(planEditorialWindow({ year: 2026, month: 6, candidates: [candidate(3, { lastShownOn: { year: 2020, month: 1, day: 2 } }), candidate(2, { lastShownOn: { year: 2020, month: 1, day: 1 } }), candidate(1, { lastShownOn: { year: 2020, month: 1, day: 1 } })], solemnWindows: [] }).themeId, 1);
});

test("excludes draft and unreviewed candidates", () => {
  const result = planEditorialWindow({ year: 2026, month: 6, candidates: [candidate(1, { status: "DRAFT" }), candidate(2, { reviewValid: false })], solemnWindows: [] });
  assert.equal(result.themeId, null);
  assert.equal(result.reason, "NO_ELIGIBLE_THEME");
});

test("rejects a forced missing, invalid, or cooling candidate", () => {
  for (const candidates of [[candidate(1)], [candidate(1), candidate(2, { status: "DRAFT" })], [candidate(1), candidate(2, { reviewValid: false })], [candidate(1), candidate(2, { lastShownOn: { year: 2025, month: 1, day: 1 } })]]) {
    const result = planEditorialWindow({ year: 2026, month: 6, candidates, solemnWindows: [], forcedThemeId: 2 });
    assert.equal(result.themeId, null);
    assert.equal(result.reason, "INVALID_OVERRIDE");
  }
});

test("forces an eligible theme and marks it FORCED", () => {
  const result = planEditorialWindow({ year: 2026, month: 6, candidates: [candidate(1), candidate(2)], solemnWindows: [], forcedThemeId: 2 });
  assert.equal(result.themeId, 2);
  assert.equal(result.reason, "FORCED");
});

test("repeated overlaps advance whole weeks and endpoint touching is allowed", () => {
  const solemnWindows: TimeWindow[] = [
    { startsAt: "2026-06-08T00:00:00.000Z", endsAt: "2026-06-09T00:00:00.000Z" },
    { startsAt: "2026-06-15T00:00:00.000Z", endsAt: "2026-06-16T00:00:00.000Z" },
    { startsAt: "2026-06-28T16:00:00.000Z", endsAt: "2026-06-29T16:00:00.000Z" },
  ];
  const result = planEditorialWindow({ year: 2026, month: 6, candidates: [candidate(1)], solemnWindows });
  assert.deepEqual(result.window, { startsAt: "2026-06-21T16:00:00.000Z", endsAt: "2026-06-28T16:00:00.000Z" });
  assert.equal(result.postponedWeeks, 2);
});

test("evaluates cooldown against the final postponed window", () => {
  const result = planEditorialWindow({ year: 2026, month: 6, candidates: [candidate(1, { lastShownOn: { year: 2024, month: 6, day: 20 } })], solemnWindows: [
    { startsAt: "2026-06-08T00:00:00.000Z", endsAt: "2026-06-09T00:00:00.000Z" },
    { startsAt: "2026-06-15T00:00:00.000Z", endsAt: "2026-06-16T00:00:00.000Z" },
  ] });
  assert.equal(result.themeId, 1);
  assert.equal(result.postponedWeeks, 2);
});

test("returns NO_AVAILABLE_WEEK when conflicts push the window beyond the year", () => {
  const result = planEditorialWindow({ year: 2026, month: 12, candidates: [candidate(1)], solemnWindows: [
    { startsAt: "2026-12-18T00:00:00.000Z", endsAt: "2026-12-19T00:00:00.000Z" },
    { startsAt: "2026-12-22T00:00:00.000Z", endsAt: "2026-12-23T00:00:00.000Z" },
  ] });
  assert.equal(result.themeId, null);
  assert.equal(result.window, null);
  assert.equal(result.reason, "NO_AVAILABLE_WEEK");
  assert.equal(result.postponedWeeks, 2);
  assert.equal(result.label, "演武堂历史策划");
});

test("stops conflict evaluation as soon as postponement crosses the year boundary", () => {
  const result = planEditorialWindow({
    year: 2026,
    month: 12,
    candidates: [candidate(1)],
    solemnWindows: [{ startsAt: "2026-12-18T00:00:00.000Z", endsAt: "2027-02-01T00:00:00.000Z" }],
  });
  assert.equal(result.reason, "NO_AVAILABLE_WEEK");
  assert.equal(result.window, null);
  assert.equal(result.postponedWeeks, 2);
});

test("does not mutate editorial inputs", () => {
  const candidates = [candidate(2), candidate(1)];
  const solemnWindows = [{ startsAt: "2026-06-08T00:00:00.000Z", endsAt: "2026-06-09T00:00:00.000Z" }];
  const snapshot = structuredClone({ candidates, solemnWindows });
  planEditorialWindow({ year: 2026, month: 6, candidates, solemnWindows });
  assert.deepEqual({ candidates, solemnWindows }, snapshot);
});
