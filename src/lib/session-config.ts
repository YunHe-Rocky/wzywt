import { resolveDeploymentEntry, resolveDeploymentEnvironment } from "./public-origin";

export interface SessionEnvironment {
  NODE_ENV?: string;
  SESSION_COOKIE_SECURE?: string;
  DEPLOY_ENVIRONMENT?: string;
  PUBLIC_ORIGIN?: string;
}

export function resolveSessionCookieSecure(environment: SessionEnvironment = process.env): boolean {
  if (resolveDeploymentEnvironment(environment.DEPLOY_ENVIRONMENT) === "local") {
    return resolveDeploymentEntry(environment.PUBLIC_ORIGIN || "", "local", environment.SESSION_COOKIE_SECURE).secure;
  }
  const configured = environment.SESSION_COOKIE_SECURE?.trim();
  if (!configured) return environment.NODE_ENV === "production" || environment.PUBLIC_ORIGIN?.startsWith("https://") === true;
  if (configured === "1") return true;
  if (configured === "0") {
    if (environment.NODE_ENV === "production" || environment.PUBLIC_ORIGIN?.startsWith("https://")) {
      throw new Error("Production HTTPS requires a Secure session cookie");
    }
    return false;
  }
  throw new Error("SESSION_COOKIE_SECURE must be 0 or 1 when configured");
}
