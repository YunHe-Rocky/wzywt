import { Prisma } from "@prisma/client";
import { parseByteRange } from "@/features/combat-posts/model";
import type { StreamedCombatVideo } from "@/features/combat-posts/server/upload";
import { deleteOrQueueMedia } from "@/features/media/server/storage-cleanup";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PermissionError } from "@/lib/permissions";
import { ServiceError } from "@/lib/service-error";
import { getMediaStorage } from "@/lib/storage";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") throw new ServiceError("VALIDATION_ERROR", `${label}格式错误`);
  const text = value.trim();
  if (text.length < min || text.length > max) throw new ServiceError("VALIDATION_ERROR", `${label}长度应为 ${min}-${max} 字`);
  return text;
}

function parseOptionalId(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0) throw new ServiceError("VALIDATION_ERROR", `${label}无效`);
  return number;
}

export async function createCombatPost(
  input: unknown,
  media: StreamedCombatVideo,
  user: { userId: number },
) {
  const storage = getMediaStorage();
  try {
    if (!isRecord(input)) throw new ServiceError("VALIDATION_ERROR", "动态数据格式错误");
    const title = parseText(input.title, "标题", 2, 128);
    const content = parseText(input.content, "正文", 2, 10_000);
    const matchId = parseOptionalId(input.matchId, "比赛 ID");
    const requestedTournamentId = parseOptionalId(input.tournamentId, "赛事 ID");
    let tournamentId = requestedTournamentId;
    if (matchId) {
      const match = await prisma.internalMatch.findUnique({ where: { id: matchId }, select: { tournamentId: true, status: true } });
      if (!match) throw new ServiceError("NOT_FOUND", "关联比赛不存在");
      if (match.status !== "SUBMITTED") throw new ServiceError("BUSINESS_VALIDATION_FAILED", "只能关联已正式提交的比赛");
      if (requestedTournamentId && requestedTournamentId !== match.tournamentId) throw new ServiceError("VALIDATION_ERROR", "比赛与赛事不匹配");
      tournamentId = match.tournamentId;
    } else if (tournamentId) {
      const exists = await prisma.tournament.count({ where: { id: tournamentId } });
      if (!exists) throw new ServiceError("NOT_FOUND", "关联赛事不存在");
    }
    return await prisma.combatPost.create({
      data: {
        tournamentId,
        matchId,
        authorId: user.userId,
        title,
        content,
        videoStorageKey: media.key,
        originalFilename: media.originalFilename,
        mimeType: media.mimeType,
        size: media.size,
        sha256: media.sha256,
      },
      select: { id: true, title: true, status: true, createdAt: true },
    });
  } catch (error) {
    await deleteOrQueueMedia(storage, media.key, "combat-post-create-failure");
    throw error;
  }
}

export async function listCombatPosts(pageValue: unknown = 1) {
  const user = await requireAuth();
  const page = typeof pageValue === "number" ? pageValue : Number(pageValue);
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const pageSize = 12;
  const where = user.role === "admin" ? { status: { not: "deleted" } } : { status: "published" };
  const [posts, total] = await Promise.all([
    prisma.combatPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        content: true,
        status: true,
        matchId: true,
        tournamentId: true,
        mimeType: true,
        createdAt: true,
        author: { select: { id: true, username: true, avatar: true } },
        likes: { where: { userId: user.userId }, select: { id: true } },
        _count: { select: { likes: true, comments: { where: { status: "active" } } } },
      },
    }),
    prisma.combatPost.count({ where }),
  ]);
  return {
    posts: posts.map(({ likes, ...post }) => ({ ...post, likedByMe: likes.length > 0, videoUrl: `/api/combat-posts/${post.id}/video` })),
    page: safePage,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getCombatPost(postId: number) {
  const user = await requireAuth();
  const post = await prisma.combatPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      content: true,
      status: true,
      matchId: true,
      tournamentId: true,
      mimeType: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      author: { select: { id: true, username: true, avatar: true } },
      likes: { where: { userId: user.userId }, select: { id: true } },
      comments: {
        where: { status: "active" },
        orderBy: { createdAt: "asc" },
        select: { id: true, content: true, createdAt: true, updatedAt: true, authorId: true, author: { select: { id: true, username: true, avatar: true } } },
      },
      _count: { select: { likes: true, comments: { where: { status: "active" } } } },
    },
  });
  if (!post) throw new ServiceError("NOT_FOUND", "动态不存在");
  if (post.status !== "published" && user.role !== "admin" && post.authorId !== user.userId) throw new ServiceError("NOT_FOUND", "动态不存在");
  const { likes, ...rest } = post;
  return { post: { ...rest, likedByMe: likes.length > 0, videoUrl: `/api/combat-posts/${post.id}/video` }, access: { canModerate: user.role === "admin", canEditOwnComments: true } };
}

async function requirePublishedPost(postId: number) {
  const post = await prisma.combatPost.findUnique({ where: { id: postId }, select: { id: true, status: true } });
  if (!post) throw new ServiceError("NOT_FOUND", "动态不存在");
  if (post.status !== "published") throw new ServiceError("CONFLICT", "动态当前不可互动");
  return post;
}

export async function likeCombatPost(postId: number) {
  const user = await requireAuth();
  await requirePublishedPost(postId);
  try {
    await prisma.combatPostLike.create({ data: { postId, userId: user.userId } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
  return { liked: true, count: await prisma.combatPostLike.count({ where: { postId } }) };
}

export async function unlikeCombatPost(postId: number) {
  const user = await requireAuth();
  await prisma.combatPostLike.deleteMany({ where: { postId, userId: user.userId } });
  return { liked: false, count: await prisma.combatPostLike.count({ where: { postId } }) };
}

export async function createCombatPostComment(postId: number, input: unknown) {
  const user = await requireAuth();
  await requirePublishedPost(postId);
  if (!isRecord(input)) throw new ServiceError("VALIDATION_ERROR", "评论数据格式错误");
  const content = parseText(input.content, "评论", 1, 1000);
  const recent = await prisma.combatPostComment.count({
    where: { authorId: user.userId, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= 20) throw new ServiceError("TOO_MANY_REQUESTS", "评论过于频繁，请稍后再试");
  return prisma.combatPostComment.create({
    data: { postId, authorId: user.userId, content },
    select: { id: true, content: true, createdAt: true, authorId: true, author: { select: { id: true, username: true, avatar: true } } },
  });
}

export async function deleteCombatPostComment(postId: number, commentId: number) {
  const user = await requireAuth();
  const comment = await prisma.combatPostComment.findFirst({ where: { id: commentId, postId }, select: { authorId: true } });
  if (!comment) throw new ServiceError("NOT_FOUND", "评论不存在");
  if (comment.authorId !== user.userId && user.role !== "admin") throw new PermissionError();
  await prisma.combatPostComment.update({
    where: { id: commentId },
    data: { status: user.role === "admin" ? "moderated" : "deleted", moderatedById: user.role === "admin" ? user.userId : null, moderatedAt: new Date() },
  });
  return { ok: true };
}

export async function moderateCombatPost(postId: number, action: unknown) {
  const user = await requireAuth();
  if (user.role !== "admin") throw new PermissionError();
  if (!["HIDE", "RESTORE", "DELETE"].includes(String(action))) throw new ServiceError("VALIDATION_ERROR", "管理操作无效");
  const post = await prisma.combatPost.findUnique({ where: { id: postId }, select: { status: true, videoStorageKey: true } });
  if (!post) throw new ServiceError("NOT_FOUND", "动态不存在");
  if (action === "HIDE") {
    await prisma.combatPost.update({ where: { id: postId }, data: { status: "hidden", moderatedById: user.userId, moderatedAt: new Date() } });
  } else if (action === "RESTORE") {
    if (post.status === "deleted" || post.status === "deleting") throw new ServiceError("CONFLICT", "已删除动态不能恢复");
    await prisma.combatPost.update({ where: { id: postId }, data: { status: "published", moderatedById: user.userId, moderatedAt: new Date() } });
  } else {
    await prisma.combatPost.update({ where: { id: postId }, data: { status: "deleting", moderatedById: user.userId, moderatedAt: new Date() } });
    await deleteOrQueueMedia(getMediaStorage(), post.videoStorageKey, "combat-post-deleted");
    await prisma.combatPost.update({ where: { id: postId }, data: { status: "deleted" } });
  }
  return { ok: true };
}

export async function openCombatPostVideo(postId: number, rangeHeader: string | null) {
  const user = await requireAuth();
  const post = await prisma.combatPost.findUnique({
    where: { id: postId },
    select: { authorId: true, status: true, mimeType: true, size: true, videoStorageKey: true },
  });
  if (!post) throw new ServiceError("NOT_FOUND", "视频不存在");
  if (post.status !== "published" && user.role !== "admin" && post.authorId !== user.userId) throw new ServiceError("NOT_FOUND", "视频不存在");
  const storage = getMediaStorage();
  const info = await storage.stat(post.videoStorageKey);
  if (!info || info.size !== post.size) throw new ServiceError("NOT_FOUND", "视频文件不存在");
  const range = parseByteRange(rangeHeader, post.size);
  if (range.kind === "invalid") return { kind: "invalid" as const, size: post.size };
  if (range.kind === "full") {
    return { kind: "full" as const, size: post.size, mimeType: post.mimeType, stream: await storage.open(post.videoStorageKey) };
  }
  return {
    kind: "partial" as const,
    size: post.size,
    mimeType: post.mimeType,
    range: range.range,
    stream: await storage.open(post.videoStorageKey, range.range),
  };
}
