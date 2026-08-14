import { createServer } from "node:http";

const types = ["DATA", "OUTPUT", "SURVIVAL", "DEVELOPMENT", "KDA", "TEAM"];
const metricsFor = (type, index) => ({
  ...(type === "DATA" ? { damageDealt: 1000 + index, damageTaken: 900 + index, gold: 800 + index, participationRate: 0.5 } : {}),
  ...(type === "OUTPUT" ? { damageDealt: 1000 + index, damageConversionRate: 1.2 } : {}),
  ...(type === "SURVIVAL" ? { damageTaken: 900 + index, damageTakenPerDeath: 400 + index } : {}),
  ...(type === "DEVELOPMENT" ? { gold: 800 + index, jungleGold: 100 + index, minionKills: 20 + index } : {}),
  ...(type === "KDA" ? { kills: index + 1, deaths: 1, assists: 2 } : {}),
  ...(type === "TEAM" ? { participationRate: 0.5, controlScore: 3.5, healing: 100 + index, towerDamage: 200 + index } : {}),
});
const pages = types.map((type) => ({
  type,
  players: ["red", "blue"].flatMap((side) => Array.from({ length: 5 }, (_, slotIndex) => {
    const index = (side === "red" ? 0 : 5) + slotIndex;
    return {
      side,
      slot: slotIndex + 1,
      nickname: `${side}-player-${slotIndex + 1}`,
      heroName: `测试英雄${slotIndex + 1}`,
      score: { value: 10 + slotIndex, confidence: 0.99 },
      metrics: Object.fromEntries(Object.entries(metricsFor(type, index)).map(([field, value]) => [field, { value, confidence: 0.98 }])),
    };
  })),
}));

createServer((request, response) => {
  if (request.method !== "POST") {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ready");
    return;
  }
  let received = 0;
  request.on("data", (chunk) => { received += chunk.length; });
  request.on("end", () => {
    if (received === 0) {
      response.writeHead(400).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ pages }));
  });
}).listen(8012, "127.0.0.1", () => console.log("mock OCR ready on 8012"));
