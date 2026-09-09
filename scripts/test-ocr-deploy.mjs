import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parseDeployEnv } from "./deploy-env.mjs";

const repo = resolve(import.meta.dirname, "..");
test("preflight rejects duplicate OCR settings without leaking their values", () => {
  for (const key of ["MATCH_OCR_ENDPOINT", "MATCH_OCR_TOKEN"]) {
    assert.throws(() => parseDeployEnv(`${key}=private-first\n${key}=private-second\n`), (error) => {
      assert.match(error.message, /Duplicate environment key/);
      assert.match(error.message, /line 2/);
      assert.match(error.message, /line 1/);
      assert.doesNotMatch(error.message, /private-first|private-second/);
      return true;
    });
  }
});
test("preflight rejects Markdown and escaped OCR URLs", () => {
  for (const value of ["[https://ocr.example/recognize](https://ocr.example/recognize)", String.raw`"https\://ocr.example/recognize"`]) {
    assert.throws(() => parseDeployEnv(`MATCH_OCR_ENDPOINT=${value}\n`));
  }
});
test("OCR secrets are never emitted as shell deployment settings", () => {
  const parsed = parseDeployEnv("MATCH_OCR_ENDPOINT=https://ocr.example/recognize\nMATCH_OCR_TOKEN=private-token\n");
  assert.equal(parsed.has("MATCH_OCR_TOKEN"), false);
  assert.equal(parsed.has("MATCH_OCR_ENDPOINT"), false);
});

test("web and cron replace or clear stale OCR settings using release .env", () => {
  const dir = mkdtempSync(join(tmpdir(), "wzywt-ocr-env-"));
  try {
    for (const configured of [true, false]) {
      writeFileSync(join(dir, ".env"), configured
        ? "MATCH_OCR_ENDPOINT=https://ocr.example/recognize\nMATCH_OCR_TOKEN=new-test-token\n"
        : "# OCR disabled\n");
      const result = spawnSync(process.execPath, ["-e", "console.log(JSON.stringify(require('./ecosystem.config.js').apps.map(app => ({ endpoint: app.env.MATCH_OCR_ENDPOINT, token: app.env.MATCH_OCR_TOKEN }))))"], {
        cwd: repo, encoding: "utf8", windowsHide: true,
        env: { ...process.env, APP_DIR: dir, MATCH_OCR_ENDPOINT: "https://old.example/recognize", MATCH_OCR_TOKEN: "stale-test-token" },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), Array(2).fill({
        endpoint: configured ? "https://ocr.example/recognize" : "", token: configured ? "new-test-token" : "",
      }));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deployment preflight checks OCR URL policy without contacting the provider or printing secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "wzywt-ocr-preflight-"));
  try {
    for (const [mode, endpoint, accepted] of [
      ["local", "http://127.0.0.1:8010/recognize", true],
      ["local", "http://192.168.1.73:8010/recognize", true],
      ["local", "http://public.example/recognize", false],
      ["production", "http://127.0.0.1:8010/recognize", true],
      ["production", "http://localhost:8010/recognize", true],
      ["production", "http://[::1]:8010/recognize", true],
      ["production", "http://192.168.1.73:8010/recognize", false],
      ["production", "http://public.example/recognize", false],
      ["production", "https://ocr.example/recognize?secret=private-query", true],
      ["production", "", true],
    ]) {
      const file = join(dir, ".env");
      writeFileSync(file, `DEPLOY_ENVIRONMENT=${mode}\nMATCH_OCR_ENDPOINT=${endpoint}\nMATCH_OCR_TOKEN=private-ocr-test-token\n`);
      const result = spawnSync(process.execPath, ["scripts/check-ocr-config.mjs", file], {
        cwd: repo, encoding: "utf8", windowsHide: true,
        env: { ...process.env, DEPLOY_ENVIRONMENT: mode },
      });
      assert.equal(result.status, accepted ? 0 : 1, result.stderr);
      assert.doesNotMatch(result.stdout + result.stderr, /private-query|private-ocr-test-token/);
      if (accepted) assert.match(result.stdout, /config valid|not configured/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
