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
  resolveRecruitmentStatus,
  TEMPORARY_CLEANUP_STATUSES,
} from "@/features/tournaments/model";
import { normalizeGameProfile } from "@/features/profile/model";
import { selectHeroesForLane } from "@/core/game";
import {
  calculateLanePowerRank,
  formatLanePowerRank,
  normalizeHeroPowerScore,
} from "@/core/game";
import {
  createHeroSkins,
  mergeHeroCatalog,
} from "@/features/heroes/model";
import { splitTeams, type Player } from "@/core/team-balancing";

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
assert.equal(canViewTournamentMemberIdentity("owner"), true);
assert.equal(canViewTournamentMemberIdentity("co_owner"), true);
assert.equal(canViewTournamentMemberIdentity("player"), false);
assert.deepEqual(
  normalizeGameProfile({ gameNickname: "  演武堂主 ", gameId: " 123 456 " }),
  { gameNickname: "演武堂主", gameId: "123 456" },
);
assert.throws(
  () => normalizeGameProfile({ gameNickname: "a".repeat(33), gameId: "" }),
  RangeError,
);
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

const roles = ["top", "jungle", "mid", "adc", "support"];
const players: Player[] = Array.from({ length: 10 }, (_, index) => ({
  userId: index + 1,
  rolePreferences: roles.map((roleType, roleIndex) => ({
    roleType,
    preferenceRank: ((roleIndex - index + roles.length) % roles.length) + 1,
    roleRank: 5 + (index % 3),
    peakScore: 1_500 + index * 10,
    peakRank: 6,
  })),
  heroPowers: Object.fromEntries(
    roles.map((roleType, roleIndex) => [
      roleType,
      [6_000 + index * 100 + roleIndex * 10],
    ]),
  ),
}));
const powersBefore = JSON.stringify(players.map((player) => player.heroPowers));
const result = splitTeams(players);
assert.ok(result);
assert.equal(result.teamRed.length, 5);
assert.equal(result.teamBlue.length, 5);
assert.deepEqual(
  new Set([...result.teamRed, ...result.teamBlue].map((player) => player.roleType)),
  new Set(roles),
);
assert.equal(JSON.stringify(players.map((player) => player.heroPowers)), powersBefore);

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
assert.equal(formatLanePowerRank(22.115), "22.115");
assert.equal(formatLanePowerRank(35), "35");

console.log("Core, hero lane, calendar, tournament, and announcement tests passed.");
