import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const output = process.argv[2];
if (!output || !process.env.DATABASE_URL) throw new Error("Usage: native-db-identity.mjs OUTPUT.json with a selected DATABASE_URL");
const prisma = new PrismaClient();
try {
  const rows = await prisma.$queryRawUnsafe("SELECT @@server_uuid AS serverUuid, DATABASE() AS databaseName");
  const row = rows[0];
  if (!row || typeof row.serverUuid !== "string" || typeof row.databaseName !== "string") throw new Error("MySQL database identity is unavailable");
  writeFileSync(resolve(output), JSON.stringify({ version: 1, serverUuid: row.serverUuid, database: row.databaseName }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
} catch {
  console.error("[native-db-identity] Could not read the selected MySQL database identity");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
