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
import { recognizeMatchScreenshots, type RecognitionProviderFile } from "./recognition-provider";

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

export async function startMatchRecognition(tournamentId: number, matchId: number) {
  const actor = await requireMatchManager(tournamentId, matchId);
  const match = await prisma.internalMatch.findUnique({
    where: { id: matchId },
    select: {
      status: true,
      screenshots: {
        orderBy: { type: "asc" },
        select: { id: true, type: true, storageKey: true, originalFilename: true, mimeType: true, size: true },
      },
    },
  });
  if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
  if (match.status === "SUBMITTED") throw new ServiceError("CONFLICT", "正式比赛档案不能重新识别");
  const actualTypes = new Set(match.screenshots.map(({ type }) => type));
  if (MATCH_SCREENSHOT_TYPES.some((type) => !actualTypes.has(type))) {
    throw new ServiceError("BUSINESS_VALIDATION_FAILED", "必须先上传完整六类截图");
  }
  const recognition = await prisma.matchRecognition.create({
    data: { matchId, status: "RUNNING", engine: "configured-http-v1", startedById: actor.userId, startedAt: new Date() },
    select: { id: true },
  });
  try {
    const storage = getMediaStorage();
    const providerFiles: RecognitionProviderFile[] = [];
    for (const screenshot of match.screenshots) {
      const info = await storage.stat(screenshot.storageKey);
      if (!info || info.size !== screenshot.size) throw new ServiceError("BUSINESS_VALIDATION_FAILED", `${screenshot.type} 原图不存在或大小不一致`);
      providerFiles.push({
        type: screenshot.type,
        filename: `${screenshot.type.toLowerCase()}-${screenshot.originalFilename}`,
        mimeType: screenshot.mimeType,
        data: await streamToBuffer(await storage.open(screenshot.storageKey), screenshot.size),
      });
    }
    const raw = await recognizeMatchScreenshots(providerFiles);
    const normalized = await addMemberRecommendations(matchId, normalizeRecognitionPayload(raw));
    const finishedAt = new Date();
    await prisma.$transaction([
      prisma.matchRecognition.update({
        where: { id: recognition.id },
        data: {
          status: "COMPLETED",
          rawResult: raw as Prisma.InputJsonValue,
          normalizedResult: normalized as unknown as Prisma.InputJsonValue,
          warnings: normalized.warnings as Prisma.InputJsonValue,
          finishedAt,
        },
      }),
      prisma.matchScreenshot.updateMany({
        where: { matchId },
        data: { recognitionStatus: "COMPLETED" },
      }),
      prisma.internalMatch.update({
        where: { id: matchId },
        data: {
          status: "WAITING_CONFIRMATION",
          consistencyStatus: normalized.consistencyStatus,
          consistencyDetails: {
            warnings: normalized.warnings,
            conflictCount: normalized.conflicts.length,
            recognitionId: recognition.id,
          },
        },
      }),
    ]);
    return { recognitionId: recognition.id, status: "COMPLETED", normalizedResult: normalized, finishedAt };
  } catch (error) {
    const code = error instanceof ServiceError ? error.code : "RECOGNITION_FAILED";
    await prisma.matchRecognition.update({
      where: { id: recognition.id },
      data: { status: "FAILED", errorCode: code, finishedAt: new Date() },
    }).catch(() => undefined);
    throw error;
  }
}
