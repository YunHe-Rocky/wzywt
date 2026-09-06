import assert from "node:assert/strict";
import type { Player } from "@/core/team-balancing";
import { runTeamSplit } from "@/features/tournaments/server/team-balancing-pool";

const roles = ["top", "jungle", "mid", "adc", "support"] as const;
const players: Player[] = roles.flatMap((role, roleIndex) => [
  {
    userId: roleIndex * 2 + 1,
    rolePreferences: roles.map((roleType, preferenceIndex) => ({
      roleType,
      preferenceRank: roleType === role ? 1 : preferenceIndex + 2,
      roleRank: 6,
      peakScore: 1_800,
      peakRank: 7,
    })),
    heroPowers: Object.fromEntries(roles.map((roleType) => [roleType, [5_000 + roleIndex * 200]])),
  },
  {
    userId: roleIndex * 2 + 2,
    rolePreferences: roles.map((roleType, preferenceIndex) => ({
      roleType,
      preferenceRank: roleType === role ? 1 : preferenceIndex + 2,
      roleRank: 7,
      peakScore: 1_900,
      peakRank: 8,
    })),
    heroPowers: Object.fromEntries(roles.map((roleType) => [roleType, [8_000 - roleIndex * 200]])),
  },
]);

async function main(): Promise<void> {
  let timerFired = false;
  const resultPromise = runTeamSplit(players);
  await new Promise<void>((resolveTimer) => setTimeout(() => {
    timerFired = true;
    resolveTimer();
  }, 0));
  assert.equal(timerFired, true, "the request event loop must remain available while the worker computes");
  const result = await resultPromise;
  assert.ok(result);
  assert.equal(result.teamRed.length, 5);
  assert.equal(result.teamBlue.length, 5);
  assert.equal(new Set([...result.teamRed, ...result.teamBlue].map(({ userId }) => userId)).size, 10);
  assert.equal(await runTeamSplit(players.slice(0, 9)), null);
  console.log("Bounded team-balancing worker tests passed.");
}

void main();
