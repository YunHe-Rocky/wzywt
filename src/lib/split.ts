interface Player {
  userId: number;
  rolePreferences: { roleType: string; preferenceRank: number; roleRank: number; peakScore: number; peakRank: number }[];
  heroPowers: Record<string, number[]>;
}

interface SplitResult {
  teamRed: { userId: number; roleType: string }[];
  teamBlue: { userId: number; roleType: string }[];
  score: number;
  strengthDiff: number;
  preferenceScore: number;
  rankDiff: number;
  rankCoverage: number;
}

const ROLES = ["top", "jungle", "mid", "adc", "support"];

// Scoring weights
const W_PREF = 500;
const W_COVER = 50;
const W_STRENGTH = 15;
const W_RANK = 30;
const W_FAIRNESS = 200;

// Compute per-player combat strength for a given role (max ~1000)
function computeStrength(player: Player, roleType: string): number {
  const pref = player.rolePreferences.find((p) => p.roleType === roleType);
  const powers = player.heroPowers[roleType] || [];

  // Hero power: top 3 average / 30 (max ~400, hero power cap ~12000)
  const top3 = powers.sort((a, b) => b - a).slice(0, 3);
  const heroAvg = top3.length > 0 ? top3.reduce((s, v) => s + v, 0) / top3.length : 0;
  const heroComponent = heroAvg / 30;

  // Peak score: / 7 (max ~357, peak cap 2500)
  const peakComponent = (pref?.peakScore || 0) / 7;

  // Current rank: × 15 (max 135)
  const rankComponent = (pref?.roleRank || 0) * 15;

  // Historical peak rank bonus: × 10 (max 90)
  const peakRankBonus = (pref?.peakRank || 0) * 10;

  return heroComponent + peakComponent + rankComponent + peakRankBonus;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

interface RoleAssignment {
  assignments: { userId: number; roleType: string }[];
}

function generateRoleAssignments(players: Player[]): RoleAssignment[] {
  const n = players.length;
  const perRole = Math.floor(n / 5);
  const remainder = n % 5;
  const results: RoleAssignment[] = [];
  const playerIds = players.map((p) => p.userId);

  function assign(remaining: number[], roleIndex: number, current: { userId: number; roleType: string }[]): void {
    if (roleIndex === 5) {
      if (remaining.length === 0) results.push({ assignments: current });
      return;
    }
    const needed = roleIndex < remainder ? perRole + 1 : perRole;
    if (remaining.length < needed) return;
    const combos = combinations(remaining, needed);
    for (const combo of combos) {
      const nextRemaining = remaining.filter((id) => !combo.includes(id));
      const newAssignments = [...current, ...combo.map((userId) => ({ userId, roleType: ROLES[roleIndex] }))];
      assign(nextRemaining, roleIndex + 1, newAssignments);
    }
  }

  assign(playerIds, 0, []);
  return results;
}

function evaluateTeamSplit(
  roleGroups: Map<string, Player[]>,
  players: Player[]
): { teamRed: { userId: number; roleType: string }[]; teamBlue: { userId: number; roleType: string }[]; strengthDiff: number } {
  const playerMap = new Map(players.map((p) => [p.userId, p]));
  let bestSplit: { teamRed: any[]; teamBlue: any[]; strengthDiff: number } = {
    teamRed: [], teamBlue: [], strengthDiff: Infinity,
  };

  for (let mask = 0; mask < 32; mask++) {
    const red: { userId: number; roleType: string }[] = [];
    const blue: { userId: number; roleType: string }[] = [];
    let redStrength = 0, blueStrength = 0;

    for (let ri = 0; ri < 5; ri++) {
      const role = ROLES[ri];
      const group = roleGroups.get(role) || [];
      if (group.length === 0) continue;

      const playerA = group[0];
      const playerB = group.length > 1 ? group[1] : group[0];
      const assignRedFirst = (mask >> ri) & 1;

      const strA = computeStrength(playerA, role);
      const strB = computeStrength(playerB, role);

      if (assignRedFirst) {
        red.push({ userId: playerA.userId, roleType: role });
        redStrength += strA;
        if (group.length > 1) {
          blue.push({ userId: playerB.userId, roleType: role });
          blueStrength += strB;
        }
      } else {
        if (group.length > 1) {
          red.push({ userId: playerB.userId, roleType: role });
          redStrength += strB;
        }
        blue.push({ userId: playerA.userId, roleType: role });
        blueStrength += strA;
      }
    }

    const diff = Math.abs(redStrength - blueStrength);
    if (diff < bestSplit.strengthDiff) {
      bestSplit = { teamRed: red, teamBlue: blue, strengthDiff: diff };
    }
  }

  return bestSplit;
}

// ── Scoring helpers ──────────────────────────────────────────────────

function rankCoverage(
  assignments: { userId: number; roleType: string }[],
  players: Player[]
): number {
  const playerMap = new Map(players.map((p) => [p.userId, p]));
  let coverage = 0;
  for (const a of assignments) {
    const p = playerMap.get(a.userId);
    const pref = p?.rolePreferences.find((pr) => pr.roleType === a.roleType);
    if (pref && pref.roleRank > 0) coverage++;
  }
  return coverage;
}

function rankDiff(
  teamRed: { userId: number; roleType: string }[],
  teamBlue: { userId: number; roleType: string }[],
  players: Player[]
): number {
  const playerMap = new Map(players.map((p) => [p.userId, p]));
  let redSum = 0, blueSum = 0;
  for (const a of teamRed) {
    const p = playerMap.get(a.userId);
    redSum += p?.rolePreferences.find((pr) => pr.roleType === a.roleType)?.roleRank || 0;
  }
  for (const a of teamBlue) {
    const p = playerMap.get(a.userId);
    blueSum += p?.rolePreferences.find((pr) => pr.roleType === a.roleType)?.roleRank || 0;
  }
  return Math.abs(redSum - blueSum);
}

function preferenceScore(
  assignments: { userId: number; roleType: string }[],
  players: Player[]
): { score: number; penalty: number } {
  const playerMap = new Map(players.map((p) => [p.userId, p]));
  let total = 0;
  let penalty = 0;
  for (const a of assignments) {
    const p = playerMap.get(a.userId);
    if (!p) continue;
    const pref = p.rolePreferences.find((pr) => pr.roleType === a.roleType);
    if (!pref) continue;

    // Base: rank 1 = 5pts, rank 5 = 1pt
    total += 6 - pref.preferenceRank;

    // Main role bonus: +3 if assigned to player's strongest hero power role
    const powers = p.heroPowers[a.roleType] || [];
    const rolePower = powers.length > 0
      ? powers.reduce((s, v) => s + v, 0) / powers.length
      : 0;
    let isMainRole = true;
    for (const [otherRole, otherPowers] of Object.entries(p.heroPowers)) {
      if (otherRole === a.roleType) continue;
      const otherAvg = otherPowers.length > 0
        ? otherPowers.reduce((s, v) => s + v, 0) / otherPowers.length
        : 0;
      if (otherAvg > rolePower) { isMainRole = false; break; }
    }
    if (isMainRole && rolePower > 0) total += 3;

    // Fairness penalty: penalize 4th/5th choice + low proficiency
    if (pref.preferenceRank === 4) penalty += 1;
    if (pref.preferenceRank === 5) penalty += 3;

    // Proficiency penalty: weighted by player strength, so moving a strong
    // player off-role hurts more than moving a weak player off-role
    if (rolePower === 0 && powers.length === 0) {
      const hasAnyHeroes = Object.values(p.heroPowers).some(arr => arr.length > 0);
      if (hasAnyHeroes) {
        const peak = (pref?.peakScore || 0) / 7;
        const rank = (pref?.roleRank || 0) * 15;
        const peakR = (pref?.peakRank || 0) * 10;
        const offRoleStrength = peak + rank + peakR;
        penalty += Math.max(1, Math.round(offRoleStrength / 200));
      }
    }
  }
  return { score: total, penalty };
}

// ── Main entry ──────────────────────────────────────────────────────

export function splitTeams(players: Player[]): SplitResult | null {
  if (players.length !== 10) return null;

  const selected = players;

  const roleAssignments = generateRoleAssignments(selected);
  let bestResult: SplitResult | null = null;
  let bestScore = -Infinity;
  const playerMap = new Map(selected.map((p) => [p.userId, p]));

  for (const ra of roleAssignments) {
    const roleGroups = new Map<string, Player[]>();
    for (const a of ra.assignments) {
      const p = playerMap.get(a.userId)!;
      if (!roleGroups.has(a.roleType)) roleGroups.set(a.roleType, []);
      roleGroups.get(a.roleType)!.push(p);
    }

    const split = evaluateTeamSplit(roleGroups, selected);
    const allAssignments = [...split.teamRed, ...split.teamBlue];
    const coverage = rankCoverage(allAssignments, players);
    const rDiff = rankDiff(split.teamRed, split.teamBlue, players);
    const { score: pref, penalty } = preferenceScore(allAssignments, players);

    const score = pref * W_PREF + coverage * W_COVER + (-split.strengthDiff) * W_STRENGTH + (-rDiff) * W_RANK + (-penalty) * W_FAIRNESS;

    if (score > bestScore) {
      bestScore = score;
      bestResult = {
        teamRed: split.teamRed,
        teamBlue: split.teamBlue,
        score,
        strengthDiff: split.strengthDiff,
        preferenceScore: pref,
        rankDiff: rDiff,
        rankCoverage: coverage,
      };
    }
  }

  return bestResult;
}
