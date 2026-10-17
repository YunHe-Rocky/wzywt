import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { parseArguments } from "./compose.mjs";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

test("deployment documentation local links resolve", () => {
  const files = ["README.md", "AGENTS.md", ...readdirSync(resolve(root, "docs"), { recursive: true })
    .filter((file) => file.endsWith(".md"))
    .map((file) => `docs/${file.replaceAll("\\", "/")}`)];
  const missing = [];
  for (const file of files) {
    for (const match of read(file).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      try { target = decodeURIComponent(target); } catch { /* Keep literal target for the error. */ }
      if (!existsSync(resolve(root, dirname(file), target))) missing.push(`${file} -> ${match[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("documented compose manager commands are accepted by the argument parser", () => {
  const files = ["README.md", "docs/operations/docker.md", "docs/operations/maintenance.md"];
  let count = 0;
  for (const file of files) {
    for (const match of read(file).matchAll(/^node scripts\/compose\.mjs ([^\r\n]+)$/gm)) {
      const args = match[1].trim().split(/\s+/);
      assert.doesNotThrow(() => parseArguments(args), `${file}: ${match[0]}`);
      count += 1;
    }
  }
  assert.ok(count >= 25, "expected the end-to-end runbook commands to be covered");
});

test("env template, runbook and architecture agree on storage and backup contracts", () => {
  const template = read(".env.docker.example");
  const runbook = read("docs/operations/docker.md");
  const architecture = read("docs/architecture/runtime-architecture.md");
  for (const key of ["STORAGE_MODE", "OSS_MOUNT_PATH", "OSS_DATA_PATH", "COMPOSE_BACKUP_DIR", "MYSQL_MODE", "MYSQL_HOST", "MYSQL_PORT", "OCR_MODE"]) {
    assert.match(template, new RegExp(`^${key}=`, "m"), `${key} missing from env template`);
    assert.ok(runbook.includes(key), `${key} missing from deployment runbook`);
  }
  for (const service of ["web", "cron", "mysql", "redis", "storage-init", "migrate", "ocr"]) {
    assert.ok(architecture.includes(`\`${service}\``), `${service} missing from runtime architecture`);
  }
  for (const artifact of ["database.sql", "media.tar.gz", "hero-assets.tar.gz", "manifest.json"]) {
    assert.ok(runbook.includes(artifact), `${artifact} missing from runbook`);
    assert.ok(architecture.includes(artifact), `${artifact} missing from architecture`);
  }
  for (const required of ["remoteUploadVerified", "findmnt", "fuse.rclone", "prisma migrate deploy", "电脑", "手机", "恢复演练"]) {
    assert.ok(runbook.includes(required), `${required} missing from implementation acceptance`);
  }
});
