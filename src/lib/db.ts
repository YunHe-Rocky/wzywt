import { PrismaClient } from "@prisma/client";
import { assertTaskWriteAllowed } from "@/lib/task-write-fence";
import { queryCacheMiddleware, invalidateQueryCache } from "./redis-query-cache";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  taskWriteFenceInstalled?: boolean;
};

const client = globalForPrisma.prisma || new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  // connection_limit 通过 DATABASE_URL query string 控制
});

if (!globalForPrisma.taskWriteFenceInstalled) {
  const writeActions = new Set([
    "create", "createMany", "createManyAndReturn", "delete", "deleteMany",
    "executeRaw", "runCommandRaw", "update", "updateMany", "updateManyAndReturn", "upsert",
  ]);
  client.$use(async (params, next) => {
    if (writeActions.has(params.action)) assertTaskWriteAllowed();
    const result = await next(params);
    if (writeActions.has(params.action) && !params.runInTransaction) await invalidateQueryCache();
    return result;
  });
  client.$use(queryCacheMiddleware);
  globalForPrisma.taskWriteFenceInstalled = true;
}

// Node middleware and route bundles share one process. Keep the fenced client
// singleton in production too, rather than sharing only its installation flag.
globalForPrisma.prisma = client;

// Invalidate only after an interactive or batch transaction actually commits.
// Middleware alone executes before commit and would leave a stale-fill window.
export const prisma: PrismaClient = new Proxy(client, {
  get(target, property, receiver) {
    if (property === "$transaction") return async (...args: unknown[]) => {
      const result = await Reflect.apply(target.$transaction, target, args);
      await invalidateQueryCache();
      return result;
    };
    return Reflect.get(target, property, receiver);
  },
});
