import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  // connection_limit 通过 DATABASE_URL query string 控制
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
