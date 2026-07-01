// 引擎 · 常量 — 分路、职业、属性标签、装备配置

export const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;

export const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

export const ROLE_COLORS: Record<string, string> = {
  top: "#e05555", jungle: "#55b055", mid: "#5588cc", adc: "#ddaa33", support: "#aa66cc",
};

export const ROLE_BADGES: Record<string, { label: string; color: string }> = Object.fromEntries(
  ROLES.map((r) => [r, { label: ROLE_LABELS[r], color: ROLE_COLORS[r] }]),
);

export const CLASS_LABELS: Record<number, string> = {
  1: "战士", 2: "法师", 3: "坦克", 4: "刺客", 5: "射手", 6: "辅助",
};

export const CLASS_COLORS: Record<number, string> = {
  1: "#dd7744", 2: "#44aaaa", 3: "#88aa44", 4: "#cc4466", 5: "#cc8833", 6: "#66aacc",
};

export const CLASS_BADGES: Record<number, { label: string; color: string }> = Object.fromEntries(
  Object.entries(CLASS_LABELS).map(([k, v]) => [parseInt(k), { label: v, color: CLASS_COLORS[parseInt(k)] }]),
);

export const CLASS_TO_LANE: Record<number, string> = {
  1: "top", 2: "mid", 3: "top", 4: "jungle", 5: "adc", 6: "support",
};

export const ROLE_FILTERS = [
  { value: "", label: "全部分路" },
  ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
];

export const CLASS_FILTERS = [
  { value: "", label: "全部职业" },
  ...Object.entries(CLASS_LABELS).map(([k, v]) => ({ value: k, label: v })),
];

export const STAT_SHORT_LABELS: Record<string, string> = {
  atk: "物攻", ap: "法攻", def: "物防", mdef: "法防",
  hp: "生命", mp: "法力", cdReduce: "冷却", atkSpeed: "攻速",
  moveSpeed: "移速", critRate: "暴击", lifesteal: "吸血",
};

export const STAT_LONG_LABELS: Record<string, string> = {
  atk: "物理攻击", ap: "法术攻击", def: "物理防御", mdef: "法术防御",
  hp: "最大生命", mp: "最大法力", cdReduce: "冷却缩减", atkSpeed: "攻击速度",
  moveSpeed: "移动速度", critRate: "暴击率", lifesteal: "物理吸血",
  armorPen: "物理穿透", magicPen: "法术穿透",
};

export const STAT_PCT_KEYS = new Set(["cdReduce", "atkSpeed", "moveSpeed", "critRate", "lifesteal"]);
export const DISPLAY_STATS = ["atk", "ap", "def", "hp", "cdReduce", "atkSpeed", "critRate", "moveSpeed"] as const;

export const TIER_LABELS: Record<number, string> = { 1: "一级", 2: "二级", 3: "三级" };

export const TIER_FILTERS = [
  { value: 0, label: "全部" }, { value: 1, label: "一级" }, { value: 2, label: "二级" }, { value: 3, label: "三级" },
];

export const CHAR_TAGS = ["物理", "法术", "防御", "打野", "辅助", "移速"];

export const CHAR_COLORS: Record<string, string> = {
  物理: "#e05555", 法术: "#5588cc", 防御: "#88aa44",
  打野: "#55b055", 辅助: "#aa66cc", 移速: "#ddaa33",
};
