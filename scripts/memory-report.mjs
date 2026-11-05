import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MiB = 1024 * 1024;
const tailBytes = 2 * MiB;
const maximumSamples = 6000;
const events = new Set(["resource.sample", "process.started", "process.boot", "task.completed"]);
const metrics = ["rss", "heapUsed", "external", "arrayBuffers"];
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const appName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function parseArguments(args) {
  const options = { minutes: 120, webName: "wangzhe-yanwutang-web", cronName: "wangzhe-yanwutang-cron" };
  const names = { "--pm2-home": "pm2Home", "--minutes": "minutes", "--web-name": "webName", "--cron-name": "cronName" };
  for (let index = 0; index < args.length; index++) {
    const key = names[args[index]];
    if (!key || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Expected --pm2-home PATH [--minutes 120] [--web-name NAME] [--cron-name NAME]");
    options[key] = args[++index];
  }
  if (!options.pm2Home || !isAbsolute(options.pm2Home)) throw new Error("--pm2-home must be an explicit absolute path");
  if (!/^\d+$/.test(String(options.minutes)) || Number(options.minutes) < 1 || Number(options.minutes) > 10080) throw new Error("--minutes must be an integer from 1 to 10080");
  if (![options.webName, options.cronName].every(name => appName.test(name)) || options.webName === options.cronName) throw new Error("Web and Cron require distinct, safe PM2 app names");
  return { ...options, minutes: Number(options.minutes), pm2Home: resolve(options.pm2Home) };
}

/** No MemAvailable means unknown availability, not MemFree. All values are bytes. */
export function parseMeminfo(content) {
  const fields = Object.fromEntries([...content.matchAll(/^([A-Za-z_()]+):\s+(\d+) kB$/gm)]
    .map(([, name, value]) => [name, Number(value) * 1024]));
  const valid = key => Number.isSafeInteger(fields[key]) && fields[key] >= 0;
  if (!valid("MemTotal") || fields.MemTotal === 0) return null;
  const available = valid("MemAvailable") && fields.MemAvailable <= fields.MemTotal ? fields.MemAvailable : null;
  return {
    total: fields.MemTotal, available, used: available === null ? null : fields.MemTotal - available,
    free: valid("MemFree") ? fields.MemFree : null,
    bufferCache: ["Buffers", "Cached", "SReclaimable"].every(valid) ? fields.Buffers + fields.Cached + fields.SReclaimable : null,
  };
}

/** Fixed-size tail reads avoid scanning or loading multi-gigabyte log files. */
export function readLogTail(path) {
  let fd;
  try {
    const before = lstatSync(path);
    if (before.isSymbolicLink() || !before.isFile()) return { status: "not-regular", text: "" };
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino) return { status: "changed", text: "" };
    const offset = Math.max(0, stat.size - tailBytes);
    const buffer = Buffer.alloc(Math.min(stat.size, tailBytes));
    const bytesRead = readSync(fd, buffer, 0, buffer.length, offset);
    let text = buffer.subarray(0, bytesRead).toString("utf8");
    // The leading bytes can be half a JSON record or UTF-8 character.
    if (offset > 0) {
      const newline = text.indexOf("\n");
      text = newline < 0 ? "" : text.slice(newline + 1);
    }
    return { status: "read", text, bytesRead, truncated: offset > 0, changed: bytesRead < buffer.length };
  } catch (error) {
    return { status: error.code === "ENOENT" ? "missing" : "unreadable", text: "" };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function parseSample(line, role, from, to) {
  if (line.length > 32 * 1024) return null;
  let row;
  try { row = JSON.parse(line); } catch { return null; }
  if (!row || !events.has(row.event) || row.role !== role || typeof row.bootId !== "string" || !uuid.test(row.bootId)
    || !Number.isSafeInteger(row.pid) || row.pid < 1 || typeof row.timestamp !== "string" || !timestamp.test(row.timestamp)) return null;
  const at = Date.parse(row.timestamp);
  if (!Number.isFinite(at) || at < from || at > to || !row.memory) return null;
  if (!metrics.every(key => Number.isSafeInteger(row.memory[key]) && row.memory[key] >= 0)) return null;
  // Copy only numeric metrics and validated identity; never retain arbitrary log text.
  return { at, role, pid: row.pid, bootId: row.bootId.toLowerCase(), event: row.event,
    idle: row.event === "resource.sample" && row.activeJobs === 0 && row.queuedJobs === 0 && row.activeRequests === 0,
    memory: Object.fromEntries(metrics.map(key => [key, row.memory[key]])) };
}

export function collectMemoryReport(options, { now = Date.now(), readMeminfo = () => readFileSync("/proc/meminfo", "utf8") } = {}) {
  const from = now - options.minutes * 60_000;
  const files = { read: 0, missing: 0, skipped: 0, truncated: 0, changed: 0, bytesRead: 0 };
  let samples = [];
  let samplesCapped = false;
  for (const [role, name] of [["web", options.webName], ["cron", options.cronName]]) {
    for (const stream of ["out", "error"]) {
      for (const rotation of [3, 2, 1, 0]) {
        const path = resolve(options.pm2Home, "logs", `${name}-${stream}.log${rotation ? `.${rotation}` : ""}`);
        const tail = readLogTail(path);
        if (tail.status !== "read") { files[tail.status === "missing" ? "missing" : "skipped"]++; continue; }
        files.read++; files.bytesRead += tail.bytesRead;
        if (tail.truncated) files.truncated++;
        if (tail.changed) files.changed++;
        for (const line of tail.text.split("\n")) {
          const sample = parseSample(line.trimEnd(), role, from, now);
          if (sample) samples.push(sample);
          if (samples.length > maximumSamples * 2) {
            samples.sort((a, b) => b.at - a.at); samples.length = maximumSamples; samplesCapped = true;
          }
        }
      }
    }
  }
  samples.sort((a, b) => b.at - a.at);
  // copytruncate/rotation races may expose the same record in two files.
  const seen = new Set();
  samples = samples.filter(sample => {
    const key = JSON.stringify(sample);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  if (samples.length > maximumSamples) { samples.length = maximumSamples; samplesCapped = true; }
  const groups = new Map();
  for (const sample of samples.toReversed()) {
    const key = `${sample.role}:${sample.pid}:${sample.bootId}`;
    let group = groups.get(key);
    if (!group) {
      group = { role: sample.role, pid: sample.pid, bootId: sample.bootId, count: 0, from: sample.at, to: sample.at,
        first: sample.memory, last: sample.memory, min: { ...sample.memory }, max: { ...sample.memory }, idle: null,
        taskCompletedCount: 0, latestTaskCompletions: [] };
      groups.set(key, group);
    }
    group.count++; group.to = sample.at; group.last = sample.memory;
    for (const metric of metrics) {
      group.min[metric] = Math.min(group.min[metric], sample.memory[metric]);
      group.max[metric] = Math.max(group.max[metric], sample.memory[metric]);
    }
    if (sample.idle) {
      group.idle ||= { count: 0, from: sample.at, first: sample.memory, minRss: sample.memory.rss, maxRss: sample.memory.rss };
      group.idle.count++; group.idle.to = sample.at; group.idle.last = sample.memory;
      group.idle.minRss = Math.min(group.idle.minRss, sample.memory.rss);
      group.idle.maxRss = Math.max(group.idle.maxRss, sample.memory.rss);
    }
    if (sample.event === "task.completed") {
      group.taskCompletedCount++;
      group.latestTaskCompletions.push({ at: sample.at, ...sample.memory });
      if (group.latestTaskCompletions.length > 3) group.latestTaskCompletions.shift();
    }
  }
  let host = null;
  try { host = parseMeminfo(readMeminfo()); } catch { /* Linux-only live host snapshot. */ }
  return { generatedAt: now, from, files, samplesCapped, sampleCount: samples.length, groupCount: groups.size, host,
    groups: [...groups.values()].sort((a, b) => b.to - a.to).slice(0, 20) };
}

const mib = value => value === null ? "unknown" : (value / MiB).toFixed(1);
const iso = value => new Date(value).toISOString();

export function formatMemoryReport(report) {
  const lines = ["Memory report (read only; all sizes MiB)", `Window: ${iso(report.from)} -> ${iso(report.generatedAt)}`];
  if (report.host) {
    const host = report.host;
    lines.push(`Host now: total=${mib(host.total)} available=${mib(host.available)} used=${mib(host.used)}${host.used === null ? "" : ` (${(host.used / host.total * 100).toFixed(1)}%)`} free=${mib(host.free)} buff/cache=${mib(host.bufferCache)}`);
    lines.push("Host used = total - MemAvailable; free excludes reclaimable caches. Missing MemAvailable means unknown.");
  } else lines.push("Host now: unavailable (/proc/meminfo not readable or unsupported).");
  lines.push(`Logs: files=${report.files.read} missing=${report.files.missing} skipped=${report.files.skipped} truncated=${report.files.truncated} changed=${report.files.changed}; read=${mib(report.files.bytesRead)}; samples=${report.sampleCount}${report.samplesCapped ? " (latest 6000 only)" : ""}`);
  lines.push("Coverage: at most 2 MiB per file, current + 3 rotations, Web/Cron out/error only; older history may be missing. This does not measure PM2/MySQL/Redis/OCR.");
  for (const group of report.groups) {
    lines.push(`${group.role} pid=${group.pid} boot=${group.bootId} samples=${group.count} ${iso(group.from)} -> ${iso(group.to)}`);
    for (const metric of metrics) lines.push(`  ${metric}: first=${mib(group.first[metric])} last=${mib(group.last[metric])} min=${mib(group.min[metric])} max=${mib(group.max[metric])} change=${mib(group.last[metric] - group.first[metric])}`);
    if (group.idle) {
      const idle = group.idle;
      lines.push(`  idle samples=${idle.count} ${iso(idle.from)} -> ${iso(idle.to)} rss:first=${mib(idle.first.rss)} last=${mib(idle.last.rss)} min=${mib(idle.minRss)} max=${mib(idle.maxRss)} heapUsed:first=${mib(idle.first.heapUsed)} last=${mib(idle.last.heapUsed)} external:first=${mib(idle.first.external)} last=${mib(idle.last.external)}`);
    } else lines.push("  idle samples=0 (no resource.sample with activeJobs/queuedJobs/activeRequests all zero).");
    lines.push(`  task.completed=${group.taskCompletedCount}; latest completion samples (not post-idle baselines):`);
    for (const sample of group.latestTaskCompletions) lines.push(`    ${iso(sample.at)} rss=${mib(sample.rss)} heapUsed=${mib(sample.heapUsed)} external=${mib(sample.external)}`);
    if (group.count < 3 || group.to - group.from < 60_000) lines.push("  INSUFFICIENT HISTORY: fewer than 3 samples or less than 1 minute in this process lifetime.");
  }
  if (report.groupCount > report.groups.length) lines.push(`Only latest ${report.groups.length} of ${report.groupCount} process lifetimes shown.`);
  if (!report.sampleCount) lines.push("NO VALID SAMPLES: check app names, readable logs, time window, and whether runtime sampling is enabled.");
  lines.push("A rise alone does not prove a leak. Compare repeated task cycles and idle baselines within the same boot; process restarts are separate groups. Logs are not a live process list.");
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(formatMemoryReport(collectMemoryReport(parseArguments(process.argv.slice(2))))); }
  catch (error) { console.error(`[memory-report] ${error.message}`); process.exitCode = 1; }
}
