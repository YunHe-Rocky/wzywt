import { randomUUID } from "node:crypto";

interface LeaseRow { value: string }
interface LeaseTable {
  findUnique(args: { where: { key: string } }): PromiseLike<LeaseRow | null>;
  create(args: { data: { key: string; value: string } }): PromiseLike<unknown>;
  updateMany(args: { where: { key: string; value: string }; data: { value: string } }): PromiseLike<{ count: number }>;
  deleteMany(args: { where: { key: string; value: string } }): PromiseLike<unknown>;
}
const KEY = "runtime:resource:heavy-lease";
const TTL = 30_000;

/** One project-wide heavy job across native processes and Compose one-off jobs. */
export async function acquireResourceLease(table: LeaseTable, parent: AbortSignal) {
  if (parent.aborted) throw parent.reason;
  const previous = await table.findUnique({ where: { key: KEY } });
  if (previous) {
    try { if (JSON.parse(previous.value).expiresAt > Date.now()) return null; }
    catch { /* An incomplete abandoned lease can be replaced using CAS. */ }
  }
  const token = randomUUID();
  let expiresAt = Date.now() + TTL;
  let value = JSON.stringify({ token, expiresAt, pid: process.pid });
  if (previous) {
    const result = await table.updateMany({ where: { key: KEY, value: previous.value }, data: { value } });
    if (!result.count) return null;
  } else {
    try { await table.create({ data: { key: KEY, value } }); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return null;
      throw error;
    }
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", onAbort, { once: true });
  if (parent.aborted) onAbort();
  let renewing = false;
  let renewal: Promise<void> = Promise.resolve();
  const timer = setInterval(() => {
    if (Date.now() >= expiresAt) controller.abort(new Error("RESOURCE_LEASE_EXPIRED"));
    if (renewing || controller.signal.aborted) return;
    renewing = true;
    renewal = (async () => {
      const nextExpiry = Date.now() + TTL;
      const nextValue = JSON.stringify({ token, expiresAt: nextExpiry, pid: process.pid });
      const result = await table.updateMany({ where: { key: KEY, value }, data: { value: nextValue } });
      if (!result.count) controller.abort(new Error("RESOURCE_LEASE_LOST"));
      else { value = nextValue; expiresAt = nextExpiry; }
    })().catch(() => { controller.abort(new Error("RESOURCE_LEASE_RENEWAL_FAILED")); })
      .finally(() => { renewing = false; });
  }, 1_000);
  timer.unref();
  return { signal: controller.signal, assert() {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (Date.now() >= expiresAt) throw new Error("RESOURCE_LEASE_EXPIRED");
  }, async release() {
    clearInterval(timer); parent.removeEventListener("abort", onAbort);
    await renewal;
    await table.deleteMany({ where: { key: KEY, value } });
  } };
}
