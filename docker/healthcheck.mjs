import { readFileSync } from "node:fs";
import { runtimeEnvironment, healthyHeartbeat } from "./runtime-env.mjs";

// Keep diagnostics free of connection strings, secrets and Prisma error bodies.
const timeout = setTimeout(() => process.exit(1), 7_000);
try {
  if (process.argv[2] === "web") {
    const response = await fetch("http://127.0.0.1:8001/api/health", { signal: AbortSignal.timeout(6_000) });
    const body = await response.json();
    if (!response.ok || body.ok !== true || body.releaseId !== process.env.APP_RELEASE_ID) throw new Error("not ready");
  } else if (process.argv[2] === "cron") {
    const { PrismaClient } = await import("@prisma/client");
    const environment = runtimeEnvironment(process.env);
    const prisma = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } }, log: [] });
    try {
      const row = await prisma.kvCache.findUnique({ where: { key: "cron:worker:heartbeat" } });
      const startedAt = Number(readFileSync("/tmp/wzywt-cron-started", "utf8"));
      if (!row || !healthyHeartbeat(row.value, environment.APP_RELEASE_ID, startedAt)) throw new Error("stale heartbeat");
    } finally {
      await prisma.$disconnect();
    }
  } else throw new Error("unknown healthcheck");
} catch {
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
