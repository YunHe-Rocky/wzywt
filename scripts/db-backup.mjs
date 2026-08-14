import { closeSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const url = new URL(databaseUrl);
if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use the mysql protocol");

const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
if (!database) throw new Error("DATABASE_URL must include a database name");

const outputDir = resolve(process.argv[2] || "data/mysql-bak");
mkdirSync(outputDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const outputFile = resolve(outputDir, `yanwutang-${timestamp}.sql`);
closeSync(openSync(outputFile, "wx", 0o600));

const args = [
  `--host=${url.hostname}`,
  `--port=${url.port || "3306"}`,
  `--user=${decodeURIComponent(url.username)}`,
  "--single-transaction",
  "--routines",
  "--triggers",
  "--events",
  `--result-file=${outputFile}`,
  database,
];

const child = spawn(process.env.MYSQLDUMP_BIN || "mysqldump", args, {
  stdio: ["ignore", "inherit", "inherit"],
  shell: false,
  env: {
    ...process.env,
    MYSQL_PWD: decodeURIComponent(url.password),
  },
});

const exitCode = await new Promise((resolveCode, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`mysqldump terminated by ${signal}`));
    else resolveCode(code ?? 1);
  });
}).catch((error) => {
  try { unlinkSync(outputFile); } catch {}
  throw error;
});

if (exitCode !== 0) {
  try { unlinkSync(outputFile); } catch {}
  throw new Error(`mysqldump failed with exit code ${exitCode}`);
}

console.log(`[db-backup] created ${outputFile}`);
