import { createHash } from "node:crypto";
import { listPublishedAnnouncements } from "@/features/announcements/server/service";
import { listEquipment } from "@/features/equipment/server/list";
import { listHeroes } from "@/features/heroes/server/list";
import { getOfficialNews } from "@/features/official-news/server/service";
import { listPublicTournaments, listTournamentLobbyForUser } from "@/features/tournaments/server/list";
import { ResourceScheduler } from "@/features/resource-scheduler/server/scheduler";

function versionOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function createScheduler(): ResourceScheduler {
  const scheduler = new ResourceScheduler();
  scheduler.registerResource({
    name: "home.announcements",
    scope: "public",
    maxAgeMs: 60_000,
    idleTtlMs: 30_000,
    async loader() {
      const data = await listPublishedAnnouncements(true);
      return { data, version: versionOf(data) };
    },
  });
  scheduler.registerResource({
    name: "home.public-tournaments",
    scope: "public",
    maxAgeMs: 15_000,
    idleTtlMs: 30_000,
    async loader() {
      const data = await listPublicTournaments(6);
      return { data, version: versionOf(data) };
    },
  });
  scheduler.registerResource({
    name: "home.official-news",
    scope: "public",
    maxAgeMs: 60_000,
    idleTtlMs: 5 * 60 * 1000,
    async loader() {
      const result = await getOfficialNews();
      return { data: result.items, version: String(result.timestamp) };
    },
  });
  scheduler.registerResource({
    name: "tournaments.lobby",
    scope: "user",
    maxAgeMs: 10_000,
    idleTtlMs: 10_000,
    async loader({ userId }) {
      if (userId === null) throw new Error("赛事大厅需要登录");
      const data = await listTournamentLobbyForUser(userId);
      return { data, version: versionOf(data) };
    },
  });
  scheduler.registerResource({
    name: "heroes.list",
    scope: "public",
    maxAgeMs: 60_000,
    idleTtlMs: 2 * 60 * 1000,
    async loader() {
      const data = await listHeroes();
      return { data, version: versionOf(data) };
    },
  });
  scheduler.registerResource({
    name: "equipment.list",
    scope: "public",
    maxAgeMs: 60_000,
    idleTtlMs: 2 * 60 * 1000,
    async loader() {
      const data = await listEquipment();
      return { data, version: versionOf(data) };
    },
  });
  scheduler.registerResource({
    name: "monitor.realtime",
    scope: "user",
    maxAgeMs: 30_000,
    idleTtlMs: 0,
    async loader() {
      return { data: { enabled: true }, version: "1" };
    },
  });

  scheduler.registerPage({
    name: "home",
    requiresAuth: false,
    resources: [
      { name: "home.announcements", mode: "immediate" },
      { name: "home.public-tournaments", mode: "immediate" },
      { name: "home.official-news", mode: "deferred" },
    ],
  });
  scheduler.registerPage({
    name: "tournaments",
    requiresAuth: true,
    resources: [{ name: "tournaments.lobby", mode: "immediate" }],
  });
  scheduler.registerPage({
    name: "heroes",
    requiresAuth: false,
    resources: [{ name: "heroes.list", mode: "immediate" }],
  });
  scheduler.registerPage({
    name: "equipment",
    requiresAuth: false,
    resources: [{ name: "equipment.list", mode: "immediate" }],
  });
  scheduler.registerPage({
    name: "monitor",
    requiresAuth: true,
    resources: [{ name: "monitor.realtime", mode: "immediate" }],
  });
  return scheduler;
}

const globalScheduler = globalThis as unknown as { resourceScheduler?: ResourceScheduler };
export const resourceScheduler = globalScheduler.resourceScheduler ?? createScheduler();
globalScheduler.resourceScheduler = resourceScheduler;
