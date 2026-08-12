import assert from "node:assert/strict";
import {
  createLocalDateTime,
  formatLocalDateTime,
  getCalendarRows,
  isCalendarDayBefore,
  isCalendarDayInPast,
} from "@/features/calendar";
import {
  createAnnouncementBrief,
  createAnnouncementSlug,
  normalizeAnnouncementDraft,
} from "@/features/announcements/model";
import {
  canViewTournamentMemberIdentity,
  normalizeTournamentDraft,
  parsePositiveInteger,
  resolveRecruitmentStatus,
  TEMPORARY_CLEANUP_STATUSES,
} from "@/features/tournaments/model";
import { shouldDeleteTournament } from "@/features/tournaments/server/lifecycle";
import {
  hasPeakTournamentAccess,
  normalizeGameProfile,
  normalizePeakScore,
  normalizeRolePreferenceSettings,
} from "@/features/profile/model";
import { detectAvatarImageType } from "@/features/profile/server/avatar";
import { calcSkillDamage, selectHeroesForLane } from "@/core/game";
import { resolveAuthState } from "@/features/auth/model";
import { validateCrawlUrl } from "@/lib/anti-bot";
import {
  calculateLanePowerRank,
  formatLanePowerRank,
  normalizeHeroPowerScore,
} from "@/core/game";
import {
  createHeroImageCandidates,
  createHeroSkins,
  mergeHeroCatalog,
} from "@/features/heroes/model";
import {
  compareCandidate,
  comparePreferenceSummary,
  splitTeams,
  type Player,
  type TeamCandidate,
} from "@/core/team-balancing";

const july2026 = getCalendarRows(2026, 6);
assert.equal(july2026[0][3], 1);
assert.equal(july2026.flat().filter((day) => day !== null).length, 31);
assert.equal(
  formatLocalDateTime({ year: 2026, month: 6, day: 24, hour: 8, minute: 5 }),
  "2026-07-24T08:05",
);
assert.equal(isCalendarDayInPast(2026, 6, 23, new Date(2026, 6, 24, 18)), true);
assert.equal(isCalendarDayInPast(2026, 6, 24, new Date(2026, 6, 24, 18)), false);
assert.equal(isCalendarDayBefore(2026, 6, 23, new Date(2026, 6, 24, 18)), true);
assert.equal(
  createLocalDateTime({ year: 2026, month: 6, day: 24, hour: 8, minute: 5 }).getHours(),
  8,
);
assert.throws(
  () => formatLocalDateTime({ year: 2026, month: 12, day: 1, hour: 0, minute: 0 }),
  RangeError,
);

assert.deepEqual(
  normalizeAnnouncementDraft({
    version: " 2.1.0 ",
    title: " 房间体验升级 ",
    content: "## 主要更新\n\n- 支持精确截止时间",
  }),
  {
    version: "2.1.0",
    title: "房间体验升级",
    content: "## 主要更新\n\n- 支持精确截止时间",
  },
);
assert.equal(
  createAnnouncementBrief("## 主要更新\n\n- 支持精确截止时间", "公告"),
  "支持精确截止时间",
);
assert.equal(createAnnouncementSlug("2.1.0", "房间体验升级"), "v2-1-0-房间体验升级");
assert.throws(
  () => normalizeAnnouncementDraft({ version: "", title: "主题", content: "内容" }),
  /版本号不能为空/,
);

const futureDeadline = new Date("2026-07-25T12:00:00+08:00");
const now = new Date("2026-07-24T12:00:00+08:00");
assert.equal(resolveRecruitmentStatus({
  currentStatus: "recruiting",
  playerCount: 10,
  deadline: futureDeadline,
  hasSplitResult: false,
  now,
}), "locked");
const persistedIdentity = {
  id: 1,
  username: "tester",
  role: "user",
  banned: false,
  isTemporary: false,
  sessionVersion: 2,
};
assert.deepEqual(resolveAuthState({ userId: 1, sessionVersion: 2 }, persistedIdentity), {
  ok: true,
  user: { userId: 1, username: "tester", role: "user" },
});
assert.deepEqual(resolveAuthState({ userId: 1, sessionVersion: 1 }, persistedIdentity), {
  ok: false,
  code: "UNAUTHORIZED",
});
assert.deepEqual(resolveAuthState({ userId: 1, sessionVersion: 2 }, { ...persistedIdentity, banned: true }), {
  ok: false,
  code: "BANNED",
});
assert.deepEqual(resolveAuthState({ userId: 1, sessionVersion: 2 }, { ...persistedIdentity, isTemporary: true }), {
  ok: false,
  code: "UNAUTHORIZED",
});
assert.deepEqual(resolveAuthState({}, persistedIdentity), { ok: false, code: "UNAUTHORIZED" });

assert.equal(
  validateCrawlUrl("https://game.gtimg.cn/images/{id}.jpg"),
  "https://game.gtimg.cn/images/{id}.jpg",
);
assert.throws(() => validateCrawlUrl("http://127.0.0.1/admin"), /受信任/);
assert.throws(() => validateCrawlUrl("https://localhost/admin"), /受信任/);
assert.throws(() => validateCrawlUrl("file:///etc/passwd"), /受信任/);

const combatStats = {
  hp: 1_000, mp: 0, atk: 100, ap: 0, extraAtk: 0, extraAp: 0, extraHp: 0,
  def: 0, mdef: 0, atkSpeed: 0, moveSpeed: 0, critRate: 50, cdReduce: 0,
  armorPen: 0, armorPenPct: 0, magicPen: 0, magicPenPct: 0, lifesteal: 0,
};
const combatInput = {
  skill: { type: "physical" as const, base: [100], bonuses: [] },
  stats: combatStats,
  target: { def: 0, mdef: 0, hp: 1_000 },
  critRate: 50,
};
assert.equal(calcSkillDamage({ ...combatInput, rng: () => 0.49 }).isCrit, true);
assert.equal(calcSkillDamage({ ...combatInput, rng: () => 0.5 }).isCrit, false);
assert.equal(parsePositiveInteger("12", "赛事 ID"), 12);
assert.throws(() => parsePositiveInteger("12x", "赛事 ID"), /无效/);
assert.deepEqual(normalizeTournamentDraft({
  name: "  周五内战  ",
  deadline: "2026-07-25T12:00:00+08:00",
  isPublic: true,
  announcement: "  准时参加  ",
}, { now }), {
  name: "周五内战",
  deadline: futureDeadline,
  isPublic: true,
  announcement: "准时参加",
});
assert.throws(() => normalizeTournamentDraft({
  name: "赛事",
  deadline: "not-a-date",
  isPublic: true,
}, { now }), /格式无效/);
assert.throws(() => normalizeTournamentDraft({
  name: "赛事",
  deadline: futureDeadline,
  isPublic: "true",
}, { now }), /boolean/);
assert.equal(canViewTournamentMemberIdentity("owner"), true);
assert.equal(canViewTournamentMemberIdentity("co_owner"), true);
assert.equal(canViewTournamentMemberIdentity("player"), false);
assert.equal(shouldDeleteTournament({ activePlayerCount: 0, ownerCount: 1 }), true);
assert.equal(shouldDeleteTournament({ activePlayerCount: 1, ownerCount: 0 }), true);
assert.equal(shouldDeleteTournament({ activePlayerCount: 1, ownerCount: 1 }), false);
assert.deepEqual(
  normalizeGameProfile({ gameNickname: "  演武堂主 ", gameId: " 123 456 " }),
  { gameNickname: "演武堂主", gameId: "123 456" },
);
assert.throws(
  () => normalizeGameProfile({ gameNickname: "a".repeat(33), gameId: "" }),
  RangeError,
);
assert.equal(hasPeakTournamentAccess(6), false);
assert.equal(hasPeakTournamentAccess(7), true);
assert.equal(hasPeakTournamentAccess(10), true);
assert.equal(normalizePeakScore(6, 2_000), 0);
assert.equal(normalizePeakScore(7, 0), 1_200);
assert.equal(normalizePeakScore(8, 1_199), 1_200);
assert.equal(normalizePeakScore(10, 1_876.9), 1_876);
assert.deepEqual(
  normalizeRolePreferenceSettings([
    { roleType: "top", preferenceRank: 1, roleRank: 5, peakScore: 0, peakRank: 6 },
    { roleType: "mid", preferenceRank: 2, roleRank: 5, peakScore: 1_850, peakRank: 7 },
  ]).map(({ peakRank, peakScore }) => ({ peakRank, peakScore })),
  [
    { peakRank: 7, peakScore: 1_200 },
    { peakRank: 7, peakScore: 1_850 },
  ],
);
assert.deepEqual(
  detectAvatarImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
  { mime: "image/jpeg", extension: "jpg" },
);
assert.deepEqual(
  detectAvatarImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  { mime: "image/png", extension: "png" },
);
assert.equal(detectAvatarImageType(Buffer.from("not-an-image")), null);
assert.deepEqual(TEMPORARY_CLEANUP_STATUSES, ["recruiting", "locked"]);
assert.equal(resolveRecruitmentStatus({
  currentStatus: "locked",
  playerCount: 9,
  deadline: futureDeadline,
  hasSplitResult: false,
  now,
}), "recruiting");
assert.equal(resolveRecruitmentStatus({
  currentStatus: "locked",
  playerCount: 9,
  deadline: new Date("2026-07-23T12:00:00+08:00"),
  hasSplitResult: false,
  now,
}), "locked");

const roles = ["top", "jungle", "mid", "adc", "support"] as const;
function createPlayer(userId: number, preferenceOrder: readonly string[], strength = 6_000): Player {
  return {
    userId,
    rolePreferences: preferenceOrder.map((roleType, index) => ({
      roleType,
      preferenceRank: index + 1,
      roleRank: 6,
      peakScore: 1_800,
      peakRank: 7,
    })),
    heroPowers: Object.fromEntries(roles.map((role) => [role, [role === preferenceOrder[0] ? strength : 3_000]])),
  };
}

const players: Player[] = roles.flatMap((role, roleIndex) => [
  createPlayer(roleIndex * 2 + 1, [role, ...roles.filter((item) => item !== role)], 5_000 + roleIndex * 500),
  createPlayer(roleIndex * 2 + 2, [role, ...roles.filter((item) => item !== role)], 9_000 - roleIndex * 500),
]);
const playersBefore = JSON.stringify(players);
const result = splitTeams(players);
assert.ok(result);
assert.equal(result.version, 2);
assert.equal(result.teamRed.length, 5);
assert.equal(result.teamBlue.length, 5);
const allMembers = [...result.teamRed, ...result.teamBlue];
assert.equal(new Set(allMembers.map(({ userId }) => userId)).size, 10);
for (const role of roles) {
  assert.equal(allMembers.filter(({ roleType }) => roleType === role).length, 2);
  assert.equal(result.teamRed.filter(({ roleType }) => roleType === role).length, 1);
  assert.equal(result.teamBlue.filter(({ roleType }) => roleType === role).length, 1);
}
assert.equal(result.preferenceSummary.first, 10);
assert.equal(JSON.stringify(players), playersBefore);

const fourJunglers = [
  createPlayer(1, ["jungle", "mid", "top", "adc", "support"], 1_000),
  createPlayer(2, ["jungle", "adc", "mid", "support", "top"], 1_100),
  createPlayer(3, ["jungle", "top", "support", "mid", "adc"], 20_000),
  createPlayer(4, ["jungle", "support", "top", "adc", "mid"], 19_000),
  createPlayer(5, ["mid", "top", "adc", "support", "jungle"]),
  createPlayer(6, ["mid", "support", "adc", "top", "jungle"]),
  createPlayer(7, ["adc", "top", "mid", "support", "jungle"]),
  createPlayer(8, ["adc", "support", "mid", "top", "jungle"]),
  createPlayer(9, ["top", "support", "mid", "adc", "jungle"]),
  createPlayer(10, ["support", "top", "mid", "adc", "jungle"]),
];
const jungleResult = splitTeams(fourJunglers);
assert.ok(jungleResult);
assert.deepEqual(
  [...jungleResult.teamRed, ...jungleResult.teamBlue]
    .filter(({ roleType }) => roleType === "jungle")
    .map(({ userId }) => userId)
    .sort((a, b) => a - b),
  [1, 2],
);
assert.deepEqual(jungleResult.preferenceSummary, {
  first: 8, second: 2, third: 0, fourth: 0, fifth: 0, unranked: 0,
});

assert.ok(comparePreferenceSummary(
  { first: 8, second: 0, third: 2, fourth: 0, fifth: 0, unranked: 0 },
  { first: 7, second: 3, third: 0, fourth: 0, fifth: 0, unranked: 0 },
) < 0);
assert.ok(comparePreferenceSummary(
  { first: 8, second: 2, third: 0, fourth: 0, fifth: 0, unranked: 0 },
  { first: 8, second: 1, third: 1, fourth: 0, fifth: 0, unranked: 0 },
) < 0);

function candidate(first: number, totalStrengthDiff: number, signature: string): TeamCandidate {
  return {
    assignments: [],
    preference: { first, second: 10 - first, third: 0, fourth: 0, fifth: 0, unranked: 0 },
    balance: { totalStrengthDiff, laneStrengthDiffSum: totalStrengthDiff, rankDiff: 0, maxLaneStrengthDiff: totalStrengthDiff },
    redStrength: 0,
    blueStrength: 0,
    rankCoverage: 10,
    signature,
  };
}
assert.ok(compareCandidate(candidate(8, 200, "b"), candidate(7, 0, "a")) < 0);
assert.ok(compareCandidate(candidate(8, 10, "b"), candidate(8, 20, "a")) < 0);
assert.ok(compareCandidate(candidate(8, 10, "a"), candidate(8, 10, "b")) < 0);

const deterministic = JSON.stringify(result);
for (let attempt = 0; attempt < 100; attempt++) assert.equal(JSON.stringify(splitTeams(players)), deterministic);

const missingData = players.map((player, index) => index < 2
  ? { userId: player.userId, rolePreferences: [], heroPowers: {} }
  : player);
const missingResult = splitTeams(missingData);
assert.ok(missingResult);
assert.equal(JSON.stringify(missingResult).includes("null"), false);
for (const value of Object.values(missingResult.balanceSummary)) assert.equal(Number.isFinite(value), true);

const midHeroes = selectHeroesForLane([
  { heroId: 3, roleType: "top", secondaryRoleTypes: ["mid"] },
  { heroId: 2, roleType: "mid", secondaryRoleTypes: ["support"] },
  { heroId: 1, roleType: "jungle", secondaryRoleTypes: [] },
  { heroId: 4, roleType: "mid", secondaryRoleTypes: [] },
], "mid");
assert.deepEqual(midHeroes.map((hero) => hero.heroId), [2, 4, 3]);

const mergedCatalog = mergeHeroCatalog(
  new Map([[167, "孙悟空"]]),
  [
    { ename: 167, cname: "孙悟空", hero_type: 4 },
    { ename: 549, cname: "心魔六耳", hero_type: 4, skin_name: "心魔六耳" },
  ],
);
assert.deepEqual(mergedCatalog.map((hero) => hero.ename), [167, 549]);

const skins = createHeroSkins({
  heroId: 167,
  officialSkinNames: "齐天大圣|神迹守卫|无相",
  detailSkinNames: "齐天大圣",
  fallbackName: "孙悟空",
  skinImageTemplate: "https://cdn/{id}/{id}-bigskin-{idx}.jpg",
  heroImageTemplate: "https://cdn/{id}/{id}.jpg",
});
assert.equal(skins.length, 3);
assert.deepEqual(skins[2], {
  name: "无相",
  index: 3,
  imageUrls: [
    "https://cdn/167/167-bigskin-3.jpg",
    "https://cdn/167/167-mobileskin-3.jpg",
    "https://cdn/167/167.jpg",
  ],
});

assert.equal(normalizeHeroPowerScore("12349"), 12349);
assert.throws(() => normalizeHeroPowerScore("123.4"), RangeError);
assert.equal(calculateLanePowerRank([
  { powerScore: 12_349 },
  { powerScore: 8_765 },
  { powerScore: 1_001 },
]), 22.115);
assert.equal(formatLanePowerRank(22.999), "22");
assert.equal(formatLanePowerRank(35), "35");
assert.deepEqual(createHeroImageCandidates({
  heroId: 167,
  skinIndex: 2,
  remoteImageUrl: "https://example.com/hero.jpg",
  remoteSkinUrls: ["https://example.com/skin.jpg"],
}), [
  "/heroes/skins/167/2.jpg",
  "https://example.com/skin.jpg",
  "https://example.com/hero.jpg",
  "/heroes/images/167.jpg",
]);

console.log("Core, hero lane, calendar, tournament, and announcement tests passed.");
