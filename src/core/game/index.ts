// 纯领域能力统一出口：不得依赖 React、Next.js 或基础设施。

// 常量
export * from "./constants";
// 类型
export * from "./types";
// 功能
export * from "./data";
export * from "./hero-lanes";
export * from "./power";
// 伤害公式
export {
  type HeroBaseStats, type HeroGrowth, type EquipBonus, type FinalStats,
  type SkillEffect as CombatSkillEffect, type EquipPassive, type TargetDefense, type DamageResult,
  HERO_STAT_PROFILES,
  calcFinalStats,
  calcSkillDamage, calcSkillDamageMulti, calcComboDamage,
} from "./combat";
