import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { normalizeRecognitionPayload } from "../src/features/matches/model.ts";

const python = process.env.OCR_TEST_PYTHON;
assert.ok(python, "Set OCR_TEST_PYTHON to the Python used for the OCR HTTP tests");
const result = spawnSync(python, ["-c", [
  "import sys, json",
  "sys.path.insert(0, 'services/ocr')",
  "from parser import parse_data",
  "from test_ocr import fixture",
  "print(json.dumps({'pages': [parse_data(fixture(), 2200, 1000)]}))",
].join("; ")], { encoding: "utf8", windowsHide: true });
assert.equal(result.status, 0, result.stderr || String(result.error));
const normalized = normalizeRecognitionPayload(JSON.parse(result.stdout));
assert.equal(normalized.consistencyStatus, "FAIL", "Single-page preview must never pass six-page validation");
assert.equal(normalized.players.length, 10);
const player = normalized.players.find(({ side, slot }) => side === "blue" && slot === 1);
assert.equal(player.stats.damageDealt.value, 130200);
assert.equal(player.stats.participationRate.value, 55);
assert.equal(player.stats.kills.value, null, "Unobserved KDA must not become zero");
assert.equal(player.stats.damageDealt.sources[0].sourceScreenshotType, "DATA");
assert.ok(player.stats.damageDealt.sources[0].sourceRegion);
console.log("OCR Python -> TypeScript contract passed; incomplete six-page evidence fails closed");
