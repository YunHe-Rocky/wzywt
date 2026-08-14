import { Prisma } from "@prisma/client";
import { isMatchSide, type MatchSide } from "@/features/matches/model";
import { parseTacticGeometry, tacticColorForSlot } from "@/features/tactics/model";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PermissionError } from "@/lib/permissions";
import { ServiceError } from "@/lib/service-error";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") throw new ServiceError("VALIDATION_ERROR", `${label}格式错误`);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new ServiceError("VALIDATION_ERROR", `${label}长度应为 ${min}-${max} 字`);
  return text;
}

function parseId(value: unknown, label: string): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0) throw new ServiceError("VALIDATION_ERROR", `${label}无效`);
  return number;
}

function parseNonNegativeInt(value: unknown, label: string, nullable = false): number | null {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 86_400) throw new ServiceError("VALIDATION_ERROR", `${label}无效`);
  return value;
}

function parseDate(value: unknown): Date {
  if (typeof value !== "string") throw new ServiceError("VALIDATION_ERROR", "版本格式错误");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ServiceError("VALIDATION_ERROR", "版本格式错误");
  return date;
}

async function getTacticAccess(tournamentId: number, matchId: number, requestedSide: unknown) {
  const user = await requireAuth();
  if (!isMatchSide(requestedSide)) throw new ServiceError("VALIDATION_ERROR", "战术阵营无效");
  const match = await prisma.internalMatch.findFirst({
    where: { id: matchId, tournamentId },
    select: {
      players: { select: { memberId: true, side: true, slot: true } },
      tournament: { select: { admins: { where: { userId: user.userId }, select: { role: true } } } },
    },
  });
  if (!match) throw new ServiceError("NOT_FOUND", "比赛不存在");
  const ownSlot = match.players.find(({ memberId }) => memberId === user.userId);
  if (user.role !== "admin" && ownSlot?.side !== requestedSide) throw new PermissionError();
  const owner = user.role === "admin" || match.tournament.admins.some(({ role }) => role === "owner");
  return { user, side: requestedSide, ownSlot, canManageLayers: owner };
}

async function requireLayerManager(tournamentId: number, matchId: number, side: MatchSide) {
  const access = await getTacticAccess(tournamentId, matchId, side);
  if (!access.canManageLayers) throw new PermissionError();
  return access;
}

export async function getTacticRoom(tournamentId: number, matchId: number, side: MatchSide) {
  const access = await getTacticAccess(tournamentId, matchId, side);
  const room = await prisma.tacticRoom.findUnique({
    where: { matchId_side: { matchId, side } },
    include: {
      layers: {
        orderBy: { sortOrder: "asc" },
        include: {
          routes: { orderBy: { ownerMemberId: "asc" }, include: { ownerMember: { select: { id: true, username: true } } } },
          markers: { orderBy: { id: "asc" }, include: { ownerMember: { select: { id: true, username: true } } } },
        },
      },
    },
  });
  if (!room) throw new ServiceError("NOT_FOUND", "战术室不存在");
  return {
    room: {
      id: room.id,
      matchId: room.matchId,
      side: room.side,
      layers: room.layers.map((layer) => ({
        ...layer,
        routes: layer.routes.map((route) => ({ ...route, canEdit: route.ownerMemberId === access.user.userId })),
        markers: layer.markers.map((marker) => ({ ...marker, x: Number(marker.x), y: Number(marker.y), canEdit: marker.ownerMemberId === access.user.userId })),
      })),
    },
    access: {
      userId: access.user.userId,
      canManageLayers: access.canManageLayers,
      canDraw: Boolean(access.ownSlot),
      ownColorKey: access.ownSlot ? tacticColorForSlot(access.ownSlot.slot) : null,
    },
  };
}

export async function createTacticLayer(tournamentId: number, matchId: number, side: MatchSide, input: unknown) {
  const access = await requireLayerManager(tournamentId, matchId, side);
  if (!isRecord(input)) throw new ServiceError("VALIDATION_ERROR", "图层数据格式错误");
  const name = parseText(input.name, "图层名称", 1, 64);
  const description = input.description === null || input.description === undefined || input.description === ""
    ? null
    : parseText(input.description, "战术说明", 1, 1000);
  const startTime = parseNonNegativeInt(input.startTime, "开始时间", true);
  const endTime = parseNonNegativeInt(input.endTime, "结束时间", true);
  if (startTime !== null && endTime !== null && endTime < startTime) throw new ServiceError("VALIDATION_ERROR", "结束时间不能早于开始时间");
  const room = await prisma.tacticRoom.findUnique({ where: { matchId_side: { matchId, side } }, select: { id: true } });
  if (!room) throw new ServiceError("NOT_FOUND", "战术室不存在");
  return prisma.$transaction(async (tx) => {
    const last = await tx.tacticLayer.findFirst({ where: { roomId: room.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    return tx.tacticLayer.create({
      data: { roomId: room.id, name, description, startTime, endTime, sortOrder: (last?.sortOrder ?? -1) + 1, createdById: access.user.userId },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateTacticLayer(tournamentId: number, matchId: number, side: MatchSide, layerId: number, input: unknown) {
  await requireLayerManager(tournamentId, matchId, side);
  if (!isRecord(input)) throw new ServiceError("VALIDATION_ERROR", "图层数据格式错误");
  const expectedUpdatedAt = parseDate(input.expectedUpdatedAt);
  const name = parseText(input.name, "图层名称", 1, 64);
  const description = input.description === null || input.description === undefined || input.description === "" ? null : parseText(input.description, "战术说明", 1, 1000);
  const startTime = parseNonNegativeInt(input.startTime, "开始时间", true);
  const endTime = parseNonNegativeInt(input.endTime, "结束时间", true);
  if (startTime !== null && endTime !== null && endTime < startTime) throw new ServiceError("VALIDATION_ERROR", "结束时间不能早于开始时间");
  const updated = await prisma.tacticLayer.updateMany({
    where: { id: layerId, updatedAt: expectedUpdatedAt, room: { matchId, side } },
    data: { name, description, startTime, endTime },
  });
  if (updated.count !== 1) throw new ServiceError("CONFLICT", "图层已变化，请刷新后重试");
  return { ok: true };
}

export async function deleteTacticLayer(tournamentId: number, matchId: number, side: MatchSide, layerId: number, expectedUpdatedAt: unknown) {
  await requireLayerManager(tournamentId, matchId, side);
  const deleted = await prisma.tacticLayer.deleteMany({ where: { id: layerId, updatedAt: parseDate(expectedUpdatedAt), room: { matchId, side } } });
  if (deleted.count !== 1) throw new ServiceError("CONFLICT", "图层已变化，请刷新后重试");
  return { ok: true };
}

async function requireOwnLayer(tournamentId: number, matchId: number, side: MatchSide, layerId: number) {
  const access = await getTacticAccess(tournamentId, matchId, side);
  const ownSlot = access.ownSlot;
  if (!ownSlot) throw new PermissionError();
  const layer = await prisma.tacticLayer.findFirst({ where: { id: layerId, room: { matchId, side } }, select: { id: true } });
  if (!layer) throw new ServiceError("NOT_FOUND", "战术图层不存在");
  return { ...access, ownSlot, layer };
}

export async function saveOwnTacticRoute(tournamentId: number, matchId: number, side: MatchSide, layerId: number, input: unknown) {
  const access = await requireOwnLayer(tournamentId, matchId, side, layerId);
  if (!isRecord(input)) throw new ServiceError("VALIDATION_ERROR", "路线数据格式错误");
  const geometry = parseTacticGeometry(input.geometry);
  if (!geometry) throw new ServiceError("VALIDATION_ERROR", "路线必须是 2-64 个相对坐标点");
  const expectedRevision = input.expectedRevision === undefined ? 0 : parseId(input.expectedRevision, "路线版本");
  const current = await prisma.tacticRoute.findUnique({
    where: { layerId_ownerMemberId: { layerId, ownerMemberId: access.user.userId } },
    select: { id: true, revision: true },
  });
  if (!current) {
    if (expectedRevision !== 0) throw new ServiceError("CONFLICT", "路线版本冲突，请刷新后重试");
    return prisma.tacticRoute.create({
      data: { layerId, ownerMemberId: access.user.userId, colorKey: tacticColorForSlot(access.ownSlot.slot), geometry: geometry as unknown as Prisma.InputJsonValue },
    });
  }
  if (current.revision !== expectedRevision) throw new ServiceError("CONFLICT", "路线已被更新，请刷新后重试");
  const updated = await prisma.tacticRoute.updateMany({
    where: { id: current.id, ownerMemberId: access.user.userId, revision: expectedRevision },
    data: { geometry: geometry as unknown as Prisma.InputJsonValue, revision: { increment: 1 } },
  });
  if (updated.count !== 1) throw new ServiceError("CONFLICT", "路线已被更新，请刷新后重试");
  return prisma.tacticRoute.findUniqueOrThrow({ where: { id: current.id } });
}

export async function deleteOwnTacticRoute(tournamentId: number, matchId: number, side: MatchSide, routeId: number, expectedRevision: unknown) {
  const access = await getTacticAccess(tournamentId, matchId, side);
  if (!access.ownSlot) throw new PermissionError();
  const revision = parseId(expectedRevision, "路线版本");
  const deleted = await prisma.tacticRoute.deleteMany({
    where: { id: routeId, ownerMemberId: access.user.userId, revision, layer: { room: { matchId, side } } },
  });
  if (deleted.count !== 1) throw new ServiceError("CONFLICT", "路线不存在、无权删除或版本已变化");
  return { ok: true };
}

function parseCoordinate(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new ServiceError("VALIDATION_ERROR", `${label}必须是 0-1 的相对坐标`);
  return value;
}

export async function createOwnTacticMarker(tournamentId: number, matchId: number, side: MatchSide, layerId: number, input: unknown) {
  const access = await requireOwnLayer(tournamentId, matchId, side, layerId);
  if (!isRecord(input) || !["POINT", "TEXT"].includes(String(input.type))) throw new ServiceError("VALIDATION_ERROR", "点位类型无效");
  const type = String(input.type);
  const text = type === "TEXT" ? parseText(input.text, "文字", 1, 120) : null;
  return prisma.tacticMarker.create({
    data: { layerId, ownerMemberId: access.user.userId, type, x: parseCoordinate(input.x, "X"), y: parseCoordinate(input.y, "Y"), text },
  });
}

export async function updateOwnTacticMarker(tournamentId: number, matchId: number, side: MatchSide, markerId: number, input: unknown) {
  const access = await getTacticAccess(tournamentId, matchId, side);
  if (!access.ownSlot || !isRecord(input)) throw new PermissionError();
  if (!["POINT", "TEXT"].includes(String(input.type))) throw new ServiceError("VALIDATION_ERROR", "点位类型无效");
  const revision = parseId(input.expectedRevision, "点位版本");
  const type = String(input.type);
  const updated = await prisma.tacticMarker.updateMany({
    where: { id: markerId, ownerMemberId: access.user.userId, revision, layer: { room: { matchId, side } } },
    data: {
      type,
      x: parseCoordinate(input.x, "X"),
      y: parseCoordinate(input.y, "Y"),
      text: type === "TEXT" ? parseText(input.text, "文字", 1, 120) : null,
      revision: { increment: 1 },
    },
  });
  if (updated.count !== 1) throw new ServiceError("CONFLICT", "点位不存在、无权修改或版本已变化");
  return { ok: true };
}

export async function deleteOwnTacticMarker(tournamentId: number, matchId: number, side: MatchSide, markerId: number, expectedRevision: unknown) {
  const access = await getTacticAccess(tournamentId, matchId, side);
  if (!access.ownSlot) throw new PermissionError();
  const deleted = await prisma.tacticMarker.deleteMany({
    where: { id: markerId, ownerMemberId: access.user.userId, revision: parseId(expectedRevision, "点位版本"), layer: { room: { matchId, side } } },
  });
  if (deleted.count !== 1) throw new ServiceError("CONFLICT", "点位不存在、无权删除或版本已变化");
  return { ok: true };
}
