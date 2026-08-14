import {
  readLatestMonitorSnapshot,
  type MonitorSnapshot,
} from "@/features/monitor/cycle";

type Client = ReadableStreamDefaultController<Uint8Array>;

interface HeroEventHub {
  clients: Set<Client>;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  pollInFlight: boolean;
  lastSnapshot: MonitorSnapshot | null;
  lastWarningAt: number;
}

const globalForHeroEvents = globalThis as unknown as { heroEventHub?: HeroEventHub };
const hub = globalForHeroEvents.heroEventHub ?? {
  clients: new Set<Client>(),
  heartbeatTimer: null,
  pollTimer: null,
  pollInFlight: false,
  lastSnapshot: null,
  lastWarningAt: 0,
};
globalForHeroEvents.heroEventHub = hub;

const encoder = new TextEncoder();
export const MAX_HERO_EVENT_CLIENTS = 100;

function stopHubIfIdle(): void {
  if (hub.clients.size > 0) return;
  if (hub.heartbeatTimer) clearInterval(hub.heartbeatTimer);
  if (hub.pollTimer) clearInterval(hub.pollTimer);
  hub.heartbeatTimer = null;
  hub.pollTimer = null;
}

function sendRaw(client: Client, payload: string): boolean {
  if (client.desiredSize !== null && client.desiredSize <= 0) {
    hub.clients.delete(client);
    try { client.close(); } catch { /* connection already closed */ }
    stopHubIfIdle();
    return false;
  }
  try {
    client.enqueue(encoder.encode(payload));
    return true;
  } catch {
    hub.clients.delete(client);
    stopHubIfIdle();
    return false;
  }
}

function sendEvent(client: Client, data: unknown): boolean {
  return sendRaw(client, `data: ${JSON.stringify(data)}\n\n`);
}

function serializeEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function broadcast(data: unknown): void {
  for (const client of [...hub.clients]) sendEvent(client, data);
}

function sendSnapshot(client: Client, snapshot: MonitorSnapshot): void {
  const messages: unknown[] = [
    { type: "monitor-check", cycle: snapshot.sequence, results: snapshot.results },
  ];
  const changedModules = snapshot.results
    .filter((result) => result.ok && result.changed)
    .map((result) => result.module);
  if (changedModules.length > 0) messages.push({ type: "scrape-triggered", modules: changedModules });
  if (snapshot.events.length > 0) messages.push({ type: "scrape-result", events: snapshot.events });
  const heroUpdates = snapshot.events.filter((event) =>
    ["heroes", "skins", "skills"].includes(event.module) && event.action === "scrape-done");
  if (heroUpdates.length > 0) {
    messages.push({
      type: "heroes-updated",
      changes: heroUpdates.map((event) => ({ heroId: 0, name: event.detail })),
    });
  }
  sendRaw(client, messages.map(serializeEvent).join(""));
}

async function pollSnapshot(): Promise<void> {
  if (hub.pollInFlight || hub.clients.size === 0) return;
  hub.pollInFlight = true;
  try {
    const snapshot = await readLatestMonitorSnapshot();
    if (!snapshot || snapshot.sequence === hub.lastSnapshot?.sequence) return;
    hub.lastSnapshot = snapshot;
    for (const client of [...hub.clients]) sendSnapshot(client, snapshot);
  } catch (error) {
    const now = Date.now();
    if (now - hub.lastWarningAt >= 60_000) {
      hub.lastWarningAt = now;
      console.warn("[hero-events] monitor snapshot poll failed", error instanceof Error ? error.message : error);
    }
  } finally {
    hub.pollInFlight = false;
  }
}

function startHub(): void {
  if (!hub.heartbeatTimer) {
    hub.heartbeatTimer = setInterval(() => {
      for (const client of [...hub.clients]) sendRaw(client, ": heartbeat\n\n");
    }, 25_000);
  }
  if (!hub.pollTimer) hub.pollTimer = setInterval(() => void pollSnapshot(), 15_000);
  void pollSnapshot();
}

export function addClient(controller: Client): void {
  hub.clients.add(controller);
  sendEvent(controller, { type: "connected" });
  if (hub.lastSnapshot) sendSnapshot(controller, hub.lastSnapshot);
  startHub();
}

export function getHeroEventClientCount(): number {
  return hub.clients.size;
}

export function removeClient(controller: Client): void {
  hub.clients.delete(controller);
  stopHubIfIdle();
}

export function broadcastHeroUpdate(changes: { heroId: number; name?: string }[]): void {
  broadcast({ type: "heroes-updated", changes });
}
