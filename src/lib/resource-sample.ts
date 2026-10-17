import { readFileSync } from "node:fs";
import { freemem, totalmem, availableParallelism } from "node:os";

export interface MemoryCapacity { total: number; available: number; used: number; source: string; hostTotal: number; hostAvailable: number }
const MiB = 1024 * 1024;

/** Respect parent cgroups as well as the container leaf; support v1 and v2. */
export function memoryCapacity(read = (path: string) => readFileSync(path, "utf8")): MemoryCapacity {
  let total = totalmem();
  let available = freemem();
  let source = "host";
  try {
    const match = /^MemAvailable:\s+(\d+) kB$/m.exec(read("/proc/meminfo"));
    if (match) available = Number(match[1]) * 1024;
  } catch { /* Windows/macOS use OS availability. */ }
  available = Math.min(total, Math.max(0, available));
  const hostTotal = total;
  const hostAvailable = available;
  try {
    const cgroup = read("/proc/self/cgroup");
    const v2 = /^0::(.*)$/m.exec(cgroup);
    const v1 = /^\d+:[^\n]*\bmemory\b[^:]*:(.*)$/m.exec(cgroup);
    const roots = v2 ? ["/sys/fs/cgroup", `/sys/fs/cgroup${v2[1]}`] : v1
      ? ["/sys/fs/cgroup/memory", `/sys/fs/cgroup/memory${v1[1]}`] : ["/sys/fs/cgroup"];
    const paths = new Set<string>();
    for (let root of roots) {
      root = root.replace(/\/+$/, "");
      while (root.startsWith("/sys/fs/cgroup")) {
        paths.add(root);
        if (root === "/sys/fs/cgroup") break;
        root = root.slice(0, root.lastIndexOf("/"));
      }
    }
    for (const path of paths) {
      try {
        const limit = Number(read(`${path}/${v1 ? "memory.limit_in_bytes" : "memory.max"}`).trim());
        const current = Number(read(`${path}/${v1 ? "memory.usage_in_bytes" : "memory.current"}`).trim());
        if (Number.isFinite(limit) && limit >= 32 * MiB && limit <= total && Number.isFinite(current)) {
          let reclaimable = 0;
          try {
            const stats = read(`${path}/memory.stat`);
            reclaimable = Number(new RegExp(`^${v1 ? "total_inactive_file" : "inactive_file"} (\\d+)$`, "m").exec(stats)?.[1] || 0);
          } catch { /* Conservative fallback when memory.stat is unavailable. */ }
          total = Math.min(total, limit);
          available = Math.min(available, Math.max(0, limit - Math.max(0, current - reclaimable)));
          source = v1 ? "cgroup-v1" : "cgroup-v2";
        }
      } catch { /* Nonexistent ancestor/unsupported cgroup controller. */ }
    }
  } catch { /* Native PM2 or a platform without cgroups. */ }
  return { total, available, used: Math.max(0, total - available), source, hostTotal, hostAvailable };
}

export function effectiveCpuCount(read = (path: string) => readFileSync(path, "utf8")): number {
  let cpus = availableParallelism();
  try {
    const [quota, period] = read("/sys/fs/cgroup/cpu.max").trim().split(/\s+/).map(Number);
    if (Number.isFinite(quota) && quota > 0 && period > 0) cpus = Math.min(cpus, quota / period);
  } catch { /* CPU quota unavailable. */ }
  return Math.max(0.1, cpus);
}
