import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSelectedEnv } from "./deploy-env.mjs";
import { resourceSettingKeys } from "../src/core/resource-settings.ts";

// Share application policy, never native service addresses, host paths or
// deployment controls. Docker connections and bindings remain independently owned.
export const sharedComposeEnvKeys = Object.freeze([
  "TZ", "SESSION_SECRET", "HEALTH_DETAILS_TOKEN", "PUBLIC_ORIGIN",
  "DEPLOY_ENVIRONMENT", "SESSION_COOKIE_SECURE", "TRUST_PROXY",
  "MATCH_OCR_ENDPOINT", "MATCH_OCR_TOKEN", "MATCH_OCR_INTERNAL_HOST", "MATCH_OCR_QUEUE_LIMIT",
  "MEDIA_USER_STORED_QUOTA_BYTES", "MEDIA_USER_DAILY_QUOTA_BYTES",
  "MEDIA_GLOBAL_STORED_QUOTA_BYTES", "MEDIA_MIN_FREE_BYTES",
  "COMBAT_VIDEO_UPLOAD_TIMEOUT_SECONDS", "COMBAT_VIDEO_MAX_SIZE_MB", "COMBAT_VIDEO_MAX_DURATION_SECONDS",
  ...resourceSettingKeys,
]);

export function readSharedComposeEnv(root) {
  let content;
  try { content = readFileSync(resolve(root, ".env"), "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  return Object.fromEntries(parseSelectedEnv(content, sharedComposeEnvKeys));
}

/** Missing inherits; an explicit empty assignment clears the inherited value. */
export function composeEnvironment(root, content, environment = process.env) {
  return {
    ...readSharedComposeEnv(root),
    ...Object.fromEntries(parseSelectedEnv(content, sharedComposeEnvKeys)),
    ...Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== undefined)),
  };
}

/** Only persisted shared secrets can replace generated Docker credentials. */
export function initializeComposeEnv(template, shared = {}, { ocr = false } = {}) {
  const secret = () => randomBytes(32).toString("hex");
  let content = template.replace(/__GENERATE_[A-Z_]+__/g, secret);
  if (ocr) content = content.replace(/^OCR_MODE=[^\r\n]*$/m, "OCR_MODE=container")
    + "\n# 覆盖 .env 中可能存在的原生 OCR 地址。\nMATCH_OCR_ENDPOINT=http://ocr:8010/recognize\n";
  const missing = ["SESSION_SECRET", "MATCH_OCR_TOKEN"].filter(key => !shared[key]?.trim());
  if (missing.length) content += "\n# 以下共享密钥在根目录 .env 中未配置，由 init 生成；请妥善保管。\n"
    + missing.map(key => `${key}=${secret()}\n`).join("");
  return content;
}
