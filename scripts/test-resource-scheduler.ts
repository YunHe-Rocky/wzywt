import assert from "node:assert/strict";
import { ResourceScheduler } from "@/features/resource-scheduler/server/scheduler";
import { ResourceSchedulerError } from "@/features/resource-scheduler/model";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function testSingleFlightAndLifecycle(): Promise<void> {
  let now = 1_000;
  let sequence = 0;
  let loads = 0;
  let disposals = 0;
  const firstLoad = deferred<{ data: string; version: string }>();
  const scheduler = new ResourceScheduler({
    autoSweep: false,
    now: () => now,
    createId: () => `lease-${++sequence}`,
    leaseTtlMs: 90,
  });
  scheduler.registerResource({
    name: "public.data",
    scope: "public",
    maxAgeMs: 20,
    idleTtlMs: 30,
    loader: async () => {
      loads++;
      return loads === 1 ? firstLoad.promise : { data: `value-${loads}`, version: String(loads) };
    },
    dispose: () => { disposals++; },
  });
  scheduler.registerPage({
    name: "public-page",
    requiresAuth: false,
    resources: [{ name: "public.data", mode: "immediate" }],
  });

  const userA = scheduler.acquirePage("public-page", 1);
  const userB = scheduler.acquirePage("public-page", 2);
  for (let tick = 0; tick < 4 && loads === 0; tick++) await Promise.resolve();
  assert.equal(loads, 1, "concurrent public loads must collapse into one loader");
  firstLoad.resolve({ data: "value-1", version: "1" });
  const [leaseA, leaseB] = await Promise.all([userA, userB]);
  assert.equal(leaseA.immediate["public.data"].data, "value-1");
  assert.equal(leaseB.immediate["public.data"].data, "value-1");
  let snapshot = scheduler.snapshots().resources.find((resource) => resource.name === "public.data")!;
  assert.equal(snapshot.state, "HOT");
  assert.equal(snapshot.leases, 2);
  assert.equal(snapshot.sharedLoads, 1);

  await scheduler.releaseLease(leaseA.lease.id);
  assert.equal(scheduler.snapshots().resources[0].state, "HOT");
  await scheduler.releaseLease(leaseB.lease.id);
  assert.equal(scheduler.snapshots().resources[0].state, "IDLE");
  now += 31;
  await scheduler.sweep();
  snapshot = scheduler.snapshots().resources[0];
  assert.equal(snapshot.state, "EVICTED");
  assert.equal(snapshot.evictions, 1);
  assert.equal(disposals, 1);

  const warmAgain = await scheduler.acquirePage("public-page", null);
  assert.equal(warmAgain.immediate["public.data"].data, "value-2");
  assert.equal(loads, 2);
  scheduler.close();
}

async function testLeaseRenewalAndExpiry(): Promise<void> {
  let now = 10_000;
  const scheduler = new ResourceScheduler({ autoSweep: false, now: () => now, leaseTtlMs: 90 });
  scheduler.registerResource({
    name: "realtime",
    scope: "public",
    maxAgeMs: 100,
    idleTtlMs: 0,
    loader: async () => ({ data: true, version: "1" }),
  });
  scheduler.registerPage({ name: "live", requiresAuth: false, resources: [{ name: "realtime", mode: "immediate" }] });
  const result = await scheduler.acquirePage("live", null);
  now += 80;
  scheduler.renewLease(result.lease.id);
  now += 20;
  await scheduler.sweep();
  assert.equal(scheduler.snapshots().leases.length, 1, "renewed lease must remain active");
  now += 71;
  await scheduler.sweep();
  assert.equal(scheduler.snapshots().leases.length, 0, "abandoned lease must expire");
  assert.equal(scheduler.snapshots().resources[0].state, "EVICTED");
  scheduler.close();
}

async function testUserIsolationAndAccessControl(): Promise<void> {
  let loads = 0;
  const scheduler = new ResourceScheduler({ autoSweep: false });
  scheduler.registerResource({
    name: "private.lobby",
    scope: "user",
    maxAgeMs: 1_000,
    idleTtlMs: 0,
    loader: async ({ userId }) => ({ data: { userId }, version: String(++loads) }),
  });
  scheduler.registerResource({
    name: "interaction.admin",
    scope: "user",
    maxAgeMs: 1_000,
    idleTtlMs: 0,
    loader: async ({ userId }) => ({ data: { userId }, version: "1" }),
  });
  scheduler.registerPage({
    name: "lobby",
    requiresAuth: true,
    resources: [
      { name: "private.lobby", mode: "immediate" },
      { name: "interaction.admin", mode: "interaction" },
    ],
  });
  const first = await scheduler.acquirePage("lobby", 7);
  const second = await scheduler.acquirePage("lobby", 7);
  const third = await scheduler.acquirePage("lobby", 8);
  assert.equal(loads, 2, "same user may reuse private cache, different users may not");
  assert.deepEqual(first.immediate["private.lobby"].data, { userId: 7 });
  assert.deepEqual(second.immediate["private.lobby"].data, { userId: 7 });
  assert.deepEqual(third.immediate["private.lobby"].data, { userId: 8 });
  await assert.rejects(() => scheduler.acquirePage("lobby", null), (error) =>
    error instanceof ResourceSchedulerError && error.code === "AUTH_REQUIRED");
  await assert.rejects(() => scheduler.getResource(first.lease.id, "not-on-page"), (error) =>
    error instanceof ResourceSchedulerError && error.code === "RESOURCE_NOT_ALLOWED");
  scheduler.close();
}

async function testStaleWhileRevalidate(): Promise<void> {
  let now = 1;
  let loads = 0;
  const scheduler = new ResourceScheduler({ autoSweep: false, now: () => now });
  scheduler.registerResource({
    name: "versioned",
    scope: "public",
    maxAgeMs: 10,
    idleTtlMs: 100,
    loader: async () => ({ data: `value-${++loads}`, version: String(loads) }),
  });
  scheduler.registerPage({
    name: "versioned-page",
    requiresAuth: false,
    resources: [{ name: "versioned", mode: "immediate" }],
  });
  const page = await scheduler.acquirePage("versioned-page", null);
  now += 11;
  const stale = await scheduler.getResource(page.lease.id, "versioned");
  assert.equal(stale.data, "value-1", "expired data should be served without blocking");
  await Promise.resolve();
  await Promise.resolve();
  const fresh = await scheduler.getResource(page.lease.id, "versioned");
  assert.equal(fresh.data, "value-2");
  assert.equal(scheduler.snapshots().resources[0].staleHits, 1);
  scheduler.close();
}

async function main(): Promise<void> {
  await testSingleFlightAndLifecycle();
  await testLeaseRenewalAndExpiry();
  await testUserIsolationAndAccessControl();
  await testStaleWhileRevalidate();
  console.log("Resource scheduler tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
