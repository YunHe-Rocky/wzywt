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
import * as matchModel from "@/features/matches/model";
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
          value: field === "participationRate"
            ? 63 + index
            : conflict && side === "red" && index === 0 && type === "OUTPUT" && field === "damageDealt" ? 999 : 100 + index,
          confidence: 0.98,
        }])),
      }))),
    })),
  };
}

function testRecognitionMissingValues() {
  // Missing OCR must remain reviewable through the existing manual confirmation flow.
  const empty = normalizeRecognitionPayload({
    pages: recognitionPayload().pages.map((page) => ({
      ...page,
      players: page.players.map((player) => ({ ...player, score: undefined, metrics: {} })),
    })),
  });
  assert.equal(empty.consistencyStatus, "WARNING", "六页齐全但统计和评分均未识别时不能显示 PASS，也不能阻断人工补齐");
  assert.equal(empty.players.flatMap((player) => Object.values(player.stats)).filter(({ value }) => value === null).length, 140);
  assert.equal(empty.players.filter(({ score }) => score.value === null).length, 10);
  assert.ok(empty.players.every(({ warnings }) => warnings.some((warning) => /评分/.test(warning))));

  const requiredStats = [
    ["damageDealt", "输出伤害"], ["damageTaken", "承受伤害"], ["gold", "总经济"],
    ["participationRate", "参团率"], ["damageConversionRate", "伤害转化比"],
    ["damageTakenPerDeath", "每死承伤"], ["jungleGold", "野怪经济"], ["minionKills", "补刀"],
    ["kills", "击败"], ["deaths", "死亡"], ["assists", "助攻"], ["controlScore", "控制效果"],
    ["healing", "治疗量"], ["towerDamage", "对塔伤害"],
  ] as const;
  for (const [field, label] of requiredStats) {
    const payload = recognitionPayload();
    for (const page of payload.pages) delete page.players[0].metrics[field];
    const missing = normalizeRecognitionPayload(payload);
    assert.equal(missing.consistencyStatus, "WARNING", `${field} 缺失必须提示人工确认`);
    assert.equal(missing.players[0].stats[field].value, null, `${field} 缺失不得补零`);
    assert.ok(missing.players[0].warnings.some((warning) => warning.includes(label) && /人工/.test(warning)), `${field} 警告必须指出待补字段和处理方式`);
    assert.equal(missing.players[1].warnings.length, 0, "缺项警告应归属具体玩家");
  }

  const nullValues = normalizeRecognitionPayload({
    pages: recognitionPayload().pages.map((page) => ({
      ...page,
      players: page.players.map((player) => ({
        ...player,
        score: { value: null, confidence: 0.4 },
        metrics: { ...player.metrics, ...(page.type === "KDA" ? { deaths: { value: null, confidence: 0.4 } } : {}) },
      })),
    })),
  });
  assert.equal(nullValues.consistencyStatus, "WARNING");
  assert.equal(nullValues.players[0].score.value, null);
  assert.equal(nullValues.players[0].stats.deaths.value, null);
  assert.equal(nullValues.players[0].stats.deaths.sources[0].confidence, 0.4, "缺项仍应保留原始置信度用于复核");
  assert.ok(nullValues.players[0].warnings.some((warning) => /评分/.test(warning)));
  assert.ok(nullValues.players[0].warnings.some((warning) => /死亡/.test(warning)));

  const zero = normalizeRecognitionPayload({
    pages: recognitionPayload().pages.map((page) => ({
      ...page,
      players: page.players.map((player) => ({
        ...player,
        heroId: 1,
        heroName: null,
        score: page.type === "DATA" ? { value: 0 } : undefined,
        metrics: Object.fromEntries(Object.keys(player.metrics).map((field) => [field, { value: 0 }])),
      })),
    })),
  });
  assert.equal(zero.consistencyStatus, "PASS", "零值有效，heroId 可替代名称，其他五页无需重复提供评分");
  assert.equal(zero.players[0].score.value, 0);
  assert.equal(zero.players[0].stats.kills.value, 0);

  const supplemented = normalizeRecognitionPayload({
    pages: recognitionPayload().pages.map((page) => ({
      ...page,
      players: page.players.map((player) => ({
        ...player,
        ...(page.type === "DATA" ? { score: null, metrics: {} } : {}),
      })),
    })),
  });
  assert.equal(supplemented.consistencyStatus, "PASS", "DATA 漏读的重复指标和评分可由其他页可靠补足");
  assert.equal(supplemented.players[0].score.value, 10);
  assert.equal(supplemented.players[0].stats.damageDealt.value, 100);
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
  const participationRates = matchModel as typeof matchModel & {
    participationRateFromPercentage: (value: number) => number;
    participationRateToPercentage: (value: number) => number;
    normalizeLegacyParticipationRate: <T extends number | string>(value: T) => T | number | string;
    normalizeRecognitionParticipationRate: (value: number, version: unknown) => number;
    normalizeLegacyParticipationRateGroup: (values: Array<number | string>) => Array<number | string>;
  };
  assert.equal(typeof participationRates.participationRateFromPercentage, "function", "参团率需要明确的百分数到存储小数转换");
  assert.equal(participationRates.participationRateFromPercentage(63), 0.63);
  assert.equal(participationRates.participationRateFromPercentage(33.33), 0.3333);
  assert.equal(participationRates.participationRateToPercentage(0.6333), 63.33);
  assert.equal(participationRates.normalizeLegacyParticipationRate("63"), "0.63", "旧 OCR 草稿百分数需要兼容转换");
  assert.equal(participationRates.normalizeLegacyParticipationRate(0.63), 0.63, "既有存储小数不能被重复转换");
  assert.equal(typeof participationRates.normalizeRecognitionParticipationRate, "function", "新旧识别结果必须按显式版本区分参团率单位");
  assert.equal(participationRates.normalizeRecognitionParticipationRate(1, 1), 0.01, "旧版识别结果中的 1 表示 1% 而不是 100%");
  assert.equal(participationRates.normalizeRecognitionParticipationRate(0.01, 2), 0.01, "新版识别结果已经使用规范小数，不能重复转换");
  assert.deepEqual(participationRates.normalizeLegacyParticipationRateGroup([63, 0.63, 1]), [0.63, 0.63, 1], "混合单位旧草稿只能转换明确大于 1 的百分数，不能破坏合法小数");
  assert.deepEqual(participationRates.normalizeLegacyParticipationRateGroup([0.63, 1, 0]), [0.63, 1, 0], "规范小数组不能被重复转换");
  const normalizedRecognition = normalizeRecognitionPayload(recognitionPayload());
  assert.equal(Number(normalizedRecognition.version), 2, "规范化后的识别结果必须提升版本以区分单位语义");
  assert.equal(normalizedRecognition.players.length, 10);
  assert.equal(normalizedRecognition.consistencyStatus, "PASS");
  assert.equal(normalizedRecognition.players[0].stats.participationRate.value, 0.63, "OCR 百分数必须在进入业务模型时转为存储小数");
  assert.ok(normalizedRecognition.players[0].stats.participationRate.sources.every(({ value }) => value === 0.63), "识别来源值也必须使用同一规范单位");
  const conflicted = normalizeRecognitionPayload(recognitionPayload(true));
  assert.equal(conflicted.consistencyStatus, "WARNING");
  assert.equal(conflicted.conflicts.some(({ field }) => field === "damageDealt"), true);
  assert.equal(conflicted.players[0].stats.damageDealt.value, null, "跨图冲突不得伪造默认值");
  testRecognitionMissingValues();

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

  const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const png = new File([pngBytes], "../unsafe.png", { type: "image/png" });
  const validPng = await validateScreenshotFile(png as unknown as globalThis.File);
  assert.equal(validPng.extension, "png");
  assert.equal(validPng.originalFilename.includes(".."), false);
  const oversizedPng = Buffer.from(pngBytes);
  oversizedPng.writeUInt32BE(9_000, 16);
  await assert.rejects(() => validateScreenshotFile(new File([oversizedPng], "huge.png", { type: "image/png" }) as unknown as globalThis.File), /像素尺寸/);
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
