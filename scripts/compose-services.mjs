import { parseSelectedEnv } from "./deploy-env.mjs";

// Only two choices are new. Existing endpoints, credentials and bind settings
// remain the connection configuration; legacy --ocr/env files keep working.
export function resolveServices(content, { environment = process.env, ocr = false } = {}) {
  const keys = ["MYSQL_MODE", "MYSQL_HOST", "MYSQL_PORT", "OCR_MODE", "MATCH_OCR_ENDPOINT", "MATCH_OCR_INTERNAL_HOST"];
  const values = parseSelectedEnv(content, keys);
  const get = (key) => (environment[key] ?? values.get(key) ?? "").trim();
  const mysql = get("MYSQL_MODE") || "container";
  if (!["container", "external"].includes(mysql)) throw new Error("MYSQL_MODE must be container or external.");
  const endpoint = get("MATCH_OCR_ENDPOINT");
  const configuredOcr = get("OCR_MODE");
  const mode = configuredOcr || (ocr || endpoint === "http://ocr:8010/recognize" ? "container" : endpoint ? "external" : "off");
  if (!["off", "container", "external"].includes(mode)) throw new Error("OCR_MODE must be off, container or external.");
  if (ocr && mode !== "container") throw new Error("--ocr conflicts with OCR_MODE; use OCR_MODE=container or remove --ocr.");
  if (mode === "external" && !endpoint) throw new Error("OCR_MODE=external requires MATCH_OCR_ENDPOINT.");
  if (mode === "off" && endpoint) throw new Error("OCR_MODE=off requires an empty MATCH_OCR_ENDPOINT.");
  const mysqlHost = mysql === "container" ? "mysql" : get("MYSQL_HOST") || "host-machine";
  const mysqlPort = mysql === "container" ? "3306" : get("MYSQL_PORT") || "3306";
  if (mysql === "external" && /^(localhost|127(?:\.\d+){3}|mysql)$/i.test(mysqlHost)) {
    throw new Error("External MYSQL_HOST must be reachable from containers; use host-machine for the Docker host, not localhost/mysql.");
  }
  const ocrEndpoint = mode === "container" ? "http://ocr:8010/recognize" : endpoint;
  if (mode === "container" && endpoint && endpoint !== ocrEndpoint) throw new Error("OCR_MODE=container requires the internal OCR endpoint; clear MATCH_OCR_ENDPOINT or use http://ocr:8010/recognize.");
  let endpointHost;
  if (mode === "external") {
    try { endpointHost = new URL(endpoint).hostname; }
    catch { throw new Error("MATCH_OCR_ENDPOINT is invalid; use a plain HTTP(S) service URL."); }
  }
  if (mode === "external" && /^(localhost|127(?:\.\d+){3}|\[::1\]|ocr)$/.test(endpointHost)) {
    throw new Error("External OCR must be reachable from containers; use host-machine or a reachable service address, not loopback/ocr.");
  }
  // Trust exactly the explicit host gateway alias, preserving the existing URL
  // policy for all other destinations (including public HTTP names).
  const internalHost = mode === "container" ? "ocr"
    : mode === "external" && endpointHost === "host-machine" ? "host-machine"
      : get("MATCH_OCR_INTERNAL_HOST");
  return { mysql, ocr: mode, environment: {
    MYSQL_MODE: mysql, MYSQL_HOST: mysqlHost, MYSQL_PORT: mysqlPort,
    OCR_MODE: mode, MATCH_OCR_ENDPOINT: ocrEndpoint, MATCH_OCR_INTERNAL_HOST: internalHost,
  } };
}
