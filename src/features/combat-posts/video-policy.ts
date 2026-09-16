export interface CombatVideoPolicy { maxBytes: number; maxDurationSeconds: number; uploadTimeoutMs: number }

export function parseCombatVideoPolicy(env: Record<string, string | undefined>): CombatVideoPolicy {
  function number(name: string, fallback: number, maximum: number) {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be an integer between 1 and ${maximum}`);
    return value;
  }
  return {
    maxBytes: number("COMBAT_VIDEO_MAX_SIZE_MB", 512, 2047) * 1024 ** 2,
    maxDurationSeconds: number("COMBAT_VIDEO_MAX_DURATION_SECONDS", 300, 86400),
    uploadTimeoutMs: number("COMBAT_VIDEO_UPLOAD_TIMEOUT_SECONDS", 900, 3600) * 1000,
  };
}
