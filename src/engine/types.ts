// 引擎 · 类型 — 前端 + API 共用

export interface HeroMeta {
  title: string; roleType: string; heroType: number; heroType2: number;
  imageUrl: string; skinsJson?: string;
  mingge: { name: string | null; relatedId: number | null } | null;
}

export interface HeroListItem {
  id: number; name: string; meta: HeroMeta; tags: string[];
}

export interface SkillEffect {
  skillIndex: number; skillName: string;
  type: "physical" | "magic" | "true" | "shield" | "heal";
  base: number[]; bonuses: { stat: string; ratio: number }[]; cc?: string;
}

export interface HeroSkill {
  name: string; cd: string; cost: string; desc: string; skillIndex: number;
  extraJson?: { damage: SkillEffect[] } | null;
}

export interface HeroDetail {
  id: number; name: string; meta: HeroMeta; tags: string[];
  stats: { stat: string; value: number }[]; effects: SkillEffect[]; skills: HeroSkill[];
}

export interface EquipMeta {
  price: number; tier?: number; itemType?: number; imageUrl?: string;
}

export interface PassiveEffect {
  name: string; desc: string; unique: boolean;
}

export interface EquipListItem {
  id: number; name: string; meta: EquipMeta; tags: string[];
  stats: { stat: string; value: number }[]; effects: PassiveEffect[];
}

export interface EquipDetail extends EquipListItem {
  atk: number; ap: number; def: number; mdef: number;
  hp: number; mp: number; cdReduce: number; atkSpeed: number;
  moveSpeed: number; critRate: number; lifesteal: number;
}

// Stat system types
export interface StatDef { key: string; label: string; unit: "fixed" | "percent" | "perLevel"; }
export interface DamageBonus { stat: string; ratio: number; }
export interface SkillDamage { base: number[]; type: "physical" | "magic" | "true" | "shield" | "heal"; bonuses: DamageBonus[]; cc?: string; }
export interface EquipmentStatItem { stat: string; value: number; }
export interface TagDef { key: string; label: string; }
export interface EquipmentExtra { itemType?: number; tier?: number; tags?: string[]; }
export interface EquipmentRow { itemId: number; name: string; price: number; imageUrl: string; atk: number; ap: number; def: number; mdef: number; hp: number; mp: number; cdReduce: number; atkSpeed: number; moveSpeed: number; critRate: number; lifesteal: number; extraJson?: EquipmentExtra | null; }

// Pipeline types
export interface SkillInput { heroId: number; heroName: string; skillIndex: number; name: string; cd: string; cost: string; desc: string; }
export interface SkillOutput extends SkillInput { extraJson: Record<string, unknown>; }
export interface SkillPlugin { name: string; process: (skill: SkillInput) => Record<string, unknown>; }
