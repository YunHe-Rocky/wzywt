import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/permissions";

export async function getAdminOverview() {
  await requireSuperAdmin();
  const [userCount, tournamentCount, activeTournamentCount, heroCount, postCount, hiddenPostCount, videoStorage, recentPosts] = await Promise.all([
    prisma.user.count({ where: { isTemporary: false, deletedAt: null } }),
    prisma.tournament.count(),
    prisma.tournament.count({ where: { status: { not: "finished" } } }),
    prisma.hero.count(),
    prisma.combatPost.count({ where: { status: "published" } }),
    prisma.combatPost.count({ where: { status: "hidden" } }),
    prisma.combatPost.aggregate({ where: { status: { not: "deleted" } }, _sum: { size: true } }),
    prisma.combatPost.findMany({ where: { status: { in: ["published", "hidden"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5, select: { id: true, title: true, status: true, createdAt: true, author: { select: { username: true } } } }),
  ]);
  return { userCount, tournamentCount, activeTournamentCount, heroCount, postCount, hiddenPostCount, videoBytes: videoStorage._sum.size || 0, recentPosts };
}
