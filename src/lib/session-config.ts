export interface SessionEnvironment {
  NODE_ENV?: string;
  SESSION_COOKIE_SECURE?: string;
}

export function resolveSessionCookieSecure(environment: SessionEnvironment = process.env): boolean {
  const configured = environment.SESSION_COOKIE_SECURE?.trim();
  if (!configured) return environment.NODE_ENV === "production";
  if (configured === "1") return true;
  if (configured === "0") return false;
  throw new Error("SESSION_COOKIE_SECURE must be 0 or 1 when configured");
}