import bcrypt from "bcryptjs";
import { getSession } from "./session";
import { prisma } from "./db";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session.userId) {
    throw new Error("UNAUTHORIZED");
  }
  if (!session.role) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, banned: true },
    });
    if (!user) throw new Error("UNAUTHORIZED");
    if (user.banned) throw new Error("BANNED");
    session.role = user.role;
    await session.save();
  }
  return { userId: session.userId, username: session.username!, role: session.role };
}
