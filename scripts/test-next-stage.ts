import assert from "node:assert/strict";
import { File } from "node:buffer";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseByteRange } from "@/features/combat-posts/model";
import {
  areNamesEquivalent,
  MATCH_SCREENSHOT_TYPES,
  normalizeRecognitionPayload,
  STAT_FIELDS_BY_SCREENSHOT,
} from "@/features/matches/model";
import { canViewSharedTacticAnnotations, parseTacticGeometry, tacticColorForSlot, visibleTacticAnnotationOwnerId } from "@/features/tactics/model";
import { formatTacticTime, getTacticTimeline, parseTacticTime } from "@/features/tactics/timeline";
import { validateCombatVideo, validateScreenshotFile } from "@/lib/media-validation";
import { LocalMediaStorage } from "@/lib/storage/local";

function recognitionPayload(conflict = false) {
  return {
    pages: MATCH_SCREENSHOT_TYPES.map((type) => ({
      type,
      players: (["red", "blue"] as const).flatMap((side) => Array.from({ length: 5 }, (_, index) => ({
        side,
        slot: index + 1,
        nickname: `${side}-${index + 1}`,
        heroName: `hero-${index + 1}`,
        score: { value: 10 + index, confidence: 0.99 },
        metrics: Object.fromEntries(STAT_FIELDS_BY_SCREENSHOT[type].map((field) => [field, {
          value: conflict && side === "red" && index === 0 && type === "OUTPUT" && field === "damageDealt" ? 999 : 100 + index,
          confidence: 0.98,
        }])),
      }))),
    })),
  };
}

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  assert.deepEqual(MATCH_SCREENSHOT_TYPES, ["DATA", "OUTPUT", "SURVIVAL", "DEVELOPMENT", "KDA", "TEAM"]);
  assert.equal(MATCH_SCREENSHOT_TYPES.includes("OVERVIEW" as never), false);
  assert.equal(MATCH_SCREENSHOT_TYPES.includes("PERFORMANCE" as never), false);
  assert.equal(areNamesEquivalent(" Player·01 ", "player01"), true);
  assert.equal(normalizeRecognitionPayload(recognitionPayload()).players.length, 10);
  assert.equal(normalizeRecognitionPayload(recognitionPayload()).consistencyStatus, "PASS");
  const conflicted = normalizeRecognitionPayload(recognitionPayload(true));
  assert.equal(conflicted.consistencyStatus, "WARNING");
  assert.equal(conflicted.conflicts.some(({ field }) => field === "damageDealt"), true);
  assert.equal(conflicted.players[0].stats.damageDealt.value, null, "跨图冲突不得伪造默认值");

  assert.deepEqual(parseByteRange(null, 100), { kind: "full" });
  assert.deepEqual(parseByteRange("bytes=10-19", 100), { kind: "partial", range: { start: 10, end: 19 } });
  assert.deepEqual(parseByteRange("bytes=-10", 100), { kind: "partial", range: { start: 90, end: 99 } });
  assert.deepEqual(parseByteRange("bytes=100-", 100), { kind: "invalid" });
  assert.equal(parseTacticGeometry({ version: 1, arrow: true, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })?.points.length, 2);
  assert.equal(parseTacticGeometry({ version: 1, arrow: true, points: [{ x: -0.1, y: 0 }, { x: 1, y: 1 }] }), null);
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => tacticColorForSlot(index + 1)), ["crimson", "azure", "amber", "jade", "violet"]);
  const tacticCss = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const factionPalettes = {
    red: ["#ff4d5f", "#f76f7c", "#dc3548", "#ff8878", "#c62845"],
    blue: ["#3b82f6", "#60a5fa", "#2563eb", "#38bdf8", "#1d4ed8"],
  };
  for (const [side, expected] of Object.entries(factionPalettes)) {
    const block = tacticCss.match(new RegExp(String.raw`\.tactic-shell--${side}\s*\{[^}]+\}`, "i"))?.[0] || "";
    const colors = [...block.matchAll(/--tactic-member-\d:\s*(#[0-9a-f]{6})/gi)].map((match) => match[1].toLowerCase());
    assert.deepEqual(colors, expected, `${side} 方必须使用同阵营五人语义色板`);
  }
  assert.throws(() => tacticColorForSlot(6), /INVALID_TACTIC_SLOT/);
  assert.equal(canViewSharedTacticAnnotations("DRAFT"), false);
  assert.equal(canViewSharedTacticAnnotations("UPLOADED"), false, "仅上传截图不得提前公开战术标注");
  assert.equal(canViewSharedTacticAnnotations("CONFIRMED"), false);
  assert.equal(canViewSharedTacticAnnotations("SUBMITTED"), true);
  assert.equal(visibleTacticAnnotationOwnerId(false, 42), 42, "赛果提交前只查询本人标注");
  assert.equal(visibleTacticAnnotationOwnerId(true, 42), undefined, "正式提交后取消 owner filter 并公开队内标注");
  assert.equal(parseTacticTime("2:00"), 120);
  assert.equal(parseTacticTime("2:60"), null);
  assert.equal(formatTacticTime(120), "2:00");
  const openingTimeline = getTacticTimeline(9);
  assert.equal(openingTimeline.find(({ id }) => id === "lane")?.nextAt, 10);
  const secondWave = getTacticTimeline(10).find(({ id }) => id === "lane");
  assert.equal(secondWave?.waveNumber, 1);
  assert.equal(secondWave?.nextAt, 43);
  const clearedBuff = getTacticTimeline(45, { buff: 40 }).find(({ id }) => id === "buff");
  assert.equal(clearedBuff?.state, "respawning");
  assert.equal(clearedBuff?.nextAt, 130);
  assert.equal(getTacticTimeline(1200).find(({ id }) => id === "tempest")?.state, "ready");

  const png = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])], "../unsafe.png", { type: "image/png" });
  const validPng = await validateScreenshotFile(png as unknown as globalThis.File);
  assert.equal(validPng.extension, "png");
  assert.equal(validPng.originalFilename.includes(".."), false);
  await assert.rejects(() => validateScreenshotFile(new File([Buffer.from("fake")], "fake.png", { type: "image/png" }) as unknown as globalThis.File), /真实的/);
  const mp4 = Buffer.alloc(12); mp4.write("ftyp", 4, "ascii");
  assert.equal((await validateCombatVideo(new File([mp4], "clip.mp4", { type: "video/mp4" }) as unknown as globalThis.File)).mimeType, "video/mp4");

  const root = await mkdtemp(join(tmpdir(), "wzywt-media-"));
  try {
    const storage = new LocalMediaStorage(root);
    const saved = await storage.save({ namespace: "post-videos", extension: "mp4", data: Buffer.from("0123456789") });
    assert.equal(saved.key.includes(".."), false);
    assert.equal(await storage.exists(saved.key), true);
    assert.equal(await streamText(await storage.open(saved.key, { start: 2, end: 5 })), "2345");
    await assert.rejects(() => storage.open("../../secret"), /INVALID_STORAGE_KEY/);
    await storage.delete(saved.key);
    assert.equal(await storage.exists(saved.key), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  console.log("Next-stage domain, media, range, and tactic tests passed.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
