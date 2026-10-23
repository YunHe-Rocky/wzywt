import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileSha256 } from "./backup-integrity.mjs";

// Deliberately separate from unit/model checks: this starts an isolated real
// MySQL server, exports actual mysqldump SQL, and imports through the public CLI.
const root = resolve(import.meta.dirname, "..");
const imageIndex = process.argv.indexOf("--image");
const image = imageIndex < 0 ? undefined : process.argv[imageIndex + 1];
if (process.argv.includes("--help")) {
  console.log("ALLOW_NATIVE_MIGRATION_INTEGRATION=1 node scripts/test-native-migration-docker.mjs --image EXISTING_RUNTIME_IMAGE\nRequires Linux, local Docker Engine, npm ci and prisma generate. Creates and removes only a uniquely named test stack.");
  process.exit(0);
}
if (process.platform !== "linux" || process.env.ALLOW_NATIVE_MIGRATION_INTEGRATION !== "1" || !image) {
  throw new Error("Native migration integration requires Linux, ALLOW_NATIVE_MIGRATION_INTEGRATION=1 and --image EXISTING_RUNTIME_IMAGE");
}

const id = randomUUID().replaceAll("-", "").slice(0, 12);
const project = `wzywt-migration-${id}`;
const sourceContainer = `${project}-native-mysql`;
const sourceLabel = `wzywt.native-migration-test=${id}`;
const fixturesBase = join(root, ".cache/native-migration-docker");
mkdirSync(fixturesBase, { recursive: true, mode: 0o700 });
const fixture = mkdtempSync(join(fixturesBase, `${id}-`));
const source = join(fixture, "native");
const media = join(source, ".cache/media");
const avatars = join(source, ".cache/avatars");
const heroes = join(source, "public/heroes/images");
const backups = join(fixture, "backups");
const diagnosticDirectory = join(root, ".cache/ci-diagnostics/native-migration");
const passwords = [randomBytes(24).toString("hex"), randomBytes(24).toString("hex")];
const sessionSecret = randomBytes(32).toString("hex");
const redact = value => [...passwords, sessionSecret].reduce((text, secret) => text.replaceAll(secret, "[REDACTED]"), String(value));
const report = { version: 1, project, startedAt: new Date().toISOString(), status: "running", checks: [] };
let phase = "initialize";

function command(bin, args, { failure = false, env, input, timeout = 600_000 } = {}) {
  const result = spawnSync(bin, args, { cwd: root, encoding: "utf8", input, env: { ...process.env, ...env }, timeout, maxBuffer: 32 * 1024 * 1024 });
  const output = redact((result.stdout || "") + (result.stderr || ""));
  if (!failure && (result.error || result.status !== 0)) throw new Error(`${phase}: ${result.error?.message || `exit ${result.status}`}\n${output}`);
  return { ...result, output };
}
const docker = (args, options) => command("docker", args, options);
function cli(args, options) { return command(process.execPath, ["scripts/compose.mjs", ...args], options); }
function passed(name) { report.checks.push(name); console.log(`[native-migration-integration] PASS ${name}`); }
function privateFile(path, text, mode = 0o600) { writeFileSync(path, text, { flag: "wx", mode }); }
function identifiers(args) { return docker(args).stdout.trim().split(/\s+/).filter(Boolean); }
function projectContainers() { return identifiers(["ps", "--all", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]); }
function writerContainers() {
  return ["web", "cron"].flatMap(service => identifiers(["ps", "--quiet", "--filter", `label=com.docker.compose.project=${project}`, "--filter", `label=com.docker.compose.service=${service}`]));
}
function captureDiagnostics() {
  mkdirSync(diagnosticDirectory, { recursive: true });
  const own = [...projectContainers(), ...identifiers(["ps", "--all", "--quiet", "--filter", `label=${sourceLabel}`])];
  for (const container of own) {
    if (!/^[a-f0-9]+$/.test(container)) throw new Error("Unexpected Docker container identifier");
    const state = docker(["inspect", "--format", "{{json .State}}", container], { failure: true });
    const logs = docker(["logs", "--tail", "80", container], { failure: true });
    writeFileSync(join(diagnosticDirectory, `${container}.log`), redact(state.output + "\n" + logs.output));
  }
}
function cleanup() {
  const own = [...projectContainers(), ...identifiers(["ps", "--all", "--quiet", "--filter", `label=${sourceLabel}`])];
  if (own.length) docker(["rm", "--force", "--volumes", ...own]);
  for (const kind of ["network", "volume"]) {
    const resources = identifiers([kind, "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]);
    if (resources.length) docker([kind, "rm", ...resources]);
  }
  assert.equal(dirname(fixture), fixturesBase, "cleanup must stay in the test fixture directory");
  rmSync(fixture, { recursive: true, force: true });
}

try {
  for (const path of [media, avatars, heroes, backups]) mkdirSync(path, { recursive: true, mode: 0o700 });
  docker(["info", "--format", "{{.ServerVersion}}"]);
  docker(["image", "inspect", image, "--format", "{{.Id}}"]);
  const serverEnv = join(fixture, "source-server.env");
  privateFile(serverEnv, `MYSQL_ROOT_PASSWORD=${passwords[0]}\nMYSQL_DATABASE=native_migration_ci\nMYSQL_USER=migration_ci\nMYSQL_PASSWORD=${passwords[1]}\n`);
  phase = "start isolated source MySQL";
  docker(["run", "--detach", "--name", sourceContainer, "--label", sourceLabel,
    "--publish", "127.0.0.1::3306", "--env-file", serverEnv, "--volume", `${fixture}:${fixture}`, "mysql:8.4",
    "--innodb-buffer-pool-size=128M", "--max-connections=30"]);
  const binding = docker(["port", sourceContainer, "3306/tcp"]).stdout.trim();
  const port = binding.match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  assert.ok(port, "source MySQL must publish only a random loopback port");
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const probe = docker(["exec", "--env", "MYSQL_PWD", sourceContainer, "mysql", "--protocol=TCP", "-h", "127.0.0.1", "-u", "migration_ci", "native_migration_ci", "-Nse", "SELECT 1"], { env: { MYSQL_PWD: passwords[1] }, failure: true, timeout: 10_000 });
    if (probe.status === 0) { ready = true; break; }
    await setTimeout(2000);
  }
  assert.ok(ready, "isolated source MySQL became healthy");
  const databaseUrl = `mysql://migration_ci:${passwords[1]}@127.0.0.1:${port}/native_migration_ci`;
  // Use the source image's real MySQL 8.4 client. The only translated argument
  // is its published host port; the same private backup path is bind mounted.
  const dumpProxy = join(fixture, "mysqldump-proxy.mjs");
  privateFile(dumpProxy, `#!/usr/bin/env node\nimport {spawnSync} from "node:child_process";\nconst args=process.argv.slice(2).map(value=>value.startsWith("--port=")?"--port=3306":value);\nconst result=spawnSync("docker",["exec","--user",${JSON.stringify(`${process.getuid()}:${process.getgid()}`)},"--env","MYSQL_PWD",${JSON.stringify(sourceContainer)},"mysqldump",...args],{stdio:"inherit",env:process.env});\nprocess.exit(result.status ?? 1);\n`, 0o700);
  privateFile(join(source, "package.json"), JSON.stringify({ name: "native-migration-ci-fixture" }));
  privateFile(join(source, ".env"), `DATABASE_URL=${databaseUrl}\nMEDIA_STORAGE_DIR=${media}\nAVATAR_DIR=${avatars}\nMYSQLDUMP_BIN=${dumpProxy}\n`);
  phase = "prepare real source schema and files";
  command(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { DATABASE_URL: databaseUrl } });
  const videoKey = "post-videos/2026/10/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4";
  const video = join(media, videoKey);
  mkdirSync(dirname(video), { recursive: true, mode: 0o700 });
  docker(["run", "--rm", "--user", `${process.getuid()}:${process.getgid()}`, "--volume", `${fixture}:${fixture}`, "--entrypoint", "ffmpeg", image,
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=320x240:r=10", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video]);
  chmodSync(video, 0o600);
  const avatarName = "701_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png";
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=", "base64");
  privateFile(join(avatars, avatarName), png);
  privateFile(join(heroes, "701.png"), png);
  const title = `中文迁移 "双引号" 与 '单引号'`;
  const content = "第一行\n第二行 \\ 路径; /*!50000 SELECT '仅文本' */";
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let sourceIdentity;
  try {
    await prisma.user.create({ data: { id: 701, username: "迁移验证用户", passwordHash: "not-a-login-hash-integration-fixture", avatar: avatarName } });
    await prisma.combatPost.create({ data: { id: 1701, authorId: 701, title, content, videoStorageKey: videoKey, originalFilename: "旧视频.mp4", mimeType: "video/mp4", size: statSync(video).size, sha256: fileSha256(video) } });
    [sourceIdentity] = await prisma.$queryRawUnsafe("SELECT @@server_uuid AS serverUuid, DATABASE() AS databaseName");
  } finally { await prisma.$disconnect(); }
  passed("native fixture uses actual migrated MySQL tables, Chinese/quoted text, private video and avatar files");

  phase = "export stopped native source through Compose CLI";
  cli(["export-native", "--source-root", source, "--backup-dir", backups, "--writers-stopped"]);
  const exports = readdirSync(backups).filter(name => name.startsWith("native-"));
  assert.equal(exports.length, 1);
  const bundle = join(backups, exports[0]);
  const manifest = JSON.parse(readFileSync(join(bundle, "manifest.json"), "utf8"));
  assert.equal(manifest.complete, true);
  assert.equal(manifest.migrationSource.databaseIdentity.serverUuid, sourceIdentity.serverUuid);
  assert.equal(manifest.migrationSource.databaseIdentity.database, sourceIdentity.databaseName);
  assert.match(readFileSync(join(bundle, "database.sql"), "utf8"), /INSERT INTO `combat_posts`/);
  passed("export contains real MySQL 8.4 dump and the original source database identity");

  const targetEnv = join(fixture, "target.env");
  privateFile(targetEnv, `COMPOSE_PROJECT_NAME=${project}\nMYSQL_MODE=container\nMYSQL_DATABASE=native_migration_ci\nMYSQL_USER=migration_ci\nMYSQL_PASSWORD=${passwords[1]}\nMYSQL_ROOT_PASSWORD=${passwords[0]}\nSESSION_SECRET=${sessionSecret}\nPUBLIC_ORIGIN=http://localhost:18091\nDEPLOY_ENVIRONMENT=local\nSESSION_COOKIE_SECURE=0\nPORT=18091\nBIND_ADDRESS=127.0.0.1\nOCR_MODE=off\nMATCH_OCR_ENDPOINT=\nSTORAGE_MODE=volume\n`);
  phase = "import real native snapshot into empty Docker target";
  cli(["import-native", "--env-file", targetEnv, "--from-backup", bundle]);
  assert.deepEqual(writerContainers(), [], "import must keep target Web/Cron stopped");
  const clientEnv = join(fixture, "target-client.env");
  privateFile(clientEnv, `DATABASE_URL=mysql://migration_ci:${passwords[1]}@mysql:3306/native_migration_ci\nMYSQL_HOST=mysql\nMYSQL_PORT=3306\nMYSQL_DATABASE=native_migration_ci\nMYSQL_USER=migration_ci\nMYSQL_PASSWORD=${passwords[1]}\nSESSION_SECRET=${sessionSecret}\nPUBLIC_ORIGIN=http://localhost:18091\nDEPLOY_ENVIRONMENT=local\nSTORAGE_MODE=volume\n`);
  const consumerArgs = ["run", "--rm", "--network", `${project}_default`, "--env-file", clientEnv,
    "--volume", `${project}_media:/app/data/media`, "--volume", `${project}_hero-images:/app/public/heroes/images`, "--volume", `${project}_hero-skins:/app/public/heroes/skins`];
  const expected = { title, content, videoKey, avatarName, videoSha256: fileSha256(video), avatarSha256: fileSha256(join(avatars, avatarName)), heroSha256: fileSha256(join(heroes, "701.png")) };
  const verificationProgram = `
import assert from "node:assert/strict";
import {readFileSync,statSync} from "node:fs";
import {createHash} from "node:crypto";
import {PrismaClient} from "@prisma/client";
const expected=${JSON.stringify(expected)};
assert.equal(process.getuid(),1000);
const prisma=new PrismaClient();
try {
 const user=await prisma.user.findUniqueOrThrow({where:{id:701}});
 const video=await prisma.combatPost.findUniqueOrThrow({where:{id:1701}});
 assert.equal(user.avatar,expected.avatarName); assert.equal(video.authorId,user.id);
 assert.equal(video.title,expected.title); assert.equal(video.content,expected.content);
 assert.equal(video.videoStorageKey,expected.videoKey); assert.equal(video.sha256,expected.videoSha256);
 for(const [path,hash] of [["/app/data/media/"+expected.videoKey,expected.videoSha256],["/app/data/media/avatars/"+expected.avatarName,expected.avatarSha256],["/app/public/heroes/images/701.png",expected.heroSha256]]) {
   assert.equal(statSync(path).uid,1000); assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"),hash);
 }
 assert.equal(JSON.parse(readFileSync("/app/data/media/.native-import.json","utf8")).state,"completed");
 const [identity]=await prisma.$queryRawUnsafe("SELECT @@server_uuid AS serverUuid, DATABASE() AS databaseName");
 console.log(JSON.stringify({recordIds:[user.id,video.id],fileHashesVerified:3,readerUid:process.getuid(),databaseIdentity:identity}));
} finally {await prisma.$disconnect();}
`;
  const verifyRestored = () => docker([...consumerArgs, "--user", "1000:1000", "--interactive", "--entrypoint", "node", image, "--input-type=module"], { input: verificationProgram });
  const verification = verifyRestored();
  report.restored = JSON.parse(verification.stdout.trim());
  assert.notEqual(report.restored.databaseIdentity.serverUuid, sourceIdentity.serverUuid, "container import must use a distinct MySQL server");
  assert.equal(report.restored.databaseIdentity.databaseName, sourceIdentity.databaseName);
  passed("entity IDs, Unicode/quoted SQL values and video/avatar/hero SHA-256 survive import; uid 1000 reads restored private files");

  phase = "reject non-empty target without modifying restored files";
  const repeat = cli(["import-native", "--env-file", targetEnv, "--from-backup", bundle], { failure: true });
  assert.notEqual(repeat.status, 0);
  assert.match(repeat.output, /already contains files|not empty/);
  // Empty scratch media isolates the database check from the storage check.
  const nonemptyDatabase = docker(["run", "--rm", "--network", `${project}_default`, "--env-file", clientEnv, "--user", "0:0",
    "--mount", "type=tmpfs,destination=/app/data/media", "--mount", "type=tmpfs,destination=/app/public/heroes/images", "--mount", "type=tmpfs,destination=/app/public/heroes/skins",
    "--volume", `${bundle}:/wzywt-import:ro`, "--entrypoint", "node", image, "docker/native-migration.mjs", "preflight", "/wzywt-import", "container"], { failure: true });
  assert.notEqual(nonemptyDatabase.status, 0);
  assert.match(nonemptyDatabase.output, /database is not empty/);
  assert.deepEqual(JSON.parse(verifyRestored().stdout.trim()), report.restored);
  passed("existing target media and existing database tables both reject a second import");

  phase = "verify pending migration prevents activation";
  docker([...consumerArgs, "--user", "1000:1000", "--entrypoint", "node", image, "--input-type=module", "-e",
    'import {readFileSync,writeFileSync} from "node:fs";const path="/app/data/media/.native-import.json";const marker=JSON.parse(readFileSync(path,"utf8"));marker.state="pending";writeFileSync(path,JSON.stringify(marker));']);
  for (const role of ["web", "cron"]) {
    const direct = docker([...consumerArgs, "--user", "1000:1000", image, role], { failure: true, timeout: 20_000 });
    assert.notEqual(direct.status, 0);
    assert.match(direct.output, /native migration is incomplete/);
  }
  const blocked = cli(["up", "--env-file", targetEnv, "--backup-dir", join(fixture, "target-backups")], { failure: true });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.output, /native migration is incomplete/);
  assert.deepEqual(writerContainers(), [], "pending migration must prevent Web/Cron activation");
  passed("a pending marker blocks direct Web/Cron entrypoints and the public up command before writers start");
  assert.equal(fileSha256(video), expected.videoSha256);
  assert.equal(fileSha256(join(avatars, avatarName)), expected.avatarSha256);
  const sourceCheck = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const retained = await sourceCheck.combatPost.findUniqueOrThrow({ where: { id: 1701 } });
    const [identity] = await sourceCheck.$queryRawUnsafe("SELECT @@server_uuid AS serverUuid, DATABASE() AS databaseName");
    assert.deepEqual(identity, sourceIdentity);
    assert.equal(retained.title, title);
    assert.equal(retained.content, content);
    assert.equal(retained.sha256, expected.videoSha256);
  } finally { await sourceCheck.$disconnect(); }
  passed("original source database identity, video record and source files remain intact");
  report.status = "passed";
  report.limitations = ["No browser playback/seek acceptance or OSS mount coverage", "This smoke covers container MySQL import; external database reuse is covered separately by contract tests"];
} catch (error) {
  report.status = "failed";
  report.phase = phase;
  report.error = redact(error.message);
  try { captureDiagnostics(); } catch (diagnosticError) { report.diagnosticError = redact(diagnosticError.message); }
  process.exitCode = 1;
  console.error(`[native-migration-integration] ${report.error}`);
} finally {
  report.finishedAt = new Date().toISOString();
  try { cleanup(); } catch (error) { report.cleanupError = redact(error.message); report.status = "failed"; process.exitCode = 1; }
  mkdirSync(diagnosticDirectory, { recursive: true });
  writeFileSync(join(diagnosticDirectory, "result.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`[native-migration-integration] ${report.status}; sanitized report: ${join(diagnosticDirectory, "result.json")}`);
}
