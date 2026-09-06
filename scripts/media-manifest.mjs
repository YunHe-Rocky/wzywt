import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, parse, relative, resolve, sep } from "node:path";
import { PrismaClient } from "@prisma/client";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd());

const outputArgument = process.argv[2];
if (!outputArgument) throw new Error("usage: node scripts/media-manifest.mjs OUTPUT.json");
const outputPath = resolve(outputArgument);
const mediaRoot = resolve(process.env.MEDIA_STORAGE_DIR || join(process.cwd(), ".cache", "media"));
const avatarRoot = resolve(process.env.AVATAR_DIR || join(process.cwd(), ".cache", "avatars"));
for (const [label, path] of [["media", mediaRoot], ["avatar", avatarRoot]]) {
  if (path === parse(path).root) throw new Error(label + " storage cannot be a filesystem root");
}
const storageKeyPattern = /^(match-screenshots|post-videos)\/\d{4}\/\d{2}\/[a-f0-9-]+\.[a-z0-9]+$/;
const avatarPattern = /^\d+_\d+\.(jpg|png|webp)$/;

function safeChild(root, value, pattern) {
  if (!pattern.test(value)) throw new Error("unsafe media path in database: " + value);
  const absolute = resolve(root, ...value.split("/"));
  const relation = relative(root, absolute);
  if (!relation || relation.startsWith("..") || relation.includes(".." + sep)) {
    throw new Error("media path escapes configured root: " + value);
  }
  return absolute;
}

async function sha256(path) {
  const hash = createHash("sha256");
  await new Promise((resolveHash, rejectHash) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("end", resolveHash);
    stream.once("error", rejectHash);
  });
  return hash.digest("hex");
}

async function inspect(path, expectedSize, expectedSha256) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return { ok: false, problem: "NOT_A_FILE" };
    const actualSha256 = await sha256(path);
    if (expectedSize !== null && info.size !== expectedSize) return { ok: false, problem: "SIZE_MISMATCH", actualSize: info.size, actualSha256 };
    if (expectedSha256 !== null && actualSha256 !== expectedSha256) return { ok: false, problem: "SHA256_MISMATCH", actualSize: info.size, actualSha256 };
    return { ok: true, size: info.size, sha256: actualSha256 };
  } catch (error) {
    if (error && error.code === "ENOENT") return { ok: false, problem: "MISSING" };
    throw error;
  }
}

const prisma = new PrismaClient();
try {
  const [screenshots, videos, avatars] = await Promise.all([
    prisma.matchScreenshot.findMany({
      orderBy: { id: "asc" },
      select: { id: true, uploadedById: true, storageKey: true, size: true, sha256: true, createdAt: true },
    }),
    prisma.combatPost.findMany({
      where: { status: { not: "deleted" } },
      orderBy: { id: "asc" },
      select: { id: true, authorId: true, videoStorageKey: true, size: true, sha256: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { avatar: { not: null } },
      orderBy: { id: "asc" },
      select: { id: true, avatar: true },
    }),
  ]);
  const objects = [];
  const problems = [];
  for (const item of screenshots) {
    const path = safeChild(mediaRoot, item.storageKey, storageKeyPattern);
    const checked = await inspect(path, item.size, item.sha256);
    const entry = { kind: "match-screenshot", recordId: item.id, ownerId: item.uploadedById, storageKey: item.storageKey, expectedSize: item.size, expectedSha256: item.sha256, createdAt: item.createdAt.toISOString(), ...checked };
    objects.push(entry);
    if (!checked.ok) problems.push({ kind: entry.kind, recordId: item.id, storageKey: item.storageKey, problem: checked.problem });
  }
  for (const item of videos) {
    const path = safeChild(mediaRoot, item.videoStorageKey, storageKeyPattern);
    const checked = await inspect(path, item.size, item.sha256);
    const entry = { kind: "combat-video", recordId: item.id, ownerId: item.authorId, storageKey: item.videoStorageKey, expectedSize: item.size, expectedSha256: item.sha256, createdAt: item.createdAt.toISOString(), ...checked };
    objects.push(entry);
    if (!checked.ok) problems.push({ kind: entry.kind, recordId: item.id, storageKey: item.videoStorageKey, problem: checked.problem });
  }
  for (const item of avatars) {
    const filename = basename(item.avatar || "");
    const path = safeChild(avatarRoot, filename, avatarPattern);
    const checked = await inspect(path, null, null);
    const entry = { kind: "avatar", recordId: item.id, ownerId: item.id, storageKey: filename, expectedSize: null, expectedSha256: null, ...checked };
    objects.push(entry);
    if (!checked.ok) problems.push({ kind: entry.kind, recordId: item.id, storageKey: filename, problem: checked.problem });
  }
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    complete: problems.length === 0,
    counts: { screenshots: screenshots.length, videos: videos.length, avatars: avatars.length },
    objects,
    problems,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  const handle = await open(outputPath, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(manifest, null, 2) + "\n", "utf8");
  } finally {
    await handle.close();
  }
  if (problems.length > 0) throw new Error("media manifest found " + problems.length + " missing or inconsistent object(s)");
  console.log("[media-manifest] verified " + objects.length + " objects -> " + outputPath);
} finally {
  await prisma.$disconnect();
}

