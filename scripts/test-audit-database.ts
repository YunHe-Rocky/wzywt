import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { serializable } from "@/lib/serializable";
import { addHeroPower } from "@/features/profile/server/preferences";
import { attachMediaReservation, consumeMediaReservation, processExpiredMediaReservations, reserveMediaUpload } from "@/features/media/server/quota";
import { getMediaStorage } from "@/lib/storage";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "mysql://invalid/");
  if (process.env.ALLOW_INTEGRATION_TEST_DATABASE !== "1" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/_(ci|test)$/.test(url.pathname)) throw new Error("Audit database regression requires an explicitly approved loopback _ci/_test database");
  assert.equal(await prisma.mediaUploadReservation.count(), 0, "Use an isolated database without another run's pending reservations");
  const user = await prisma.user.create({ data: { username: `audit_${randomUUID().slice(0, 16)}`, passwordHash: "test-only" } });
  const heroIds: number[] = [];
  const original = Object.fromEntries(["MEDIA_USER_DAILY_QUOTA_BYTES", "MEDIA_USER_STORED_QUOTA_BYTES", "MEDIA_GLOBAL_STORED_QUOTA_BYTES", "MEDIA_MIN_FREE_BYTES"].map(key => [key, process.env[key]]));
  try {
    for (let index = 0; index < 4; index++) {
      const heroId = 1_900_000_000 + randomInt(1_000_000);
      await prisma.hero.create({ data: { heroId, name: `测试英雄${index}`, title: "fixture", roleType: "mid", imageUrl: "/fixture.jpg", skillsJson: "[]" } }); heroIds.push(heroId);
    }
    for (const heroId of heroIds.slice(0, 2)) await addHeroPower(user.id, { roleType: "mid", heroId, heroName: "forged-name", powerScore: 100 });
    const adds = await Promise.allSettled(heroIds.slice(2).map(heroId => addHeroPower(user.id, { roleType: "mid", heroId, powerScore: 100 })));
    assert.equal(adds.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(await prisma.heroPower.count({ where: { userId: user.id, roleType: "mid" } }), 3);
    assert.equal(await prisma.heroPower.count({ where: { userId: user.id, heroName: "forged-name" } }), 0);

    process.env.MEDIA_USER_DAILY_QUOTA_BYTES = "100"; process.env.MEDIA_USER_STORED_QUOTA_BYTES = "1000000";
    process.env.MEDIA_GLOBAL_STORED_QUOTA_BYTES = "10000000"; process.env.MEDIA_MIN_FREE_BYTES = "0";
    const first = await reserveMediaUpload(user.id, "match-screenshot", 60);
    await attachMediaReservation(first.id, user.id, `fixture/${randomUUID()}`, 60);
    const attached = await prisma.mediaUploadReservation.findUniqueOrThrow({ where: { id: first.id } });
    await serializable(tx => consumeMediaReservation(tx, first.id, user.id, attached.storageKey!, 60));
    await assert.rejects(reserveMediaUpload(user.id, "match-screenshot", 60), /配额/);
    assert.equal(await prisma.mediaUploadUsage.count({ where: { userId: user.id } }), 1);
    // Consumption wins: a later cleanup must never delete its file.
    let deleted = 0;
    const storage = getMediaStorage();
    const fakeStorage = { ...storage, save: storage.save.bind(storage), stat: storage.stat.bind(storage), open: storage.open.bind(storage),
      exists: storage.exists.bind(storage), delete: async () => { deleted++; } };
    await processExpiredMediaReservations(fakeStorage, new Date(Date.now() + 60 * 60_000));
    assert.equal(deleted, 0);

    // Cleanup wins: pause file deletion after the database claim and try to consume.
    process.env.MEDIA_USER_DAILY_QUOTA_BYTES = "1000000";
    const expired = await reserveMediaUpload(user.id, "match-screenshot", 20);
    const key = `fixture/${randomUUID()}`;
    await attachMediaReservation(expired.id, user.id, key, 20);
    await prisma.mediaUploadReservation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    let release: () => void = () => {}; let claimed: () => void = () => {};
    const claimedSignal = new Promise<void>(resolve => { claimed = resolve; });
    const deleteBarrier = new Promise<void>(resolve => { release = resolve; });
    const cleanup = processExpiredMediaReservations({ ...fakeStorage, delete: async storageKey => { assert.equal(storageKey, key); claimed(); await deleteBarrier; } });
    await claimedSignal;
    try { await assert.rejects(serializable(tx => consumeMediaReservation(tx, expired.id, user.id, key, 20)), /预留已失效/); }
    finally { release(); await cleanup; }
    assert.equal(await prisma.mediaUploadUsage.count({ where: { id: expired.id } }), 0);
    console.log("MySQL audit regression passed: hero quota/name, immutable upload traffic, and controlled cleanup/consume ownership order");
  } finally {
    await prisma.mediaUploadReservation.deleteMany({ where: { userId: user.id } });
    await prisma.mediaUploadUsage.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.hero.deleteMany({ where: { heroId: { in: heroIds } } });
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
