// 王者演武堂 引擎

// 常量
export * from "./constants";
// 类型
export * from "./types";
// 功能
export * from "./data";
// 动画
export * from "./animation";
// 伤害公式
export {
  type HeroBaseStats, type HeroGrowth, type EquipBonus, type FinalStats,
  type SkillEffect as CombatSkillEffect, type EquipPassive, type TargetDefense, type DamageResult,
  HERO_STAT_PROFILES,
  calcFinalStats,
  calcSkillDamage, calcSkillDamageMulti, calcComboDamage,
} from "./combat";
