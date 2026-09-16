import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/permissions";

export async function listAdminCombatPosts(params: URLSearchParams) {
  await requireSuperAdmin();
  const query = (params.get("q") || "").trim().slice(0, 128);
  const status = params.get("status");
  const requested = Number(params.get("page") || 1);
  const where = {
    status: status === "published" || status === "hidden" ? status : { in: ["published", "hidden"] },
    ...(query ? { OR: [{ title: { contains: query } }, { author: { username: { contains: query } } }] } : {}),
  };
  const total = await prisma.combatPost.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / 12));
  const page = Math.min(totalPages, Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const posts = await prisma.combatPost.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 12, take: 12,
    select: { id: true, title: true, status: true, size: true, createdAt: true, author: { select: { username: true } }, _count: { select: { likes: true, comments: { where: { status: "active" } } } } },
  });
  return { posts, page, total, totalPages };
}
