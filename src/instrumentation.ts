export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { installRuntimeConsole, runtimeLog } = await import("@/lib/runtime-log");
    installRuntimeConsole();
    runtimeLog("process.registered", { memory: process.memoryUsage() });
  }
}

export async function onRequestError(error: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runtimeLog } = await import("@/lib/runtime-log");
  runtimeLog("request.failed", { error, path: request.path.split("?")[0], method: request.method,
    requestId: request.headers["x-request-id"] }, "error");
}
