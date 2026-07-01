// 引擎 · 功能函数 — 属性、装备计算、技能解析、管道

import type { StatDef, DamageBonus, SkillDamage, EquipmentStatItem, TagDef, PassiveEffect, EquipmentExtra, EquipmentRow, SkillInput, SkillOutput, SkillPlugin } from "./types";

// ═══ 属性定义 ═══

export const STAT_DEFS: StatDef[] = [
  { key: "atk", label: "物理攻击", unit: "fixed" },
  { key: "ap", label: "法术攻击", unit: "fixed" },
  { key: "def", label: "物理防御", unit: "fixed" },
  { key: "mdef", label: "法术防御", unit: "fixed" },
  { key: "hp", label: "最大生命", unit: "fixed" },
  { key: "mp", label: "最大法力", unit: "fixed" },
  { key: "cdReduce", label: "冷却缩减", unit: "percent" },
  { key: "atkSpeed", label: "攻击速度", unit: "percent" },
  { key: "moveSpeed", label: "移动速度", unit: "percent" },
  { key: "critRate", label: "暴击率", unit: "percent" },
  { key: "lifesteal", label: "物理吸血", unit: "percent" },
  { key: "armorPen", label: "物理穿透", unit: "fixed" },
  { key: "magicPen", label: "法术穿透", unit: "fixed" },
  { key: "armorPenPct", label: "物理穿透率", unit: "percent" },
  { key: "magicPenPct", label: "法术穿透率", unit: "percent" },
];

export const STAT_MAP: Record<string, StatDef> = Object.fromEntries(STAT_DEFS.map((s) => [s.key, s]));

export function buildEquipmentStats(equip: {
  atk: number; ap: number; def: number; mdef: number;
  hp: number; mp: number; cdReduce: number; atkSpeed: number;
  moveSpeed: number; critRate: number; lifesteal: number;
}): EquipmentStatItem[] {
  const map: [string, number][] = [
    ["atk", equip.atk], ["ap", equip.ap], ["def", equip.def], ["mdef", equip.mdef],
    ["hp", equip.hp], ["mp", equip.mp], ["cdReduce", equip.cdReduce],
    ["atkSpeed", equip.atkSpeed], ["moveSpeed", equip.moveSpeed],
    ["critRate", equip.critRate], ["lifesteal", equip.lifesteal],
  ];
  return map.filter(([, v]) => v > 0).map(([stat, value]) => ({ stat, value }));
}

// ═══ 装备计算 ═══

export const ALL_TAGS: TagDef[] = [
  { key: "物理", label: "物理" }, { key: "法术", label: "法术" }, { key: "防御", label: "防御" },
  { key: "打野", label: "打野" }, { key: "辅助", label: "辅助" }, { key: "移速", label: "移速" },
  { key: "物攻", label: "物攻" }, { key: "法强", label: "法强" }, { key: "物防", label: "物防" },
  { key: "法防", label: "法防" }, { key: "生命", label: "生命" }, { key: "法力", label: "法力" },
  { key: "冷却", label: "冷却" }, { key: "攻速", label: "攻速" }, { key: "暴击", label: "暴击" }, { key: "吸血", label: "吸血" },
];

const ITEM_TYPE_TAG: Record<number, string> = { 1: "物理", 2: "法术", 3: "防御", 4: "移速", 5: "打野", 7: "辅助" };
const STAT_TAG_MAP: Record<string, string> = {
  atk: "物攻", ap: "法强", def: "物防", mdef: "法防",
  hp: "生命", mp: "法力", cdReduce: "冷却", atkSpeed: "攻速",
  critRate: "暴击", lifesteal: "吸血",
};

interface EquipStatsInput {
  atk: number; ap: number; def: number; mdef: number; hp: number; mp: number;
  cdReduce: number; atkSpeed: number; moveSpeed: number; critRate: number; lifesteal: number;
}

export function computeTier(totalPrice: number, name: string, itemType?: number): number {
  if (name.includes("·")) return 3;
  if (itemType === 4) { if (totalPrice <= 300) return 1; return 3; }
  if (totalPrice <= 400) return 1;
  if (totalPrice <= 2000) return 2;
  return 3;
}

export function computeTags(itemType: number, stats: EquipStatsInput): string[] {
  const tags = new Set<string>();
  const cat = ITEM_TYPE_TAG[itemType];
  if (cat) tags.add(cat);
  for (const [k, v] of Object.entries(STAT_TAG_MAP)) {
    if ((stats as any)[k] > 0) tags.add(v);
  }
  return Array.from(tags);
}

export function parsePassives(des2: string): PassiveEffect[] {
  if (!des2) return [];
  const text = des2.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const re = /(唯一)?被动(?:[-•](.+?))?[：:]\s*(.+?)(?=(?:唯一)?被动(?:[-•]|：|:)|$)/g;
  const passives: PassiveEffect[] = [];
  const seen = new Set<string>();
  let m;
  while ((m = re.exec(text)) !== null) {
    let name = m[2]?.trim() || "";
    const desc = m[3].trim();
    const unique = !!m[1];
    if (!name && /移动速度/.test(desc)) name = "神速";
    if (!name) name = "被动";
    if (name === "神速") {
      passives.push({ name: "神速", desc: "+50移动速度（所有鞋类装备的移速加成效果不叠加）", unique: false });
      continue;
    }
    const key = `${name}:${desc.slice(0, 30)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    passives.push({ name, desc, unique });
  }
  if (passives.length === 0 && text.length > 0) {
    passives.push({ name: "被动", desc: text, unique: /唯一/.test(text) });
  }
  return passives;
}

// ═══ 技能伤害解析 ═══

const BONUS_KEY_MAP: [RegExp, string][] = [
  [/额外(?:物理攻击|Ad|物理加成)/, "extraAd"],
  [/额外(?:法术攻击|Ap|法术加成)/, "extraAp"],
  [/额外(?:最大)?生命/, "extraHp"],
  [/物理攻击|物理加成/, "atk"],
  [/法术攻击|法术加成/, "ap"],
  [/最大生命/, "hp"],
  [/当前生命/, "currentHp"],
  [/已损生命/, "missingHp"],
];

function parseBonuses(raw: string): DamageBonus[] {
  const bonuses: DamageBonus[] = [];
  const parts = raw.split(/[）\)]\s*[（\(]/);
  for (const part of parts) {
    const cleaned = part.replace(/[（\(）\)]/g, "").trim();
    const m = cleaned.match(/\+(\d+\.?\d*)\s*[%％]?\s*(.+)/);
    if (m) {
      const ratio = parseFloat(m[1]) / 100;
      const label = m[2].trim();
      for (const [re, key] of BONUS_KEY_MAP) {
        if (re.test(label)) { bonuses.push({ stat: key, ratio }); break; }
      }
    }
  }
  return bonuses;
}

function parseLevelValues(raw: string): number[] {
  if (!raw) return [];
  return raw.split("/").map((s) => parseInt(s) || 0).filter((n) => n > 0);
}

function normalizeDigits(s: string): string {
  return s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}
function normalizePunct(s: string): string {
  return s.replace(/％/g, "%").replace(/（/g, "(").replace(/）/g, ")").replace(/：/g, ":").replace(/，/g, ",");
}

export function parseSkillDamage(desc: string, damageType?: string | null): SkillDamage[] {
  if (!desc) return [];
  const text = normalizePunct(normalizeDigits(desc));
  const results: SkillDamage[] = [];
  const dmgRe = /造成(?:额外)?(\d+(?:\/\d+)*)\s*点?\s*((?:\([^)]*\))*)\s*点?(物理|法术|真实)?[伤损]/g;
  let m: RegExpExecArray | null;
  while ((m = dmgRe.exec(text)) !== null) {
    const base = parseLevelValues(m[1]);
    const bonuses = m[2] ? parseBonuses(m[2]) : [];
    const typeMap: Record<string, SkillDamage["type"]> = { 物理: "physical", 法术: "magic", 真实: "true" };
    const type = typeMap[m[3]] || (damageType === "magic" ? "magic" : damageType === "true" ? "true" : "physical");
    results.push({ base, type, bonuses });
  }
  const shieldRe = /(?:获得|抵免)(\d+(?:\/\d+)*)\s*点?\s*((?:\([^)]*\))*)\s*(?:点伤害的)?\s*护盾/g;
  while ((m = shieldRe.exec(text)) !== null) {
    results.push({ base: parseLevelValues(m[1]), type: "shield", bonuses: m[2] ? parseBonuses(m[2]) : [] });
  }
  const healRe = /回复(\d+(?:\/\d+)*)\s*点?\s*((?:\([^)]*\))*)\s*点?(?:生命|血量)/g;
  while ((m = healRe.exec(text)) !== null) {
    results.push({ base: parseLevelValues(m[1]), type: "heal", bonuses: m[2] ? parseBonuses(m[2]) : [] });
  }
  const ccRe = /(\d+\.?\d*)\s*秒?\s*(击飞|眩晕|减速|沉默|嘲讽|压制|定身|石化)/g;
  while ((m = ccRe.exec(text)) !== null) {
    if (results.length > 0) results[results.length - 1].cc = m[0];
  }
  return results;
}

// ═══ 技能管道 ═══

export const damageParserPlugin: SkillPlugin = {
  name: "damage-parser",
  process(skill) { return { damage: parseSkillDamage(skill.desc) }; },
};

const skillPlugins: SkillPlugin[] = [damageParserPlugin];

export function processSkill(skill: SkillInput): SkillOutput {
  const extraJson: Record<string, unknown> = {};
  for (const plugin of skillPlugins) {
    try { Object.assign(extraJson, plugin.process(skill)); }
    catch (e) { console.error(`[engine] plugin "${plugin.name}" failed for hero ${skill.heroId}:${skill.skillIndex}`, e); }
  }
  return { ...skill, extraJson };
}
