import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd());
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const url = new URL(databaseUrl);
if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must use the mysql protocol");

const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
if (!database) throw new Error("DATABASE_URL must include a database name");

const mysqldumpBin = process.env.MYSQLDUMP_BIN || "mysqldump";
const helpResult = spawnSync(mysqldumpBin, ["--help"], {
  encoding: "utf8",
  shell: false,
  windowsHide: true,
});
const helpOutput = `${helpResult.stdout || ""}\n${helpResult.stderr || ""}`;
const supportsSkipMaskingPolicies =
  helpResult.status === 0 && /--skip-masking-policies\b/.test(helpOutput);

function projectSlug() {
  let value = process.env.DEPLOY_PROJECT_NAME;
  if (!value) {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    value = packageJson.name;
  }
  if (typeof value !== "string" || !value) throw new Error("DEPLOY_PROJECT_NAME or package.json name is required");
  const slug = value.replace(/^@/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("project name cannot form a safe backup prefix");
  return slug;
}

const outputDir = resolve(process.argv[2] || "data/mysql-bak");
mkdirSync(outputDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const outputFile = resolve(outputDir, `${projectSlug()}-${timestamp}.sql`);
closeSync(openSync(outputFile, "wx", 0o600));

const args = [
  `--host=${url.hostname}`,
  `--port=${url.port || "3306"}`,
  `--user=${decodeURIComponent(url.username)}`,
  "--single-transaction",
  "--quick",
  "--skip-lock-tables",
  "--set-gtid-purged=OFF",
  "--no-tablespaces",
  ...(supportsSkipMaskingPolicies ? ["--skip-masking-policies"] : []),
  "--routines",
  "--triggers",
  "--events",
  `--result-file=${outputFile}`,
  database,
];

const child = spawn(mysqldumpBin, args, {
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
