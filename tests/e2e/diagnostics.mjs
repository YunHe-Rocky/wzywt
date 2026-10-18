import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const safeUrl = value => { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return ""; } };
export async function browserDiagnostics(context, page, name) {
  const mode = process.env.DEPLOY_ENVIRONMENT === "local" ? "local" : "proxy";
  const output = join(process.cwd(), ".cache/ci-diagnostics", mode, name);
  await mkdir(output, { recursive: true });
  const events = [];
  page.on("requestfailed", request => events.push({ at: Date.now(), event: "requestfailed", method: request.method(), url: safeUrl(request.url()), error: request.failure()?.errorText }));
  page.on("response", response => events.push({ at: Date.now(), event: "response", status: response.status(), url: safeUrl(response.url()), redirectFrom: safeUrl(response.request().redirectedFrom()?.url()) }));
  page.on("pageerror", error => events.push({ at: Date.now(), event: "pageerror", message: error.message, stack: error.stack }));
  page.on("console", message => { if (message.type() === "error") events.push({ at: Date.now(), event: "console", message: message.text() }); });
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) events.push({ at: Date.now(), event: "navigate", url: safeUrl(frame.url()) }); });
  // No DOM/source snapshots or screenshots in the trace: they can contain form
  // values. The raw network trace is kept outside the uploaded artifact tree.
  await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
  return async () => {
    await writeFile(join(output, "events.json"), JSON.stringify(events, null, 2));
    await page.screenshot({ path: join(output, "page.png"), fullPage: true }).catch(() => {});
    const raw = await mkdtemp(join(tmpdir(), "wzywt-private-trace-"));
    try {
      await context.tracing.stop({ path: join(raw, "trace.zip") });
      const result = spawnSync(process.env.OCR_TEST_PYTHON || "python3", ["scripts/redact-playwright-trace.py", join(raw, "trace.zip"), join(output, "trace.zip")], { encoding: "utf8", windowsHide: true });
      if (result.status !== 0) throw new Error("Trace redaction failed; raw trace was not published");
    } finally { await rm(raw, { recursive: true, force: true }); }
  };
}
