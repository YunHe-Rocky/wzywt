/** Shared by Edge middleware and the Node 24 deployment preflight. */
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

function isPrivateHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  // URL has already canonicalized IPv6. Only unique-local addresses are accepted.
  if (/^\[f[cd][0-9a-f]{2}:/.test(hostname)) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
  const [a, b] = hostname.split(".").map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
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
