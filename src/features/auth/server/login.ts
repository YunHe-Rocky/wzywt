import { prisma } from "@/lib/db";
import { readThroughQuery } from "@/lib/redis-query-cache";

/** Redis stores only the username locator, never a password/hash or session. */
export async function findLoginAccount(username: string) {
  const locator = await readThroughQuery(`login-locator:${username}`, () => prisma.user.findUnique({
    where: { username }, select: { id: true },
  }));
  const select = { id: true, username: true, passwordHash: true, role: true, banned: true,
    isTemporary: true, sessionVersion: true, deletedAt: true } as const;
  if (locator) {
    const user = await prisma.user.findUnique({ where: { id: locator.id }, select });
    if (user?.username === username) return user;
  }
  // MySQL collation may accept a different username case; the cache must never
  // become an authority for account existence or credentials.
  return prisma.user.findUnique({ where: { username }, select });
}
