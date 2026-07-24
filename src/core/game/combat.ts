// ═══════════════════════════════════════════════════════════════
// 王者荣耀伤害公式引擎 — 社区验证版
//
// 核心公式来源：NGA/B站/官方WIKI
//
// 免伤率 = 有效抗性 / (602 + 有效抗性)
// 有效抗性 = (总抗性 - 固定穿透) × (1 - 百分比穿透)  ← 先固后百分比
// 最终伤害 = 攻击力 × 602 / (602 + 有效抗性)
//           = 攻击力 × (1 - 免伤率)
//
// 暴击伤害 = 基础伤害 × 暴击效果(默认200%)
// 真实伤害 = 无视抗性，直接扣血
//
// 穿透拐点：对方护甲 > 500 时百分比穿透收益开始超固定穿透
// 护甲拐点：约 800 护甲后堆血量更划算
// ═══════════════════════════════════════════════════════════════

// ═══ 属性计算引擎 ═══

export interface HeroBaseStats {
  hp: number; mp: number; atk: number; ap: number;
  def: number; mdef: number; atkSpeed: number; moveSpeed: number; critRate: number;
}

export interface HeroGrowth {
  hpPerLv: number; mpPerLv: number; atkPerLv: number; apPerLv: number;
  defPerLv: number; mdefPerLv: number; atkSpeedPerLv: number;
}

export interface EquipBonus { stat: string; value: number; }

export interface FinalStats {
  hp: number; mp: number;
  atk: number;       // 总物理攻击
  ap: number;        // 总法术攻击
  extraAtk: number;  // 额外物理攻击（总-基础）
  extraAp: number;   // 额外法术攻击
  extraHp: number;   // 额外生命
  def: number; mdef: number;
  atkSpeed: number; moveSpeed: number; critRate: number;
  cdReduce: number;
  armorPen: number; armorPenPct: number;
  magicPen: number; magicPenPct: number;
  lifesteal: number;
}

// 按职业的默认属性模板
export const HERO_STAT_PROFILES: Record<number, { base: HeroBaseStats; growth: HeroGrowth }> = {
  1: { // 战士
    base: { hp: 3300, mp: 440, atk: 170, ap: 0, def: 95, mdef: 50, atkSpeed: 0, moveSpeed: 380, critRate: 0 },
    growth: { hpPerLv: 280, mpPerLv: 40, atkPerLv: 13, apPerLv: 0, defPerLv: 5, mdefPerLv: 3, atkSpeedPerLv: 1 },
  },
  2: { // 法师
    base: { hp: 2800, mp: 490, atk: 160, ap: 0, def: 85, mdef: 55, atkSpeed: 0, moveSpeed: 360, critRate: 0 },
    growth: { hpPerLv: 210, mpPerLv: 50, atkPerLv: 9, apPerLv: 0, defPerLv: 3.5, mdefPerLv: 4, atkSpeedPerLv: 0.8 },
  },
  3: { // 坦克
    base: { hp: 3700, mp: 430, atk: 160, ap: 0, def: 105, mdef: 55, atkSpeed: 0, moveSpeed: 380, critRate: 0 },
    growth: { hpPerLv: 320, mpPerLv: 35, atkPerLv: 8, apPerLv: 0, defPerLv: 6, mdefPerLv: 3.5, atkSpeedPerLv: 0.8 },
  },
  4: { // 刺客
    base: { hp: 3100, mp: 440, atk: 180, ap: 0, def: 88, mdef: 48, atkSpeed: 0, moveSpeed: 390, critRate: 0 },
    growth: { hpPerLv: 240, mpPerLv: 35, atkPerLv: 14, apPerLv: 0, defPerLv: 4, mdefPerLv: 2.5, atkSpeedPerLv: 1.2 },
  },
  5: { // 射手
    base: { hp: 3000, mp: 440, atk: 175, ap: 0, def: 82, mdef: 48, atkSpeed: 0, moveSpeed: 360, critRate: 0 },
    growth: { hpPerLv: 220, mpPerLv: 35, atkPerLv: 16, apPerLv: 0, defPerLv: 3.5, mdefPerLv: 2.5, atkSpeedPerLv: 1.5 },
  },
  6: { // 辅助
    base: { hp: 3200, mp: 460, atk: 155, ap: 0, def: 90, mdef: 52, atkSpeed: 0, moveSpeed: 380, critRate: 0 },
    growth: { hpPerLv: 260, mpPerLv: 45, atkPerLv: 8, apPerLv: 0, defPerLv: 4.5, mdefPerLv: 3, atkSpeedPerLv: 0.8 },
  },
};

/** 计算最终属性 */
export function calcFinalStats(
  base: HeroBaseStats,
  growth: HeroGrowth,
  level: number,
  equips: EquipBonus[],
): FinalStats {
  const lv = Math.max(1, Math.min(15, level)) - 1;

  let hp = base.hp + growth.hpPerLv * lv;
  let mp = base.mp + growth.mpPerLv * lv;
  let atk = base.atk + growth.atkPerLv * lv;
  let ap = base.ap + growth.apPerLv * lv;
  let def = base.def + growth.defPerLv * lv;
  let mdef = base.mdef + growth.mdefPerLv * lv;
  let atkSpeed = base.atkSpeed + growth.atkSpeedPerLv * lv;
  let moveSpeed = base.moveSpeed;
  let critRate = base.critRate;
  let cdReduce = 0;
  let armorPen = 0, armorPenPct = 0;
  let magicPen = 0, magicPenPct = 0;
  let lifesteal = 0;

  const baseStats = { hp, mp, atk, ap, def, mdef, atkSpeed, moveSpeed, critRate };

  for (const eq of equips) {
    switch (eq.stat) {
      case "atk": atk += eq.value; break;
      case "ap": ap += eq.value; break;
      case "def": def += eq.value; break;
      case "mdef": mdef += eq.value; break;
      case "hp": hp += eq.value; break;
      case "mp": mp += eq.value; break;
      case "cdReduce": cdReduce = Math.min(40, cdReduce + eq.value); break;
      case "atkSpeed": atkSpeed += eq.value; break;
      case "moveSpeed": moveSpeed += eq.value; break;
      case "critRate": critRate += eq.value; break;
      case "lifesteal": lifesteal += eq.value; break;
      case "armorPen": armorPen += eq.value; break;
      case "armorPenPct": armorPenPct += eq.value; break;
      case "magicPen": magicPen += eq.value; break;
      case "magicPenPct": magicPenPct += eq.value; break;
    }
  }

  return {
    hp, mp,
    atk, ap,
    extraAtk: atk - baseStats.atk,
    extraAp: ap - baseStats.ap,
    extraHp: hp - baseStats.hp,
    def, mdef, atkSpeed, moveSpeed, critRate,
    cdReduce: Math.min(40, cdReduce),
    armorPen, armorPenPct, magicPen, magicPenPct,
    lifesteal,
  };
}

// ═══════════════════════════════════════════════════════════════
// 伤害计算引擎
// 最终属性 + 技能公式 + 装备被动 → 伤害值
// ═══════════════════════════════════════════════════════════════

export interface SkillEffect {
  type: "physical" | "magic" | "true" | "shield" | "heal";
  base: number[];
  bonuses: { stat: string; ratio: number }[];
  skillName?: string;
}

export interface EquipPassive {
  name: string; desc: string; unique: boolean;
  // 被动效果类型（用于伤害计算）
  effectType?: "pen_armor" | "pen_magic" | "pen_pct" | "crit_dmg" | "dmg_reduce" | "dmg_amp" | "cd_reset" | "shield" | "heal_amp" | "other";
  value?: number;
}

export interface TargetDefense {
  def: number;    // 目标物理防御
  mdef: number;   // 目标法术防御
  hp: number;     // 目标生命值
}

export interface DamageResult {
  raw: number;           // 原始伤害
  afterReduction: number; // 减免后伤害
  isCrit: boolean;       // 是否暴击
  reduction: number;     // 减免率(0-1)
  effectiveDef: number;  // 有效防御
}

const ARMOR_CONSTANT = 602;

/** 护甲减免率 — 先固穿再百分比（社区公认顺序） */
function calcReduction(defense: number, pen: number, penPct: number): { reduction: number; effectiveDef: number } {
  // ① 先固定穿透 ② 再百分比穿透
  const effectiveDef = Math.max(0, (defense - pen) * (1 - penPct / 100));
  return {
    reduction: effectiveDef / (effectiveDef + ARMOR_CONSTANT),
    effectiveDef,
  };
}

/** 计算单个技能伤害 */
export function calcSkillDamage(params: {
  skill: SkillEffect;
  stats: FinalStats;
  target: TargetDefense;
  level?: number;         // 技能等级(1-6)，默认最大级
  critRate?: number;      // 暴击率，默认用 stats
  critMultiplier?: number; // 暴击效果，默认200%
  dmgAmp?: number;        // 伤害增幅(被动提供)
  dmgReduce?: number;     // 免伤(被动提供)
}): DamageResult {
  const {
    skill, stats, target,
    level = skill.base.length - 1,
    critRate = stats.critRate,
    critMultiplier = 200,
    dmgAmp = 0,
    dmgReduce = 0,
  } = params;

  const baseDmg = skill.base[Math.min(level, skill.base.length - 1)] || skill.base[0] || 0;

  // 计算加成伤害
  let bonusDmg = 0;
  for (const b of skill.bonuses) {
    let statVal = 0;
    switch (b.stat) {
      case "atk": statVal = stats.atk; break;
      case "ap": statVal = stats.ap; break;
      case "hp": statVal = stats.hp; break;
      case "def": statVal = stats.def; break;
      case "mdef": statVal = stats.mdef; break;
      case "extraAd": statVal = stats.extraAtk; break;
      case "extraAp": statVal = stats.extraAp; break;
      case "extraHp": statVal = stats.extraHp; break;
      case "currentHp": statVal = stats.hp; break; // 近似
      case "missingHp": statVal = 0; break;
    }
    bonusDmg += statVal * b.ratio;
  }

  let raw = baseDmg + bonusDmg;

  // 伤害类型
  if (skill.type === "shield") return { raw: Math.round(raw), afterReduction: Math.round(raw), isCrit: false, reduction: 0, effectiveDef: 0 };
  if (skill.type === "heal") return { raw: Math.round(raw), afterReduction: Math.round(raw), isCrit: false, reduction: 0, effectiveDef: 0 };

  // 暴击判定
  const isCrit = skill.type === "physical" && Math.random() * 100 < critRate;
  if (isCrit) raw *= (critMultiplier / 100);

  // 真伤无视护甲
  if (skill.type === "true") {
    return {
      raw: Math.round(raw),
      afterReduction: Math.round(raw),
      isCrit,
      reduction: 0,
      effectiveDef: 0,
    };
  }

  // 护甲减免
  const def = skill.type === "physical" ? target.def : target.mdef;
  const pen = skill.type === "physical" ? stats.armorPen : stats.magicPen;
  const penPct = skill.type === "physical" ? stats.armorPenPct : stats.magicPenPct;
  const { reduction, effectiveDef } = calcReduction(def, pen, penPct);

  // 应用被动伤害增幅/免伤
  const afterReduction = raw * (1 - reduction) * (1 + dmgAmp / 100) * (1 - dmgReduce / 100);

  return {
    raw: Math.round(raw),
    afterReduction: Math.round(afterReduction),
    isCrit,
    reduction: Math.round(reduction * 100) / 100,
    effectiveDef: Math.round(effectiveDef),
  };
}

/** 批量计算（多目标） */
export function calcSkillDamageMulti(params: Omit<Parameters<typeof calcSkillDamage>[0], "target"> & { targets: TargetDefense[] }): DamageResult[] {
  return params.targets.map(t => calcSkillDamage({ ...params, target: t }));
}

/** 计算技能连招总伤害 */
export function calcComboDamage(params: {
  skills: SkillEffect[];
  stats: FinalStats;
  target: TargetDefense;
}): { totalRaw: number; totalDmg: number; skills: { name: string; dmg: DamageResult }[] } {
  let totalRaw = 0;
  let totalDmg = 0;
  const results: { name: string; dmg: DamageResult }[] = [];
  for (const skill of params.skills) {
    const dmg = calcSkillDamage({ skill, stats: params.stats, target: params.target });
    totalRaw += dmg.raw;
    totalDmg += dmg.afterReduction;
    results.push({ name: skill.skillName || "?", dmg });
  }
  return { totalRaw, totalDmg, skills: results };
}
