import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireComposeLock } from "./compose-lock.mjs";
import { fileSha256, verifyBackup } from "./backup-integrity.mjs";
import { localHealthUrl } from "./local-health-url.mjs";

test("two source directories share one daemon/project lock; distinct projects remain independent", () => {
  const base = mkdtempSync(join(tmpdir(), "wzywt-lock-regression-"));
  const release = acquireComposeLock("daemon-one", "same-project", "update-checkout-A", base);
  try {
    assert.throws(() => acquireComposeLock("daemon-one", "same-project", "backup-checkout-B", base), /Another operation/);
    const other = acquireComposeLock("daemon-one", "other-project", "update", base); other();
  } finally { release(); rmSync(base, { recursive: true, force: true }); }
});
test("backup verification rejects a truncated SQL even if complete remains true", () => {
  const base = mkdtempSync(join(tmpdir(), "wzywt-backup-regression-"));
  try {
    writeFileSync(join(base, "database.sql"), "-- fixture\nCREATE TABLE t(id INT);\n");
    writeFileSync(join(base, "manifest.json"), JSON.stringify({ complete: true, files: ["database.sql"], sha256: { "database.sql": fileSha256(join(base, "database.sql")) } }));
    assert.equal(verifyBackup(base).integrityVerified, true); assert.equal(verifyBackup(base).restoreVerified, false);
    writeFileSync(join(base, "database.sql"), "-- truncated");
    assert.throws(() => verifyBackup(base), /checksum mismatch/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
test("health targets cover wildcard, dedicated IPv4 and IPv6 without allowing arbitrary URLs", () => {
  assert.equal(localHealthUrl("0.0.0.0", 8001), "http://127.0.0.1:8001/api/health?mode=live");
  assert.equal(localHealthUrl("192.168.1.3", 8001), "http://192.168.1.3:8001/api/health?mode=live");
  assert.equal(localHealthUrl("::", 8001), "http://[::1]:8001/api/health?mode=live");
  assert.equal(localHealthUrl("::1", 8001), "http://[::1]:8001/api/health?mode=live");
  assert.throws(() => localHealthUrl("https://example.com"));
});
