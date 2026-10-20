import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, truncate } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const repo = resolve(import.meta.dirname, "..");
function load(relative, stubs = {}, globals = {}) {
  stubs = { "@/lib/request-capacity": { withRequestCapacity: handler => handler },
    "@/lib/resource-governor": { resourceCheckpoint: async () => {} }, ...stubs };
  const instance = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(resolve(repo, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", ...Object.keys(globals), compiled)(
    name => Object.hasOwn(stubs, name) ? stubs[name] : nativeRequire(name),
    instance, instance.exports, ...Object.values(globals),
  );
  return instance.exports;
}

test("a running asset reader sees images added by cron and rejects paths outside the JPEG cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wzywt-hero-assets-"));
  try {
    const { readHeroAsset } = load("src/features/heroes/server/assets.ts");
    assert.equal(await readHeroAsset(["images", "167.jpg"], directory), null);
    const imageDirectory = join(directory, "public/heroes/images");
    await mkdir(imageDirectory, { recursive: true });
    const bytes = Uint8Array.from([255, 216, 255, 217]);
    await writeFile(join(imageDirectory, "167.jpg"), bytes);
    assert.deepEqual(await readHeroAsset(["images", "167.jpg"], directory), bytes);
    await mkdir(join(directory, "public/heroes/skins/167"), { recursive: true });
    await writeFile(join(directory, "public/heroes/skins/167/2.jpg"), bytes);
    assert.deepEqual(await readHeroAsset(["skins", "167", "2.jpg"], directory), bytes);
    for (const segments of [[], ["images", "../167.jpg"], ["images", "167.jpg.source"], ["skins", "..", "1.jpg"], ["images", "0.jpg"], ["images", "167.jpg", "extra"]]) {
      assert.equal(await readHeroAsset(segments, directory), null, JSON.stringify(segments));
    }
    await truncate(join(imageDirectory, "167.jpg"), 12 * 1024 * 1024 + 1);
    assert.equal(await readHeroAsset(["images", "167.jpg"], directory), null, "oversized files must not be loaded");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("asset HTTP responses never cache missing files and return image bytes when present", async () => {
  let value = null;
  const { GET } = load("src/app/api/heroes/assets/[...segments]/route.ts", {
    "@/features/heroes/server/assets": { readHeroAsset: async () => value },
  });
  const context = { params: Promise.resolve({ segments: ["images", "167.jpg"] }) };
  const missing = await GET(new Request("http://localhost"), context);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store");
  value = Uint8Array.from([255, 216, 255, 217]);
  const found = await GET(new Request("http://localhost"), context);
  assert.equal(found.status, 200);
  assert.equal(found.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(new Uint8Array(await found.arrayBuffer()), value);
});

test("image sync uses configured sources, preserves remote URLs on failure and tolerates malformed skin metadata", async () => {
  const rows = [
    { heroId: 1, imageUrl: "https://cdn.example/1.jpg", skinsJson: "null" },
    { heroId: 2, imageUrl: "https://cdn.example/2.jpg", skinsJson: '{}' },
    { heroId: 3, imageUrl: "https://cdn.example/3.jpg", skinsJson: JSON.stringify([null, { index: "../escape" }, { index: 1, imageUrls: [null, 42] }]) },
  ];
  const updates = [];
  const requests = [];
  const files = new Map([[join(process.cwd(), "public/heroes/images/2.jpg"), Buffer.alloc(1024)]]);
  const filesystem = {
    async access(path) { if (!files.has(path)) throw new Error("missing"); },
    async readFile(path) { if (!files.has(path)) throw new Error("missing"); return files.get(path); },
    async mkdir() {},
    async writeFile(path, bytes) { files.set(path, bytes); },
    async rename(from, to) { files.set(to, files.get(from)); files.delete(from); },
    async unlink(path) { files.delete(path); },
  };
  const { downloadAllImages } = load("src/features/heroes/server/download-images.ts", {
    "@/features/heroes/server/crawl-config": { getCrawlConfig: async () => ({ hero_img_base: "https://game.gtimg.cn/configured-avatar/{id}/{id}.jpg", skin_img_base: "https://game.gtimg.cn/configured-skin/{id}/{idx}.jpg" }) },
    "@/lib/db": { prisma: { hero: { findMany: async () => rows, update: async args => updates.push(args) } } },
    "fs/promises": filesystem,
    "@/lib/anti-bot": { validateCrawlUrl: value => value },
    "@/lib/http-response": { readResponseBytes: async response => new Uint8Array(await response.arrayBuffer()) },
    "@/lib/stream-download": { streamResponseToFile: async (response, path) => filesystem.writeFile(path, new Uint8Array(await response.arrayBuffer())) },
    "@/lib/task-write-fence": { assertTaskWriteAllowed() {} },
  }, {
    fetch: async url => {
      requests.push(url);
      return url.includes("/3/")
        ? new Response(Buffer.alloc(1024), { headers: { "Content-Type": "image/jpeg" } })
        : new Response(null, { status: 503 });
    },
  });
  assert.deepEqual(await downloadAllImages(), { heroes: 1, skins: 1 });
  assert.deepEqual(updates.map(value => value.where.heroId), [2, 3], "failed avatar must keep its remote URL");
  assert.ok(requests.some(value => value.includes("/configured-avatar/3/3.jpg")), "avatar download must use saved configuration");
  assert.ok(requests.some(value => value.includes("/configured-skin/3/1.jpg")), "skin download must use saved configuration");
  assert.ok(requests.every(value => !value.includes("escape")), "invalid skin indices must not reach paths/requests");
});
