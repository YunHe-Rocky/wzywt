import { randomUUID } from "node:crypto";
import { resourceGovernor } from "./resource-governor";
import { runtimeLog } from "./runtime-log";
import { requestContext } from "./request-context";
import { externalRequestCost, externalRequestLane } from "@/core/resource-policy";
import { readResourceSettings } from "@/core/resource-settings";
import { acquireRedisRequest } from "./redis-query-cache";

/** Hold the slot through streaming completion/cancellation, not just headers. */
export function withRequestCapacity<Args extends unknown[]>(handler: (...args: Args) => Response | Promise<Response>, governor = resourceGovernor) {
  return async (...args: Args): Promise<Response> => {
    const request = args[0] as Request | undefined;
    const path = request?.url ? new URL(request.url).pathname : "";
    const lane = externalRequestLane(path, request?.method);
    const cost = externalRequestCost(path, request?.method, request?.headers?.get("content-type") || "");
    const release = governor.acquireRequest(cost, lane);
    const candidate = request?.headers?.get("x-request-id");
    const requestId = candidate && /^[\w.:-]{8,128}$/.test(candidate) ? candidate : randomUUID();
    if (!release) return Response.json({ error: "当前访问繁忙，请稍后重试", code: "RESOURCE_BUSY", requestId }, {
      status: 503, headers: { "Retry-After": "2", "Cache-Control": "no-store", "x-request-id": requestId },
    });
    const started = Date.now();
    let releaseRedis: (() => Promise<void>) | undefined;
    let finished = false;
    const finish = (status: number, outcome: string) => {
      if (finished) return;
      finished = true; release();
      void releaseRedis?.();
      runtimeLog("request.completed", { requestId, method: request?.method, lane, path,
        status, outcome, durationMs: Date.now() - started }, status >= 500 ? "warn" : "info");
    };
    try {
      if (path !== "/api/health") {
        const settings = readResourceSettings(process.env);
        try {
          const acquired = await acquireRedisRequest(randomUUID(), lane,
            lane === "subscription" ? settings.RESOURCE_SUBSCRIPTION_CONCURRENCY : settings.RESOURCE_EXTERNAL_CONCURRENCY);
          if (!acquired) { finish(503, "redis-capacity"); return Response.json({ error: "当前访问繁忙，请稍后重试", code: "RESOURCE_BUSY" }, { status: 503, headers: { "Retry-After": "2" } }); }
          releaseRedis = acquired;
        } catch {
          finish(503, "redis-unavailable");
          return Response.json({ error: "缓存服务暂时不可用，请稍后重试", code: "REDIS_UNAVAILABLE" }, { status: 503 });
        }
      }
      const response = await requestContext.run({ requestId, startedAt: started, method: request?.method }, () => handler(...args));
      const headers = new Headers(response.headers);
      headers.set("x-request-id", requestId);
      if (request?.method === "HEAD") {
        await response.body?.cancel(); finish(response.status, "head-completed");
        return new Response(null, { status: response.status, headers });
      }
      if (!response.body) { finish(response.status, "completed"); return new Response(null, { status: response.status, headers }); }
      const reader = response.body.getReader();
      let closed = false;
      let closing: Promise<void> | undefined;
      let outer: ReadableStreamDefaultController<Uint8Array>;
      let unregister: (() => void) | undefined;
      let lifetime: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        request?.signal?.removeEventListener("abort", onAbort);
        unregister?.(); if (lifetime) clearTimeout(lifetime);
      };
      const close = (reason: unknown, outcome: string) => {
        if (closing) return closing;
        closed = true;
        request?.signal?.removeEventListener("abort", onAbort);
        if (lifetime) clearTimeout(lifetime);
        try { outer?.close(); } catch { /* Already cancelled by the consumer. */ }
        closing = Promise.resolve().then(() => reader.cancel(reason)).catch(error => {
          runtimeLog("request.stream_cancel_failed", { requestId, error }, "warn");
        }).finally(() => { cleanup(); finish(response.status, outcome); try { reader.releaseLock(); } catch { /* Read still settling. */ } });
        return closing;
      };
      const onAbort = () => { void close(request?.signal?.reason, "client-aborted"); };
      const body = new ReadableStream<Uint8Array>({
        start(controller) { outer = controller; },
        async pull(controller) {
          if (closed) return;
          try {
            const { done, value } = await reader.read();
            if (closed) return;
            if (done) { closed = true; cleanup(); finish(response.status, "completed"); reader.releaseLock(); controller.close(); }
            else controller.enqueue(value);
          } catch (error) {
            if (closed) return;
            closed = true; cleanup(); finish(500, "stream-failed");
            try { reader.releaseLock(); } catch { /* Reader has an outstanding read. */ }
            controller.error(error);
          }
        },
        cancel(reason) { return close(reason, "client-cancelled"); },
      });
      request?.signal?.addEventListener("abort", onAbort, { once: true });
      if (lane === "subscription" && governor.enabled) {
        const retire = (reason: string) => {
          runtimeLog("request.subscription_retired", { requestId, reason, durationMs: Date.now() - started });
          void close(reason, `subscription-${reason}`);
        };
        unregister = governor.onSubscriptionRetire(retire);
        if (!closed) {
          lifetime = setTimeout(() => retire("max-age"), readResourceSettings(process.env).RESOURCE_SUBSCRIPTION_MAX_SECONDS * 1_000);
          lifetime.unref();
        }
      }
      if (request?.signal?.aborted) onAbort();
      return new Response(body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      finish(500, "handler-failed");
      runtimeLog("request.handler_failed", { requestId, error }, "error");
      throw error;
    }
  };
}
