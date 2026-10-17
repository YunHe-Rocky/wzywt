import { randomUUID } from "node:crypto";
import { formatWithOptions } from "node:util";

// Plain ESM: launchers need neither tsx nor application path aliases.
const key = Symbol.for("wzywt.runtime-logging");
const state = globalThis[key] ??= { bootId: randomUUID(), consoleInstalled: false, context: () => ({}) };
export const runtimeBootId = state.bootId;
const sensitive = /password|secret|token|authorization|cookie|database_url|redis_url/i;
export function configureRuntimeLogContext(provider) { state.context = provider; }
export function redactRuntimeText(value) {
  return value.slice(0, 6_000)
    .replace(/\b(?:mysql|redis|rediss):\/\/[^\s"']+/gi, "<connection-redacted>")
    .replace(/https?:\/\/[^\s"']+/gi, url => {
      try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}`; } catch { return "<url-redacted>"; }
    })
    .replace(/(["']?[\w-]*(?:password|secret|token|authorization|cookie)[\w-]*["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>");
}
function safeValue(value, depth = 0) {
  if (depth > 4) return "<truncated>";
  if (value instanceof Error) return { name: value.name, message: redactRuntimeText(value.message),
    stack: value.stack?.split("\n").slice(1, 9).map(redactRuntimeText),
    ...(value.cause ? { cause: safeValue(value.cause, depth + 1) } : {}) };
  if (typeof value === "string") return redactRuntimeText(value);
  if (Array.isArray(value)) return value.slice(0, 24).map(item => safeValue(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 40)
    .map(([name, item]) => [name, sensitive.test(name) ? "<redacted>" : safeValue(item, depth + 1)]));
  return typeof value === "bigint" ? String(value) : value;
}
function identity() { return { timestamp: new Date().toISOString(), role: process.env.APP_ROLE || "web",
  releaseId: process.env.APP_RELEASE_ID || "development", pid: process.pid, bootId: runtimeBootId }; }
export function runtimeLog(event, fields = {}, level = "info") {
  const line = JSON.stringify({ ...safeValue(state.context()), ...safeValue(fields), ...identity(), level, event });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
export function installRuntimeConsole() {
  if (state.consoleInstalled) return;
  state.consoleInstalled = true;
  for (const method of ["log", "info", "warn", "error"]) {
    const write = console[method].bind(console);
    console[method] = (...args) => {
      if (args.length === 1 && typeof args[0] === "string") {
        try { const entry = JSON.parse(args[0]); if (entry?.timestamp && entry?.event && entry?.bootId) { write(args[0]); return; } }
        catch { /* Wrap ordinary service output below. */ }
      }
      write(JSON.stringify({ ...safeValue(state.context()), ...identity(), event: "service.output", level: method === "log" ? "info" : method,
        message: redactRuntimeText(formatWithOptions({ depth: 2, maxArrayLength: 12 }, ...args)) }));
    };
  }
}
