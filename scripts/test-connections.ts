import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCombatPostUpload } from "@/features/combat-posts/server/upload";
import { ApiConnectionError, apiRequest } from "@/features/shared/client/api";
import { recognizeMatchScreenshots } from "@/features/matches/server/recognition-provider";
import { redisRetryDelay } from "@/lib/redis";
import { resolveSessionCookieSecure } from "@/lib/session-config";
import { shouldBootstrapEquipment } from "@/features/cron/bootstrap-policy";
import { readFormDataRequest, readJsonRequest, tryReadJsonRequest } from "@/lib/request-validation";
import { ServiceError } from "@/lib/service-error";
import { LocalMediaStorage } from "@/lib/storage/local";
import { setMediaStorageForTests } from "@/lib/storage";

function streamingRequest(chunks: Uint8Array[], contentType: string): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

async function testRequestLimits(): Promise<void> {
  const valid = streamingRequest([new TextEncoder().encode('{"ok":true}')], "application/json");
  assert.deepEqual(await readJsonRequest(valid, 32), { ok: true });

  const declaredTooLarge = new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": "100" },
    body: "{}",
  });
  await assert.rejects(
    () => readJsonRequest(declaredTooLarge, 10),
    (error: unknown) => error instanceof ServiceError && error.code === "PAYLOAD_TOO_LARGE",
  );
  const safeResult = await tryReadJsonRequest<Record<string, unknown>>(
    streamingRequest([new Uint8Array(16)], "application/json"),
    10,
  );
  assert.equal(safeResult.ok, false);
  if (!safeResult.ok) assert.equal(safeResult.response.status, 413);

  const chunkedTooLarge = streamingRequest([
    new Uint8Array(8),
    new Uint8Array(8),
  ], "application/json");
  await assert.rejects(
    () => readJsonRequest(chunkedTooLarge, 10),
    (error: unknown) => error instanceof ServiceError && error.code === "PAYLOAD_TOO_LARGE",
  );

  const form = new FormData();
  form.set("name", "value");
  const source = new Request("http://localhost/test", { method: "POST", body: form });
  const headers = new Headers(source.headers);
  headers.delete("content-length");
  const chunkedForm = new Request(source.url, {
    method: "POST",
    headers,
    body: source.body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  assert.equal((await readFormDataRequest(chunkedForm, 1024)).get("name"), "value");
}

async function testStreamingCombatUpload(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "wzywt-stream-upload-"));
  const storage = new LocalMediaStorage(root);
  setMediaStorageForTests(storage);
  try {
    const mp4 = Buffer.alloc(32);
    mp4.write("ftyp", 4, "ascii");
    const form = new FormData();
    form.set("title", "测试视频");
    form.set("content", "流式上传内容");
    form.set("video", new File([mp4], "clip.mp4", { type: "video/mp4" }));
    const upload = await readCombatPostUpload(new Request("http://localhost/upload", { method: "POST", body: form }));
    assert.equal(upload.fields.title, "测试视频");
    assert.equal(upload.video.size, mp4.length);
    assert.equal(await storage.exists(upload.video.key), true);
    await storage.delete(upload.video.key);

    const invalid = new FormData();
    invalid.set("title", "测试视频");
    invalid.set("content", "流式上传内容");
    invalid.set("video", new File([Buffer.from("not-a-video")], "fake.mp4", { type: "video/mp4" }));
    await assert.rejects(
      () => readCombatPostUpload(new Request("http://localhost/upload", { method: "POST", body: invalid })),
      (error: unknown) => error instanceof ServiceError && error.code === "UNSUPPORTED_MEDIA_TYPE",
    );
    const files = await readdir(root, { recursive: true, withFileTypes: true });
    assert.equal(files.filter((entry) => entry.isFile()).length, 0);
  } finally {
    setMediaStorageForTests(undefined);
    await rm(root, { recursive: true, force: true });
  }
}

async function testClientConnectionErrors(): Promise<void> {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ value: 1 });
    assert.deepEqual(await apiRequest<{ value: number }>("/ok"), {
      ok: true,
      status: 200,
      data: { value: 1 },
    });

    globalThis.fetch = async () => new Response("upstream proxy error", { status: 502 });
    await assert.rejects(
      () => apiRequest("/invalid-response"),
      (error: unknown) => error instanceof ApiConnectionError && error.code === "INVALID_RESPONSE",
    );

    globalThis.fetch = async () => { throw new TypeError("offline"); };
    await assert.rejects(
      () => apiRequest("/offline"),
      (error: unknown) => error instanceof ApiConnectionError && error.code === "NETWORK",
    );

    globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
    await assert.rejects(
      () => apiRequest("/slow", { timeoutMs: 5 }),
      (error: unknown) => error instanceof ApiConnectionError && error.code === "TIMEOUT",
    );

    const controller = new AbortController();
    const pending = apiRequest("/cancel", { signal: controller.signal, timeoutMs: 1_000 });
    controller.abort();
    await assert.rejects(
      () => pending,
      (error: unknown) => error instanceof ApiConnectionError && error.code === "ABORTED",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testOcrTransportGuards(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalEndpoint = process.env.MATCH_OCR_ENDPOINT;
  const originalToken = process.env.MATCH_OCR_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;
  const files = [{ type: "DATA", filename: "data.png", mimeType: "image/png", data: Buffer.from("image") }];
  try {
    Reflect.set(process.env, "NODE_ENV", "test");
    process.env.MATCH_OCR_ENDPOINT = "http://ocr.test/recognize";
    process.env.MATCH_OCR_TOKEN = "test-token";
    let observedInit: RequestInit | undefined;
    globalThis.fetch = async (_input, init) => {
      observedInit = init;
      return Response.json({ pages: [] });
    };
    assert.deepEqual(await recognizeMatchScreenshots(files), { pages: [] });
    assert.equal(observedInit?.redirect, "error");
    assert.equal(new Headers(observedInit?.headers).get("authorization"), "Bearer test-token");

    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3 * 1024 * 1024));
        controller.enqueue(new Uint8Array(3 * 1024 * 1024));
        controller.close();
      },
    }), { headers: { "Content-Type": "application/json" } });
    await assert.rejects(
      () => recognizeMatchScreenshots(files),
      (error: unknown) => error instanceof ServiceError && error.code === "SERVICE_UNAVAILABLE",
    );

    globalThis.fetch = async () => new Response("not-json", { headers: { "Content-Type": "application/json" } });
    await assert.rejects(
      () => recognizeMatchScreenshots(files),
      (error: unknown) => error instanceof ServiceError && error.status === 503,
    );

    globalThis.fetch = async () => { throw new TypeError("connection refused"); };
    await assert.rejects(
      () => recognizeMatchScreenshots(files),
      (error: unknown) => error instanceof ServiceError && error.status === 503,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEndpoint === undefined) delete process.env.MATCH_OCR_ENDPOINT;
    else process.env.MATCH_OCR_ENDPOINT = originalEndpoint;
    if (originalToken === undefined) delete process.env.MATCH_OCR_TOKEN;
    else process.env.MATCH_OCR_TOKEN = originalToken;
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
  }
}

async function main(): Promise<void> {
  assert.equal(redisRetryDelay(1), 250);
  assert.equal(redisRetryDelay(4), 2_000);
  assert.equal(redisRetryDelay(100), 5_000);
  assert.equal(resolveSessionCookieSecure({ NODE_ENV: "production", SESSION_COOKIE_SECURE: undefined }), true);
  assert.equal(resolveSessionCookieSecure({ NODE_ENV: "development", SESSION_COOKIE_SECURE: undefined }), false);
  assert.equal(resolveSessionCookieSecure({ NODE_ENV: "production", SESSION_COOKIE_SECURE: "0" }), false);
  assert.equal(resolveSessionCookieSecure({ NODE_ENV: "development", SESSION_COOKIE_SECURE: "1" }), true);
  assert.throws(
    () => resolveSessionCookieSecure({ NODE_ENV: "production", SESSION_COOKIE_SECURE: "false" }),
    /must be 0 or 1/,
  );
  assert.equal(shouldBootstrapEquipment(0), true);
  assert.equal(shouldBootstrapEquipment(1), false);
  assert.throws(() => shouldBootstrapEquipment(-1), /non-negative safe integer/);
  await testRequestLimits();
  await testClientConnectionErrors();
  await testStreamingCombatUpload();
  await testOcrTransportGuards();
  console.log("Connection timeout, recovery, body-limit, and OCR transport tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
