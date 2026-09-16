import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalMediaStorage } from "@/lib/storage/local";
import { readCombatPostUpload } from "@/features/combat-posts/server/upload";
import { setMediaStorageForTests } from "@/lib/storage";
import { inspectVideoDuration } from "@/lib/video-duration";
import { parseCombatVideoPolicy } from "@/features/combat-posts/video-policy";
import { isCombatModerationAction } from "@/features/combat-posts/model";

function box(type: string, body: Buffer) {
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length + 8); head.write(type, 4); return Buffer.concat([head, body]);
}
function movie(seconds: number) {
  const header = Buffer.alloc(100); header.writeUInt32BE(1000, 12); header.writeUInt32BE(seconds * 1000, 16);
  return Buffer.concat([box("ftyp", Buffer.from("isom0000isom")), box("moov", box("mvhd", header)), box("mdat", Buffer.alloc(20))]);
}
function webm(seconds: number) {
  const ticks = Buffer.alloc(8); ticks.writeDoubleBE(seconds * 1000);
  const info = Buffer.concat([Buffer.from([0x44, 0x89, 0x88]), ticks]);
  return Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80, 0x18, 0x53, 0x80, 0x67, 0xff, 0x15, 0x49, 0xa9, 0x66, 0x80 + info.length]), info]);
}
async function main() {
assert.deepEqual(parseCombatVideoPolicy({}), { maxBytes: 512 * 1024 ** 2, maxDurationSeconds: 300, uploadTimeoutMs: 900000 });
for (const action of ["HIDE", "RESTORE", "DELETE"]) assert.equal(isCombatModerationAction(action), true);
for (const action of [["HIDE"], ["RESTORE"], { toString: () => "HIDE" }, null, 1, "hide"]) assert.equal(isCombatModerationAction(action), false, "non-string moderation actions must never fall through to DELETE");
for (const bad of ["0", "-1", "Infinity", "hello", "300.5"]) assert.throws(() => parseCombatVideoPolicy({ COMBAT_VIDEO_MAX_DURATION_SECONDS: bad }));
const root = await mkdtemp(join(tmpdir(), "combat-duration-"));
const storage = new LocalMediaStorage(root);
setMediaStorageForTests(storage);
try {
  const request = (seconds: number) => {
    const form = new FormData(); form.set("title", "duration test"); form.set("content", "duration test");
    form.set("video", new File([movie(seconds)], "test.mp4", { type: "video/mp4" }));
    return new Request("http://localhost/upload", { method: "POST", body: form });
  };
  // The backend must enforce the limit even when the browser is bypassed.
  await assert.rejects(() => readCombatPostUpload(request(301), "test", 1, async () => undefined), /时长/);
  assert.equal((await readdir(root, { recursive: true, withFileTypes: true })).filter(item => item.isFile()).length, 0, "overlong uploads must be removed");
  const accepted = await readCombatPostUpload(request(300), "test", 1, async () => undefined);
  assert.equal(await storage.exists(accepted.video.key), true);
  await storage.delete(accepted.video.key);
  for (const [mimeType, data, expected] of [["video/mp4", movie(299), 299], ["video/webm", webm(300), 300], ["video/webm", webm(301), 301]] as const) {
    const object = await storage.save({ namespace: "post-videos", extension: mimeType === "video/mp4" ? "mp4" : "webm", data });
    assert.equal(await inspectVideoDuration(storage, object.key, object.size, mimeType), expected);
    await storage.delete(object.key);
  }
  const versionOne = Buffer.alloc(112); versionOne[0] = 1; versionOne.writeUInt32BE(1000, 20); versionOne.writeBigUInt64BE(BigInt(300000), 24);
  const largeHeader = await storage.save({ namespace: "post-videos", extension: "mp4", data: Buffer.concat([box("ftyp", Buffer.from("isom0000")), box("mdat", Buffer.alloc(1024)), box("moov", box("mvhd", versionOne))]) });
  assert.equal(await inspectVideoDuration(storage, largeHeader.key, largeHeader.size, "video/mp4"), 300);
  await storage.delete(largeHeader.key);
  for (const data of [box("ftyp", Buffer.from("isom0000")), Buffer.from("not a movie"), movie(0)]) {
    const object = await storage.save({ namespace: "post-videos", extension: "mp4", data });
    await assert.rejects(() => inspectVideoDuration(storage, object.key, object.size, "video/mp4"), /时长/);
    await storage.delete(object.key);
  }
  process.env.COMBAT_VIDEO_MAX_DURATION_SECONDS = "120";
  await assert.rejects(() => readCombatPostUpload(request(121), "test", 1, async () => undefined), /时长/);
  process.env.COMBAT_VIDEO_MAX_SIZE_MB = "1";
  const oversized = new FormData(); oversized.set("video", new File([movie(60), Buffer.alloc(1024 ** 2)], "large.mp4", { type: "video/mp4" }));
  await assert.rejects(() => readCombatPostUpload(new Request("http://localhost/upload", { method: "POST", body: oversized }), "test", 1, async () => undefined), /大小|超过/);
  assert.equal((await readdir(root, { recursive: true, withFileTypes: true })).filter(item => item.isFile()).length, 0, "rejected uploads must not leave files");
  process.env.COMBAT_VIDEO_UPLOAD_TIMEOUT_SECONDS = "1";
  let cancelled = false;
  const waiting = new Request("http://localhost/upload", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=timeout-test" }, body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: "half" } as RequestInit & { duplex: "half" });
  await assert.rejects(() => readCombatPostUpload(waiting, "test", 1, async () => undefined), /上传超时/);
  assert.equal(cancelled, true, "deadline must close the incoming body stream");
  const controller = new AbortController(); controller.abort();
  const aborted = new Request("http://localhost/upload", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=aborted-test" }, body: "--aborted-test--\r\n", signal: controller.signal });
  await assert.rejects(() => readCombatPostUpload(aborted, "test", 1, async () => undefined), /已中断/);
  console.log("PASS MP4/WebM duration, 300/301 seconds, malformed containers, configured duration/size limits and cleanup");
} finally {
  delete process.env.COMBAT_VIDEO_MAX_DURATION_SECONDS;
  delete process.env.COMBAT_VIDEO_MAX_SIZE_MB;
  delete process.env.COMBAT_VIDEO_UPLOAD_TIMEOUT_SECONDS;
  setMediaStorageForTests(undefined);
  await rm(root, { recursive: true, force: true });
}
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
