import { PrismaClient } from "@prisma/client";
import { assertTaskWriteAllowed } from "@/lib/task-write-fence";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  taskWriteFenceInstalled?: boolean;
};

export const prisma = globalForPrisma.prisma || new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  // connection_limit 通过 DATABASE_URL query string 控制
});

if (!globalForPrisma.taskWriteFenceInstalled) {
  const writeActions = new Set([
    "create", "createMany", "createManyAndReturn", "delete", "deleteMany",
    "executeRaw", "runCommandRaw", "update", "updateMany", "updateManyAndReturn", "upsert",
  ]);
  prisma.$use(async (params, next) => {
    if (writeActions.has(params.action)) assertTaskWriteAllowed();
    return next(params);
  });
  globalForPrisma.taskWriteFenceInstalled = true;
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;