import { ROLES } from "@/core/game/constants";
import { compareCandidate, comparePreferenceSummary, createMetricMatrix, createPreferenceSummary } from "./metrics";
import type {
  Assignment, BalanceScore, Player, PlayerRoleMetric, PreferenceSummary,
  SplitResult, TeamCandidate, TeamMember,
} from "./types";

const ROLE_COUNT = ROLES.length;
const PLAYERS_PER_ROLE = 2;

function createCandidate(
  rolePairs: readonly (readonly number[])[],
  metrics: PlayerRoleMetric[][],
  players: readonly Player[],
  preference: PreferenceSummary,
  mask: number,
): TeamCandidate {
  const assignments: Assignment[] = [];
  let redStrength = 0;
  let blueStrength = 0;
  let redRank = 0;
  let blueRank = 0;
  let laneStrengthDiffSum = 0;
  let maxLaneStrengthDiff = 0;
  let rankCoverage = 0;

  for (let roleIndex = 0; roleIndex < ROLE_COUNT; roleIndex++) {
    const role = ROLES[roleIndex];
    const [first, second] = rolePairs[roleIndex];
    // 固定第一路朝向，安全去除红蓝镜像；其余四路由 mask 决定。
    const swap = roleIndex > 0 && ((mask >> (roleIndex - 1)) & 1) === 1;
    const redIndex = swap ? second : first;
    const blueIndex = swap ? first : second;
    const redMetric = metrics[redIndex][roleIndex];
    const blueMetric = metrics[blueIndex][roleIndex];

    assignments.push(
      { playerIndex: redIndex, userId: players[redIndex].userId, role, team: "red" },
      { playerIndex: blueIndex, userId: players[blueIndex].userId, role, team: "blue" },
    );
    redStrength += redMetric.strength;
    blueStrength += blueMetric.strength;
    redRank += redMetric.roleRank;
    blueRank += blueMetric.roleRank;
    rankCoverage += Number(redMetric.hasKnownRank) + Number(blueMetric.hasKnownRank);
    const laneDiff = Math.abs(redMetric.strength - blueMetric.strength);
    laneStrengthDiffSum += laneDiff;
    maxLaneStrengthDiff = Math.max(maxLaneStrengthDiff, laneDiff);
  }

  const balance: BalanceScore = {
    totalStrengthDiff: Math.abs(redStrength - blueStrength),
    laneStrengthDiffSum,
    rankDiff: Math.abs(redRank - blueRank),
    maxLaneStrengthDiff,
  };
  const signature = assignments.map(({ userId, role, team }) => `${userId}:${role}:${team}`).join("|");
  return { assignments, preference, balance, redStrength, blueStrength, rankCoverage, signature };
}

function toTeamMember(assignment: Assignment, metrics: PlayerRoleMetric[][]): TeamMember {
  const roleIndex = ROLES.indexOf(assignment.role);
  return {
    userId: assignment.userId,
    roleType: assignment.role,
    assignedRole: assignment.role,
    preferenceRank: metrics[assignment.playerIndex][roleIndex].preferenceRank,
  };
}

function toResult(candidate: TeamCandidate, metrics: PlayerRoleMetric[][]): SplitResult {
  const teamRed = candidate.assignments.filter(({ team }) => team === "red").map((item) => toTeamMember(item, metrics));
  const teamBlue = candidate.assignments.filter(({ team }) => team === "blue").map((item) => toTeamMember(item, metrics));
  const preferenceScore = candidate.preference.first * 5
    + candidate.preference.second * 4
    + candidate.preference.third * 3
    + candidate.preference.fourth * 2
    + candidate.preference.fifth;

  return {
    version: 2,
    teamRed,
    teamBlue,
    preferenceSummary: candidate.preference,
    balanceSummary: { ...candidate.balance, redStrength: candidate.redStrength, blueStrength: candidate.blueStrength },
    score: preferenceScore,
    strengthDiff: candidate.balance.totalStrengthDiff,
    preferenceScore,
    rankDiff: candidate.balance.rankDiff,
    rankCoverage: candidate.rankCoverage,
  };
}

export function splitTeams(input: Player[]): SplitResult | null {
  if (input.length !== 10) return null;
  if (new Set(input.map(({ userId }) => userId)).size !== input.length) return null;

  // 稳定排序只作用于浅拷贝，不修改调用方数组或嵌套数据。
  const players = [...input].sort((a, b) => a.userId - b.userId);
  const metrics = createMetricMatrix(players, ROLES);
  const roleByPlayer = new Int8Array(players.length).fill(-1);
  const roleCounts = new Int8Array(ROLE_COUNT);
  const preferenceCounts = new Int8Array(6);
  let best: TeamCandidate | null = null;

  function visit(playerIndex: number): void {
    if (playerIndex === players.length) {
      const preference = createPreferenceSummary(preferenceCounts);
      if (best && comparePreferenceSummary(preference, best.preference) > 0) return;

      const rolePairs = Array.from({ length: ROLE_COUNT }, () => [] as number[]);
      for (let index = 0; index < roleByPlayer.length; index++) rolePairs[roleByPlayer[index]].push(index);

      for (let mask = 0; mask < 16; mask++) {
        const candidate = createCandidate(rolePairs, metrics, players, preference, mask);
        if (!best || compareCandidate(candidate, best) < 0) best = candidate;
      }
      return;
    }

    for (let roleIndex = 0; roleIndex < ROLE_COUNT; roleIndex++) {
      if (roleCounts[roleIndex] >= PLAYERS_PER_ROLE) continue;
      roleByPlayer[playerIndex] = roleIndex;
      roleCounts[roleIndex]++;
      const preferenceIndex = metrics[playerIndex][roleIndex].preferenceRank - 1;
      preferenceCounts[preferenceIndex]++;
      visit(playerIndex + 1);
      preferenceCounts[preferenceIndex]--;
      roleCounts[roleIndex]--;
    }
  }

  visit(0);
  return best ? toResult(best, metrics) : null;
}
