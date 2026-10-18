import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatThemeWindowShanghai,
  isThemeCardActive,
  safeSourceUrl,
  themeCardExpiryDelay,
} from "../../../src/features/history-theme/presentation";
import { buildFutureCalendarDays } from "../../../src/web/components/history-theme/studio-data";

describe("history theme presentation", () => {
  it("rejects source links that are not absolute HTTP(S) URLs", () => {
    assert.equal(safeSourceUrl("javascript:alert(1)"), null);
    assert.equal(safeSourceUrl("//example.org"), null);
    assert.equal(safeSourceUrl("/internal/source"), null);
    assert.equal(safeSourceUrl("ftp://example.org/archive"), null);
    assert.equal(safeSourceUrl("https://example.org/archive"), "https://example.org/archive");
  });

  it("treats the end instant as outside the active card window", () => {
    const theme = {
      startsAt: "2026-09-19T00:00:00+08:00",
      endsAt: "2026-09-20T00:00:00+08:00",
    };

    assert.equal(isThemeCardActive(theme, Date.parse("2026-09-19T00:00:00+08:00")), true);
    assert.equal(isThemeCardActive(theme, Date.parse("2026-09-20T00:00:00+08:00")), false);
  });

  it("fails closed for invalid, reversed, or non-finite card windows", () => {
    assert.equal(isThemeCardActive({ startsAt: "invalid", endsAt: "2026-09-20T00:00:00+08:00" }), false);
    assert.equal(isThemeCardActive({ startsAt: "2026-09-20T00:00:00+08:00", endsAt: "2026-09-19T00:00:00+08:00" }), false);
    assert.equal(isThemeCardActive({ startsAt: "2026-09-19T00:00:00+08:00", endsAt: "2026-09-20T00:00:00+08:00" }, Number.NaN), false);
  });

  it("rejects impossible calendar and clock components in every window helper", () => {
    const invalidInstants = [
      "2026-02-30T00:00:00+08:00",
      "2026-13-01T00:00:00+08:00",
      "2026-01-01T24:00:00+08:00",
      "2026-01-01T00:60:00+08:00",
      "2026-01-01T00:00:60+08:00",
    ];
    const validEnd = "2026-03-03T00:00:00+08:00";
    const now = Date.parse("2026-03-01T00:00:00+08:00");

    for (const startsAt of invalidInstants) {
      const theme = { startsAt, endsAt: validEnd };
      assert.equal(isThemeCardActive(theme, now), false, startsAt);
      assert.equal(themeCardExpiryDelay(theme, now), null, startsAt);
      assert.equal(formatThemeWindowShanghai(theme), null, startsAt);
    }
  });

  it("accepts a leap-day window with an explicit non-Shanghai offset in every helper", () => {
    const theme = {
      startsAt: "2024-02-29T23:30:00+05:30",
      endsAt: "2024-03-01T01:00:00+05:30",
    };
    const now = Date.parse("2024-03-01T00:30:00+05:30");

    assert.equal(isThemeCardActive(theme, now), true);
    assert.equal(themeCardExpiryDelay(theme, now), 30 * 60 * 1000);
    assert.equal(formatThemeWindowShanghai(theme), "2024年3月1日 02:00 — 3月1日 03:30");
    assert.equal(isThemeCardActive(theme, Date.parse(theme.endsAt)), false);
  });

  it("formats a valid window in Asia/Shanghai and rejects an invalid window", () => {
    assert.equal(
      formatThemeWindowShanghai({
        startsAt: "2026-09-19T00:00:00+08:00",
        endsAt: "2026-09-20T00:00:00+08:00",
      }),
      "2026年9月19日 00:00 — 9月20日 00:00",
    );
    assert.equal(formatThemeWindowShanghai({ startsAt: "invalid", endsAt: "invalid" }), null);
  });

  it("keeps long-lived expiry timers inside the browser timeout boundary", () => {
    const now = Date.parse("2026-09-19T00:00:00+08:00");
    const delay = themeCardExpiryDelay({
      startsAt: "2026-09-18T00:00:00+08:00",
      endsAt: "2100-01-01T00:00:00+08:00",
    }, now);

    assert.ok(delay !== null && delay <= 2_147_483_000);
  });

  it("uses the Asia/Shanghai calendar date for machine-readable day keys", () => {
    const [day] = buildFutureCalendarDays(Date.parse("2026-09-18T18:00:00Z"), 1);
    assert.equal(day.key, "2026-09-19");
    assert.match(day.label, /9月19日/);
  });
});
