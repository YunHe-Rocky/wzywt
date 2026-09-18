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
