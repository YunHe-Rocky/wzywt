import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEPLOY_ENV_KEYS = Object.freeze([
  // Ordinary application settings used by the zero-config deployment path.
  "PORT",
  "HOST",
  // Optional advanced overrides. None are required for the normal path.
  "DEPLOY_PROJECT_NAME",
  "DEPLOY_BASE_DIR",
  "DEPLOY_SOURCE_DIR",
  "DEPLOY_RUN_USER",
  "DEPLOY_RUN_GROUP",
  "DEPLOY_REMOTE",
  "DEPLOY_BRANCH",
  "DEPLOY_WEB_HOST",
  "DEPLOY_WEB_PORT",
  "DEPLOY_HEALTH_URL",
  "DEPLOY_HEALTH_ATTEMPTS",
  "DEPLOY_HEALTH_INTERVAL_SECONDS",
  "DEPLOY_HEALTH_TIMEOUT_SECONDS",
  "DEPLOY_PM2_HOME",
  "DEPLOY_PM2_BIN",
  "DEPLOY_PM2_CONFIG",
  "DEPLOY_PM2_WEB_NAME",
  "DEPLOY_PM2_CRON_NAME",
  "DEPLOY_NODE_BIN",
  "DEPLOY_MKTEMP_BIN",
  "DEPLOY_REALPATH_BIN",
  "DEPLOY_ID_BIN",
  "DEPLOY_GIT_BIN",
  "DEPLOY_TAR_BIN",
  "DEPLOY_NPM_BIN",
  "DEPLOY_NPX_BIN",
  "DEPLOY_CURL_BIN",
  "DEPLOY_FLOCK_BIN",
  "DEPLOY_MYSQLDUMP_BIN",
  "DEPLOY_SYSTEMCTL_BIN",
  "DEPLOY_NODE_VERSION_PATTERN",
  "DEPLOY_NPM_VERSION_PATTERN",
  "DEPLOY_NPX_VERSION_PATTERN",
  "DEPLOY_GIT_VERSION_PATTERN",
  "DEPLOY_TAR_VERSION_PATTERN",
  "DEPLOY_CURL_VERSION_PATTERN",
  "DEPLOY_FLOCK_VERSION_PATTERN",
  "DEPLOY_PM2_VERSION_PATTERN",
  "DEPLOY_MYSQLDUMP_VERSION_PATTERN",
  "DEPLOY_SYSTEMCTL_VERSION_PATTERN",
  "DEPLOY_HOST_MANIFEST",
  // Retained only so deploy.sh can reject unsafe legacy host mutation settings.
  "DEPLOY_REQUIRED_COMMANDS",
  "DEPLOY_REQUIRED_SYSTEMD_SERVICES",
  "DEPLOY_AUTO_START_SERVICES",
  "MEDIA_STORAGE_DIR",
  "AVATAR_DIR",
]);

export const RUNTIME_ENV_KEYS = Object.freeze([
  "DATABASE_URL",
  "REDIS_URL",
  "REDIS_REQUIRED",
  "PORT",
  "HOST",
]);

function parseQuotedValue(rawValue, quote, lineNumber, key) {
  let value = "";
  let escaped = false;
  let closingIndex = -1;

  for (let index = 1; index < rawValue.length; index += 1) {
    const character = rawValue[index];
    if (quote === '"' && escaped) {
      const replacements = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };
      value += replacements[character] ?? character;
      escaped = false;
      continue;
    }
    if (quote === '"' && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === quote) {
      closingIndex = index;
      break;
    }
    value += character;
  }

  if (escaped || closingIndex < 0) {
    throw new Error(`Unterminated quoted value for ${key} on line ${lineNumber}`);
  }

  const remainder = rawValue.slice(closingIndex + 1).trim();
  if (remainder && !remainder.startsWith("#")) {
    throw new Error(`Unexpected content after ${key} on line ${lineNumber}`);
  }
  return value;
}

function parseValue(rawValue, lineNumber, key) {
  const value = rawValue.trimStart();
  if (value.startsWith("'")) return parseQuotedValue(value, "'", lineNumber, key);
  if (value.startsWith('"')) return parseQuotedValue(value, '"', lineNumber, key);

  let commentIndex = -1;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "#" && (index === 0 || /\s/.test(value[index - 1]))) {
      commentIndex = index;
      break;
    }
  }
  return (commentIndex >= 0 ? value.slice(0, commentIndex) : value).trimEnd();
}

function parseSelectedEnv(content, keys) {
  const allowedKeys = new Set(keys);
  const result = new Map();
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const assignment = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=([\s\S]*)$/);
    if (!assignment) continue;
    const [, key, rawValue] = assignment;
    if (!allowedKeys.has(key)) continue;
    if (result.has(key)) throw new Error(`Duplicate environment key ${key} on line ${lineNumber}`);

    const value = parseValue(rawValue, lineNumber, key);
    if (value.includes("\0") || value.includes("\n") || value.includes("\r")) {
      throw new Error(`Environment key ${key} must be a single-line value`);
    }
    result.set(key, value);
  }

  return result;
}

export function parseDeployEnv(content) {
  return parseSelectedEnv(content, DEPLOY_ENV_KEYS);
}

export function parseRuntimeEnv(content) {
  return parseSelectedEnv(content, RUNTIME_ENV_KEYS);
}

export function readDeployEnv(filePath) {
  return parseDeployEnv(readFileSync(filePath, "utf8"));
}

export function readRuntimeEnv(filePath) {
  return parseRuntimeEnv(readFileSync(filePath, "utf8"));
}

function writeNullDelimited(entries) {
  for (const key of DEPLOY_ENV_KEYS) {
    if (!entries.has(key)) continue;
    process.stdout.write(key);
    process.stdout.write("\0");
    process.stdout.write(entries.get(key));
    process.stdout.write("\0");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/deploy-env.mjs <env-file>");
    process.exit(2);
  }
  try {
    writeNullDelimited(readDeployEnv(filePath));
  } catch (error) {
    console.error(`[deploy-env] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
