import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";

export function encodeRelativeFileUrl(relativePath) {
  return relativePath
    .replaceAll("\\", "/")
    .split("/")
    .map(segment => segment === "." || segment === ".." ? segment : encodeURIComponent(segment))
    .join("/");
}

export const YANWU_FAMILIES = [
  ["01", "首页", "/", "HomePage"],
  ["02", "登录", "/login", "AuthForm"],
  ["03", "注册", "/register", "AuthForm"],
  ["04", "个人中心", "/me", "MePage"],
  ["05", "英雄图鉴", "/heroes", "HeroGrid"],
  ["06", "英雄详情", "/heroes/105", "HeroDetailView"],
  ["07", "装备图鉴", "/equipment", "EquipmentPage"],
  ["08", "装备详情", "/equipment/1136", "EquipmentDetailPage"],
  ["09", "演武房间", "/tournaments", "TournamentList"],
  ["10", "房间详情", "/tournaments/101", "TournamentDetail"],
  ["11", "对局记录", "/tournaments/101/matches/201", "MatchWorkspace"],
  ["12", "战术演练", "/tournaments/101/matches/201/tactics/red", "TacticBoard"],
  ["13", "更新日志", "/changelog", "ChangelogPage"],
  ["14", "日志详情", "/changelog/版本更新", "ChangelogDetailPage"],
  ["15", "动态广场", "/combat", "CombatWall"],
  ["16", "动态详情", "/combat/1", "CombatPostDetail"],
  ["17", "数据监控", "/monitor", "MonitorDashboard"],
  ["18", "管理工作台", "/admin", "AdminDashboard"],
  ["19", "用户管理", "/admin/users", "AdminUsersPage"],
  ["20", "房间管理", "/admin/tournaments", "AdminTournamentsPage"],
  ["21", "动态管理", "/admin/combat", "CombatPostManager"],
  ["22", "公告管理", "/admin/announcements", "AnnouncementManager"],
  ["23", "历史主题工作室", "/admin/history-themes", "HistoryThemeStudio"],
  ["24", "英雄分路管理", "/admin/heroes", "AdminHeroesPage"],
  ["25", "后台监控", "/admin/monitor", "MonitorDashboard"],
  ["26", "系统设置", "/admin/settings", "AdminSettingsPage"],
].map(([id, label, route, component]) => ({ id, label, route, component }));

function mobileRoute(route) {
  return route === "/" ? "/m" : `/m${route}`;
}

async function requireImage(file, label) {
  assert.equal(typeof file, "string", `Missing screenshot path: ${label}`);
  assert.ok(path.isAbsolute(file), `Screenshot path must be absolute: ${label}`);
  let info;
  try { info = await stat(file); }
  catch { assert.fail(`Missing screenshot: ${label}: ${file}`); }
  assert.ok(info.isFile() && info.size > 0, `Empty screenshot: ${label}: ${file}`);
}

export async function validateYanwuManifest(records) {
  assert.ok(Array.isArray(records), "Yanwu manifest must be an array");
  const baselines = records.filter(record => record?.state === "baseline");

  for (const family of YANWU_FAMILIES) {
    for (const profile of ["desktop", "mobile"]) {
      const matches = baselines.filter(record => record.family === family.id && record.profile === profile);
      assert.ok(matches.length > 0, `Missing ${family.id} ${profile}`);
      assert.equal(matches.length, 1, `Duplicate ${family.id} ${profile}`);
      const record = matches[0];
      const viewport = profile === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
      assert.equal(record.route, profile === "desktop" ? family.route : mobileRoute(family.route), `${family.id} ${profile} route`);
      assert.equal(record.component, family.component, `${family.id} ${profile} component`);
      assert.deepEqual(record.viewport, viewport, `${family.id} ${profile} viewport`);
      assert.equal(record.source, "isolated-component-fixture", `${family.id} ${profile} source`);
      assert.equal(typeof record.fixture, "string", `${family.id} ${profile} fixture`);
      assert.ok(record.fixture.length > 0, `${family.id} ${profile} fixture`);
      assert.equal(typeof record.role, "string", `${family.id} ${profile} role`);
      await requireImage(record.file, `${family.id} ${profile}`);
      if (record.fullPageFile !== undefined) await requireImage(record.fullPageFile, `${family.id} ${profile} full-page`);
    }
  }

  const approved = new Set(YANWU_FAMILIES.map(family => family.id));
  for (const record of baselines) assert.ok(approved.has(record.family), `Unexpected baseline family ${record.family}`);
  assert.equal(baselines.length, 52, "Yanwu manifest must contain exactly 52 baseline records");
  return { records, baselines, families: new Set(baselines.map(record => record.family)).size };
}
