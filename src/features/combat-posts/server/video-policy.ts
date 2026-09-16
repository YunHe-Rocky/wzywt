import { parseCombatVideoPolicy } from "@/features/combat-posts/video-policy";
export function getCombatVideoPolicy() { return parseCombatVideoPolicy(process.env); }
