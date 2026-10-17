import { pathToFileURL } from "node:url";
import { resolveOcrEndpoint } from "../src/lib/public-origin.ts";

// Probe only the health protocol; do not run inference or print tokens/URLs.
export async function probeOcr(environment, request = fetch) {
  const endpoint = resolveOcrEndpoint(environment.MATCH_OCR_ENDPOINT, environment.DEPLOY_ENVIRONMENT, true, environment.MATCH_OCR_INTERNAL_HOST);
  endpoint.pathname = endpoint.pathname.replace(/\/recognize\/?$/, "/health");
  if (!endpoint.pathname.endsWith("/health")) throw new Error("External OCR endpoint must end in /recognize for its health probe.");
  endpoint.search = "";
  try {
    const response = await request(endpoint, {
      redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: environment.MATCH_OCR_TOKEN ? { Authorization: `Bearer ${environment.MATCH_OCR_TOKEN}` } : {},
    });
    const payload = response.ok ? await response.json() : null;
    if (payload?.status !== "ok" || payload?.service !== "wzywt-ocr-preview" || payload?.fullMatchReady !== true) throw new Error();
  } catch {
    throw new Error("External OCR health/six-page protocol check failed from the container network; check host listener, proxy and service version.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await probeOcr(process.env);
    console.log("[compose] External OCR health and six-page protocol passed; recognition/authentication still require acceptance.");
  } catch (error) {
    console.error(`[compose] ${error.message}`);
    process.exitCode = 1;
  }
}
