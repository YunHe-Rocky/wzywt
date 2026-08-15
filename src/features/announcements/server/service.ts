import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  AnnouncementValidationError,
  createAnnouncementBrief,
  createAnnouncementSlug,
  normalizeAnnouncementDraft,
} from "@/features/announcements/model";

async function getUniqueSlug(base: string, excludeId?: number): Promise<string> {
  for (let suffix = 1; suffix <= 100; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const existing = await prisma.announcement.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${base.slice(0, 48)}-${Date.now().toString(36)}`;
}

export async function listAdminAnnouncements() {
  return prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function listPublishedAnnouncements(full = false) {
  const announcements = await prisma.announcement.findMany({
    where: { published: true },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    select: full
      ? { title: true, version: true, brief: true, content: true, slug: true, createdAt: true }
      : { title: true, version: true, brief: true, slug: true, createdAt: true },
  });
  return announcements.map((announcement) => ({
    ...announcement,
    date: announcement.createdAt.toISOString().split("T")[0],
  }));
}

export async function createAnnouncement(input: unknown) {
  const draft = normalizeAnnouncementDraft(input);
  const baseSlug = createAnnouncementSlug(draft.version, draft.title);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const slug = await getUniqueSlug(baseSlug);
    try {
      return await prisma.announcement.create({
        data: {
          ...draft,
          brief: createAnnouncementBrief(draft.content, draft.title),
          slug,
          published: true,
        },
      });
    } catch (error) {
      const slugConflict = error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002";
      if (!slugConflict || attempt === 3) throw error;
    }
  }
  throw new Error("unreachable");
}

export async function updateAnnouncement(id: number, input: unknown) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new AnnouncementValidationError("公告 ID 无效");
  }
  if (!input || typeof input !== "object") {
    throw new AnnouncementValidationError("公告数据格式错误");
  }

  const patch = input as Record<string, unknown>;
  if (Object.keys(patch).length === 1 && typeof patch.published === "boolean") {
    return prisma.announcement.update({
      where: { id },
      data: { published: patch.published },
    });
  }

  const draft = normalizeAnnouncementDraft(patch);
  const current = await prisma.announcement.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!current) throw new AnnouncementValidationError("公告不存在");

  const requestedSlug = typeof patch.slug === "string" && patch.slug.trim()
    ? patch.slug.trim().slice(0, 64)
    : current.slug;
  const slug = await getUniqueSlug(requestedSlug, id);

  return prisma.announcement.update({
    where: { id },
    data: {
      ...draft,
      brief: createAnnouncementBrief(draft.content, draft.title),
      slug,
      ...(typeof patch.published === "boolean"
        ? { published: patch.published }
        : {}),
    },
  });
}

export async function deleteAnnouncement(id: number): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new AnnouncementValidationError("公告 ID 无效");
  }
  await prisma.announcement.delete({ where: { id } });
}

export function isAnnouncementNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2025";
}
