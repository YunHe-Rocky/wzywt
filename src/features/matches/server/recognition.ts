import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  areNamesEquivalent,
  MATCH_SCREENSHOT_TYPES,
  normalizeRecognitionPayload,
  type NormalizedRecognitionResult,
} from "@/features/matches/model";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { getMediaStorage } from "@/lib/storage";
import { requireMatchManager } from "./access";
import { getRecognitionProviderUrl, recognizeMatchScreenshots, type RecognitionProviderFile } from "./recognition-provider";

async function streamToBuffer(stream: NodeJS.ReadableStream, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = typeof chunk === "string"
      ? Buffer.from(chunk)
      : Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as unknown as Uint8Array);
    size += buffer.length;
    if (size > maxBytes) throw new ServiceError("PAYLOAD_TOO_LARGE", "OCR 输入超过大小限制");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size);
}

async function addMemberRecommendations(matchId: number, normalized: NormalizedRecognitionResult) {
  const match = await prisma.internalMatch.findUnique({
    where: { id: matchId },
    select: {
      players: { select: { side: true, slot: true, memberId: true, roleType: true } },
      tournament: {
        select: {
          players: {
            where: { isSpectator: false, isTemporary: false, user: { isTemporary: false } },
            select: {
              userId: true,
              user: {
                select: {
                  username: true,
                  gameNickname: true,
                  rolePreferences: { select: { roleType: true, preferenceRank: true } },
                  heroPowers: { select: { heroId: true, roleType: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
  const participantById = new Map(match.tournament.players.map((participant) => [participant.userId, participant]));
  const eligibleBySide = new Map(["red", "blue"].map((side) => [
    side,
    match.players.filter((player) => player.side === side && player.memberId !== null).map((player) => player.memberId as number),
  ]));
  for (const player of normalized.players) {
    const currentSlot = match.players.find((slot) => slot.side === player.side && slot.slot === player.slot);
    const candidates = (eligibleBySide.get(player.side) ?? []).flatMap((memberId) => {
      const participant = participantById.get(memberId);
      if (!participant) return [];
      let confidence = 0;
      const reasons: string[] = [];
      if (player.nickname && [participant.user.gameNickname, participant.user.username].some((name) => name && areNamesEquivalent(player.nickname as string, name))) {
        confidence += 0.65;
        reasons.push("昵称匹配");
      }
      if (currentSlot?.memberId === memberId) {
        confidence += 0.15;
        reasons.push("赛前分队槽位一致");
      }
      if (player.heroId && participant.user.heroPowers.some((power) => power.heroId === player.heroId)) {
        confidence += 0.12;
        reasons.push("常用英雄匹配");
      }
      const assignedRole = match.players.find((slot) => slot.memberId === memberId)?.roleType;
      if (assignedRole && participant.user.rolePreferences.some((preference) => preference.roleType === assignedRole && preference.preferenceRank <= 2)) {
        confidence += 0.08;
        reasons.push("分路偏好可参考");
      }
      return [{ memberId, username: participant.user.username, confidence: Math.min(1, Number(confidence.toFixed(2))), reasons }];
    }).sort((left, right) => right.confidence - left.confidence || left.memberId - right.memberId);
    player.recommendations = candidates.slice(0, 3);
  }
  return normalized;
}

export interface RecognitionScreenshotSnapshot {
  id: number;
  type: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  sha256: string;
  revision: number;
}

interface CompleteRecognitionInput {
  recognitionId: number;
  matchId: number;
  raw: unknown;
  normalized: NormalizedRecognitionResult;
}

export async function completeMatchRecognition({ recognitionId, matchId, raw, normalized }: CompleteRecognitionInput) {
  const recognition = await prisma.matchRecognition.findFirst({
    where: { id: recognitionId, matchId },
    select: { status: true, evidenceRevision: true },
  });
  if (!recognition) throw new ServiceError("NOT_FOUND", "识别任务不存在");
  const finishedAt = new Date();
  if (recognition.status !== "RUNNING") {
    return { recognitionId, status: recognition.status, finishedAt };
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.internalMatch.updateMany({
      where: {
        id: matchId,
        evidenceRevision: recognition.evidenceRevision,
        activeRecognitionId: recognitionId,
        status: { in: ["UPLOADED", "WAITING_CONFIRMATION"] },
      },
      data: {
        status: "WAITING_CONFIRMATION",
        activeRecognitionId: null,
        consistencyStatus: normalized.consistencyStatus,
        consistencyDetails: {
          warnings: normalized.warnings,
          conflictCount: normalized.conflicts.length,
          recognitionId,
          evidenceRevision: recognition.evidenceRevision,
        },
      },
    });
    if (claimed.count !== 1) {
      await tx.matchRecognition.updateMany({
        where: { id: recognitionId, status: "RUNNING" },
        data: { status: "SUPERSEDED", errorCode: "STALE_EVIDENCE", finishedAt },
      });
      return { recognitionId, status: "SUPERSEDED" as const, finishedAt };
    }

    const completed = await tx.matchRecognition.updateMany({
      where: { id: recognitionId, status: "RUNNING" },
      data: {
        status: "COMPLETED",
        rawResult: raw as Prisma.InputJsonValue,
        normalizedResult: normalized as unknown as Prisma.InputJsonValue,
        warnings: normalized.warnings as Prisma.InputJsonValue,
        errorCode: null,
        finishedAt,
      },
    });
    if (completed.count !== 1) throw new ServiceError("CONFLICT", "识别任务已被其他结果处理");
    await tx.matchScreenshot.updateMany({
      where: { matchId },
      data: { recognitionStatus: "COMPLETED" },
    });
    return { recognitionId, status: "COMPLETED" as const, normalizedResult: normalized, finishedAt };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function startMatchRecognition(tournamentId: number, matchId: number) {
  getRecognitionProviderUrl();
  const actor = await requireMatchManager(tournamentId, matchId);
  const queueLimit = Math.max(1, Math.min(100, Number.parseInt(process.env.MATCH_OCR_QUEUE_LIMIT || "20", 10) || 20));
  return prisma.$transaction(async (tx) => {
    const queuedCount = await tx.matchRecognition.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } });
    if (queuedCount >= queueLimit) {
      throw new ServiceError("TOO_MANY_REQUESTS", "OCR 任务队列已满，请稍后重试", { retryAfterSeconds: 15 });
    }
    const match = await tx.internalMatch.findFirst({
      where: { id: matchId, tournamentId },
      select: {
        status: true,
        evidenceRevision: true,
        activeRecognitionId: true,
        screenshots: {
          orderBy: { type: "asc" },
          select: { id: true, type: true, storageKey: true, originalFilename: true, mimeType: true, size: true, sha256: true, revision: true },
        },
      },
    });
    if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
    if (!["UPLOADED", "WAITING_CONFIRMATION"].includes(match.status)) {
      throw new ServiceError("CONFLICT", match.status === "SUBMITTED" || match.status === "CONFIRMED"
        ? "已确认或正式提交的比赛档案不能重新识别"
        : "必须先上传完整六类截图");
    }
    if (match.activeRecognitionId !== null) throw new ServiceError("CONFLICT", "已有识别任务正在排队或运行");
    const actualTypes = new Set(match.screenshots.map(({ type }) => type));
    if (MATCH_SCREENSHOT_TYPES.some((type) => !actualTypes.has(type))) {
      throw new ServiceError("BUSINESS_VALIDATION_FAILED", "必须先上传完整六类截图");
    }
    const sameEvidence = await tx.matchRecognition.findFirst({
      where: {
        matchId,
        evidenceRevision: match.evidenceRevision,
        status: { in: ["QUEUED", "RUNNING", "COMPLETED"] },
      },
      select: { id: true, status: true },
    });
    if (sameEvidence) {
      throw new ServiceError("CONFLICT", sameEvidence.status === "COMPLETED" ? "相同截图版本已经完成识别" : "相同截图版本正在排队或识别");
    }
    const inputSnapshot: RecognitionScreenshotSnapshot[] = match.screenshots.map((screenshot) => ({ ...screenshot }));
    const recognition = await tx.matchRecognition.create({
      data: {
        matchId,
        status: "QUEUED",
        engine: "configured-http-v1",
        evidenceRevision: match.evidenceRevision,
        inputSnapshot: inputSnapshot as unknown as Prisma.InputJsonValue,
        startedById: actor.userId,
        availableAt: new Date(),
      },
      select: { id: true, status: true, evidenceRevision: true, createdAt: true },
    });
    const claimed = await tx.internalMatch.updateMany({
      where: {
        id: matchId,
        evidenceRevision: match.evidenceRevision,
        activeRecognitionId: null,
        status: { in: ["UPLOADED", "WAITING_CONFIRMATION"] },
      },
      data: { activeRecognitionId: recognition.id },
    });
    if (claimed.count !== 1) throw new ServiceError("CONFLICT", "截图或比赛状态已变化，请刷新后重试");
    await tx.matchScreenshot.updateMany({
      where: { matchId, id: { in: inputSnapshot.map(({ id }) => id) } },
      data: { recognitionStatus: "QUEUED" },
    });
    return { recognitionId: recognition.id, status: recognition.status, evidenceRevision: recognition.evidenceRevision, createdAt: recognition.createdAt };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function parseSnapshot(value: Prisma.JsonValue | null): RecognitionScreenshotSnapshot[] {
  if (!Array.isArray(value) || value.length !== MATCH_SCREENSHOT_TYPES.length) {
    throw new ServiceError("BUSINESS_VALIDATION_FAILED", "OCR 任务输入快照无效");
  }
  const parsed = value.map((item) => {
    if (
      typeof item !== "object" || item === null || Array.isArray(item)
      || typeof item.id !== "number" || !Number.isSafeInteger(item.id)
      || typeof item.type !== "string" || !MATCH_SCREENSHOT_TYPES.includes(item.type as (typeof MATCH_SCREENSHOT_TYPES)[number])
      || typeof item.storageKey !== "string" || typeof item.originalFilename !== "string"
      || typeof item.mimeType !== "string" || typeof item.size !== "number" || !Number.isSafeInteger(item.size)
      || typeof item.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(item.sha256)
      || typeof item.revision !== "number" || !Number.isSafeInteger(item.revision)
    ) throw new ServiceError("BUSINESS_VALIDATION_FAILED", "OCR 任务输入快照无效");
    return item as unknown as RecognitionScreenshotSnapshot;
  });
  if (new Set(parsed.map(({ type }) => type)).size !== MATCH_SCREENSHOT_TYPES.length) {
    throw new ServiceError("BUSINESS_VALIDATION_FAILED", "OCR 任务输入快照类型不完整");
  }
  return parsed;
}

async function handleRecognitionFailure(
  recognitionId: number,
  matchId: number,
  attemptCount: number,
  error: unknown,
): Promise<void> {
  const code = error instanceof ServiceError ? error.code : "RECOGNITION_FAILED";
  const retryable = code === "SERVICE_UNAVAILABLE" || code === "RECOGNITION_FAILED";
  const shouldRetry = retryable && attemptCount < 3;
  const now = new Date();
  const availableAt = new Date(now.getTime() + Math.min(60_000, 15_000 * 2 ** Math.max(0, attemptCount - 1)));
  await prisma.$transaction(async (tx) => {
    const updated = await tx.matchRecognition.updateMany({
      where: { id: recognitionId, status: "RUNNING" },
      data: shouldRetry
        ? { status: "QUEUED", errorCode: code, heartbeatAt: null, startedAt: null, finishedAt: null, availableAt }
        : { status: "FAILED", errorCode: code, heartbeatAt: null, finishedAt: now },
    });
    if (updated.count !== 1) return;
    if (!shouldRetry) {
      await tx.internalMatch.updateMany({
        where: { id: matchId, activeRecognitionId: recognitionId },
        data: { activeRecognitionId: null },
      });
    }
    await tx.matchScreenshot.updateMany({
      where: { matchId, recognitionStatus: { in: ["QUEUED", "PROCESSING"] } },
      data: { recognitionStatus: shouldRetry ? "QUEUED" : "FAILED" },
    });
  });
}

async function executeClaimedRecognition(task: {
  id: number;
  matchId: number;
  inputSnapshot: Prisma.JsonValue | null;
  attemptCount: number;
}, signal?: AbortSignal): Promise<void> {
  const heartbeatIntervalMs = 15_000;
  let heartbeatWrites = Promise.resolve();
  const heartbeatTimer = setInterval(() => {
    heartbeatWrites = heartbeatWrites.then(async () => {
      await prisma.matchRecognition.updateMany({
        where: { id: task.id, status: "RUNNING" },
        data: { heartbeatAt: new Date() },
      });
    }).catch(() => undefined);
  }, heartbeatIntervalMs);
  heartbeatTimer.unref();
  try {
    signal?.throwIfAborted();
    const screenshots = parseSnapshot(task.inputSnapshot);
    const storage = getMediaStorage();
    const providerFiles: RecognitionProviderFile[] = [];
    for (const screenshot of screenshots) {
      signal?.throwIfAborted();
      const info = await storage.stat(screenshot.storageKey);
      if (!info || info.size !== screenshot.size) throw new ServiceError("BUSINESS_VALIDATION_FAILED", `${screenshot.type} 原图不存在或大小不一致`);
      const data = await streamToBuffer(await storage.open(screenshot.storageKey), screenshot.size);
      if (createHash("sha256").update(data).digest("hex") !== screenshot.sha256) {
        throw new ServiceError("BUSINESS_VALIDATION_FAILED", `${screenshot.type} 原图校验和不一致`);
      }
      providerFiles.push({
        type: screenshot.type,
        filename: `${screenshot.type.toLowerCase()}-${screenshot.originalFilename}`,
        mimeType: screenshot.mimeType,
        data,
      });
    }
    const raw = await recognizeMatchScreenshots(providerFiles, signal);
    const normalized = await addMemberRecommendations(task.matchId, normalizeRecognitionPayload(raw));
    await completeMatchRecognition({ recognitionId: task.id, matchId: task.matchId, raw, normalized });
  } catch (error) {
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : error;
    await handleRecognitionFailure(task.id, task.matchId, task.attemptCount, error);
  } finally {
    clearInterval(heartbeatTimer);
    await heartbeatWrites;
  }
}

export async function recoverInterruptedRecognitions(now = new Date()): Promise<number> {
  const staleBefore = new Date(now.getTime() - 3 * 60 * 1000);
  const stale = await prisma.matchRecognition.findMany({
    where: {
      status: "RUNNING",
      OR: [
        { heartbeatAt: { lt: staleBefore } },
        { heartbeatAt: null, startedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { id: "asc" },
    take: 20,
    select: { id: true, matchId: true, attemptCount: true },
  });
  let recovered = 0;
  for (const task of stale) {
    const retry = task.attemptCount < 3;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.matchRecognition.updateMany({
        where: { id: task.id, status: "RUNNING" },
        data: retry
          ? { status: "QUEUED", errorCode: "WORKER_INTERRUPTED", heartbeatAt: null, startedAt: null, availableAt: now }
          : { status: "FAILED", errorCode: "WORKER_INTERRUPTED", heartbeatAt: null, finishedAt: now },
      });
      if (updated.count !== 1) return;
      recovered++;
      if (!retry) {
        await tx.internalMatch.updateMany({ where: { id: task.matchId, activeRecognitionId: task.id }, data: { activeRecognitionId: null } });
      }
      await tx.matchScreenshot.updateMany({
        where: { matchId: task.matchId, recognitionStatus: "PROCESSING" },
        data: { recognitionStatus: retry ? "QUEUED" : "FAILED" },
      });
    });
  }
  return recovered;
}

export async function runQueuedMatchRecognitions(
  limit = 1,
  options: { signal?: AbortSignal } = {},
): Promise<{ recovered: number; processed: number }> {
  options.signal?.throwIfAborted();
  const recovered = await recoverInterruptedRecognitions();
  const now = new Date();
  const candidates = await prisma.matchRecognition.findMany({
    where: { status: "QUEUED", availableAt: { lte: now } },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(2, limit)) * 4,
    select: { id: true },
  });
  let processed = 0;
  for (const candidate of candidates) {
    options.signal?.throwIfAborted();
    if (processed >= Math.max(1, Math.min(2, limit))) break;
    const claimed = await prisma.matchRecognition.updateMany({
      where: { id: candidate.id, status: "QUEUED", availableAt: { lte: now } },
      data: { status: "RUNNING", attemptCount: { increment: 1 }, startedAt: now, heartbeatAt: now, errorCode: null },
    });
    if (claimed.count !== 1) continue;
    const task = await prisma.matchRecognition.findUniqueOrThrow({
      where: { id: candidate.id },
      select: { id: true, matchId: true, inputSnapshot: true, attemptCount: true },
    });
    await prisma.matchScreenshot.updateMany({ where: { matchId: task.matchId, recognitionStatus: "QUEUED" }, data: { recognitionStatus: "PROCESSING" } });
    await executeClaimedRecognition(task, options.signal);
    processed++;
  }
  return { recovered, processed };
}

export async function cancelMatchRecognition(tournamentId: number, matchId: number) {
  await requireMatchManager(tournamentId, matchId);
  return prisma.$transaction(async (tx) => {
    const match = await tx.internalMatch.findFirst({
      where: { id: matchId, tournamentId },
      select: { activeRecognitionId: true },
    });
    if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
    if (match.activeRecognitionId === null) throw new ServiceError("CONFLICT", "当前没有可取消的识别任务");
    const finishedAt = new Date();
    const canceled = await tx.matchRecognition.updateMany({
      where: { id: match.activeRecognitionId, matchId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELED", errorCode: "USER_CANCELED", heartbeatAt: null, finishedAt },
    });
    if (canceled.count !== 1) throw new ServiceError("CONFLICT", "识别任务状态已变化，请刷新后重试");
    await tx.internalMatch.updateMany({
      where: { id: matchId, activeRecognitionId: match.activeRecognitionId },
      data: { activeRecognitionId: null },
    });
    await tx.matchScreenshot.updateMany({
      where: { matchId, recognitionStatus: { in: ["QUEUED", "PROCESSING"] } },
      data: { recognitionStatus: "PENDING" },
    });
    return { recognitionId: match.activeRecognitionId, status: "CANCELED" as const, finishedAt };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
