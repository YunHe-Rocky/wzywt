// Shared SSE broadcast for hero data changes
const clients: ReadableStreamController<Uint8Array>[] = [];

export function addClient(controller: ReadableStreamController<Uint8Array>) {
  clients.push(controller);
}

export function removeClient(controller: ReadableStreamController<Uint8Array>) {
  const idx = clients.indexOf(controller);
  if (idx >= 0) clients.splice(idx, 1);
}

export function broadcastHeroUpdate(changes: { heroId: number; name?: string }[]) {
  const msg = `data: ${JSON.stringify({ type: "heroes-updated", changes })}\n\n`;
  for (let i = clients.length - 1; i >= 0; i--) {
    try { clients[i].enqueue(new TextEncoder().encode(msg)); } catch { clients.splice(i, 1); }
  }
}
