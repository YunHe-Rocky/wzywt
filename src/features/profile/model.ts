export interface GameProfile {
  gameNickname: string | null;
  gameId: string | null;
}

const GAME_NICKNAME_MAX = 32;
const GAME_ID_MAX = 64;

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") throw new TypeError("资料字段必须是字符串");
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new RangeError("资料字段超过长度限制");
  return normalized || null;
}

export function normalizeGameProfile(input: {
  gameNickname: unknown;
  gameId: unknown;
}): GameProfile {
  return {
    gameNickname: normalizeOptionalText(input.gameNickname, GAME_NICKNAME_MAX),
    gameId: normalizeOptionalText(input.gameId, GAME_ID_MAX),
  };
}
