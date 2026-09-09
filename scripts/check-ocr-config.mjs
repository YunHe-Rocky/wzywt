import { pathToFileURL } from "node:url";
import { readDeployEnv, readOcrEnv } from "./deploy-env.mjs";
import { resolveOcrEndpoint } from "../src/lib/public-origin.ts";

// Only inspect local configuration: no HTTP requests, tokens or query strings in logs.
export function checkOcrConfig(file) {
  const values = readDeployEnv(file);
  const { MATCH_OCR_ENDPOINT: endpoint, MATCH_OCR_TOKEN: token } = readOcrEnv(file);
  if (!endpoint) return "[ocr-config] not configured; website OCR is disabled (independent OCR process is unaffected)";
  const mode = process.env.DEPLOY_ENVIRONMENT ?? values.get("DEPLOY_ENVIRONMENT");
  const url = resolveOcrEndpoint(endpoint, mode, true);
  if (token && !/^[\x21-\x7e]+$/.test(token)) {
    throw new Error("MATCH_OCR_TOKEN must be ASCII without whitespace; its contents were not printed");
  }
  return `[ocr-config] config valid; transport=${url.protocol.slice(0, -1)} auth=${token ? "configured" : "not configured"}; connectivity and six-page support not checked`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error("Usage: node scripts/check-ocr-config.mjs <env-file>");
    console.log(checkOcrConfig(process.argv[2]));
  } catch (error) {
    // Only policy errors are emitted; OS read errors can include arbitrary paths.
    console.error(`[ocr-config] ${error?.code ? "Cannot read the selected environment file" : error.message}`);
    process.exitCode = 1;
  }
}
