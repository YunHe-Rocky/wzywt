/** Shared HTTP address policy for Edge, server callers and Node deployment checks. */
export function parsePublicOrigin(value: string, requireHttps = false): string {
  const url = new URL(value);
  if (value !== value.trim() || /[\\\s]/.test(value)
    || !["http:", "https:"].includes(url.protocol)
    || (requireHttps && url.protocol !== "https:")
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || (value !== url.origin && value !== `${url.origin}/`)) {
    throw new Error("PUBLIC_ORIGIN must be an origin without credentials, path, query or fragment; production requires HTTPS");
  }
  return url.origin;
}

export function resolveDeploymentEnvironment(value?: string): "production" | "local" {
  const mode = value || "production";
  if (mode !== "production" && mode !== "local") {
    throw new Error("DEPLOY_ENVIRONMENT must be production or local");
  }
  return mode;
}

/** Accept a canonical hostname from URL, not a raw endpoint or DNS lookup. */
function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(hostname);
}

export function isPrivateHostname(hostname: string): boolean {
  if (isLoopbackHostname(hostname)) return true;
  // URL has already canonicalized IPv6. Only unique-local addresses are accepted.
  if (/^\[f[cd][0-9a-f]{2}:/.test(hostname)) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
  const [a, b] = hostname.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** OCR transport policy shared by the live caller and the deployment preflight. */
export function resolveOcrEndpoint(value: string, environment?: string, production = true): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("MATCH_OCR_ENDPOINT 配置无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MATCH_OCR_ENDPOINT 只支持 HTTP 或 HTTPS");
  }
  if (url.username || url.password || url.hash || /[\\\s]/.test(value.trim())) {
    throw new Error("MATCH_OCR_ENDPOINT 不得包含账号密码、片段、空白或反斜杠；鉴权请使用 MATCH_OCR_TOKEN");
  }
  const mode = resolveDeploymentEnvironment(environment);
  if (mode === "local" && url.protocol === "http:" && !isPrivateHostname(url.hostname)) {
    throw new Error("本地模式 HTTP MATCH_OCR_ENDPOINT 仅允许 localhost、回环或私有 IP 地址");
  }
  if (production && mode !== "local" && url.protocol !== "https:" && !isLoopbackHostname(url.hostname)) {
    throw new Error("生产环境非回环 MATCH_OCR_ENDPOINT 必须使用 HTTPS；同机 OCR 可使用 http://127.0.0.1:8010/recognize");
  }
  return url;
}

export function resolveDeploymentEntry(value: string, environment?: string, cookieSecure?: string) {
  const mode = resolveDeploymentEnvironment(environment);
  const origin = parsePublicOrigin(value, mode === "production");
  const url = new URL(origin);
  if (url.protocol === "http:" && !isPrivateHostname(url.hostname)) {
    throw new Error("Local HTTP PUBLIC_ORIGIN must use localhost, a loopback or private IP address");
  }
  const secure = url.protocol === "https:";
  const configured = cookieSecure?.trim();
  if (configured && configured !== "0" && configured !== "1") {
    throw new Error("SESSION_COOKIE_SECURE must be 0 or 1 when configured");
  }
  if (mode === "local" && configured && (configured === "1") !== secure) {
    throw new Error("SESSION_COOKIE_SECURE must match the local PUBLIC_ORIGIN protocol; remove the override to select automatically");
  }
  return { origin, secure: configured ? configured === "1" : secure };
}
