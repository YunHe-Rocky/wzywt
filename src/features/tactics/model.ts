export const TACTIC_COLOR_KEYS = ["crimson", "azure", "amber", "jade", "violet"] as const;
export type TacticColorKey = (typeof TACTIC_COLOR_KEYS)[number];

export interface TacticPoint {
  x: number;
  y: number;
}

export interface TacticGeometry {
  version: 1;
  points: TacticPoint[];
  arrow: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTacticGeometry(value: unknown): TacticGeometry | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.arrow !== "boolean" || !Array.isArray(value.points)) return null;
  if (value.points.length < 2 || value.points.length > 64) return null;
  const points: TacticPoint[] = [];
  for (const point of value.points) {
    if (!isRecord(point) || typeof point.x !== "number" || typeof point.y !== "number") return null;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
    points.push({ x: point.x, y: point.y });
  }
  return { version: 1, points, arrow: value.arrow };
}

export function tacticColorForSlot(slot: number): TacticColorKey {
  if (!Number.isInteger(slot) || slot < 1 || slot > TACTIC_COLOR_KEYS.length) throw new Error("INVALID_TACTIC_SLOT");
  return TACTIC_COLOR_KEYS[slot - 1];
}

export function canViewSharedTacticAnnotations(matchStatus: string): boolean {
  return matchStatus === "SUBMITTED";
}

export function visibleTacticAnnotationOwnerId(sharedAnnotationsVisible: boolean, viewerUserId: number): number | undefined {
  if (!Number.isSafeInteger(viewerUserId) || viewerUserId <= 0) throw new Error("INVALID_TACTIC_VIEWER");
  return sharedAnnotationsVisible ? undefined : viewerUserId;
}
