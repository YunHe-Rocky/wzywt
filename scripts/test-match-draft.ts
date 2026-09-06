import assert from "node:assert/strict";
import { MATCH_DRAFT_TTL_MS, matchDraftKey, matchDraftVersion, readMatchDraft, shouldPreserveActiveMatchDraft, writeMatchDraft } from "../src/web/match-draft-storage";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const storage = new MemoryStorage();
const identity = { userId: 10, matchId: "20", evidenceRevision: 3, baseUpdatedAt: "2026-09-05T10:00:00.000Z" };
const state = { players: [{ id: 1 }], winnerSide: "red" as const };
writeMatchDraft(storage, identity, state, 1_000);
assert.deepEqual(readMatchDraft(storage, identity, (value): value is { id: number } => typeof value === "object" && value !== null && "id" in value && value.id === 1, 2_000), { ...state, savedAt: 1_000 });
assert.equal(storage.getItem(matchDraftKey(11, "20")), null, "another account cannot address this draft");
assert.equal(readMatchDraft(storage, { ...identity, userId: 11 }, (_value): _value is never => { throw new Error("validator should not run"); }, 2_000), null);
assert.equal(readMatchDraft(storage, { ...identity, evidenceRevision: 4 }, (_value): _value is never => false, 2_000), null, "evidence revisions cannot cross");
writeMatchDraft(storage, identity, state, 1_000);
assert.equal(readMatchDraft(storage, identity, (_value): _value is never => false, 1_000 + MATCH_DRAFT_TTL_MS + 1), null, "expired drafts are removed");
assert.equal(storage.getItem(matchDraftKey(10, "20")), null);
const activeVersion = matchDraftVersion(identity);
assert.equal(shouldPreserveActiveMatchDraft(true, activeVersion, identity), true, "recognition polling must preserve a dirty in-memory draft for the same evidence version");
assert.equal(shouldPreserveActiveMatchDraft(true, activeVersion, { ...identity, evidenceRevision: 4 }), false, "new evidence must invalidate the active draft version");
assert.equal(shouldPreserveActiveMatchDraft(false, activeVersion, identity), false, "clean state can refresh from the server");
console.log("Account-isolated match draft tests passed.");