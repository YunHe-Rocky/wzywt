import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";

// Load actual services with only authentication and database I/O replaced. No
// PrismaClient is constructed and no environment files or database are opened.
const root = resolve(import.meta.dirname, "..");
const nativeRequire = createRequire(import.meta.url);
type Query = { where?: Record<string, unknown>; select?: Record<string, unknown>; include?: Record<string, unknown> };
type Service = Record<string, (...args: unknown[]) => Promise<unknown>>;
let actor = { userId: 1, username: "red-one", role: "member" };
let status = "SUBMITTED";
let adminRole: string | null = null;
let lastListQuery: Query | undefined;
let lastRoomQuery: Query | undefined;
let disputeWrites = 0;
let draftCreate: { tacticRooms: { create: unknown[] } } | undefined;
let existingLayer: { id: number; roomId: number; name: string; sortOrder: number; createdById: number } | null = null;
let layerWrites = 0;
let layerRace = false;
let submitBeforeTransaction = false;
const timestamp = new Date("2026-09-08T00:00:00.000Z");
const players = Array.from({ length: 10 }, (_, index) => ({
  id: index + 101, memberId: index + 1, side: index < 5 ? "red" : "blue", slot: index % 5 + 1,
  member: { id: index + 1, username: `member-${index + 1}` }, isGuest: false,
  gameNickname: index < 5 ? `red-${index}` : `opponent-secret-${index}`, heroId: 11,
  heroName: "hero", hero: null, roleType: "mid", score: 8, identityConfirmedAt: timestamp,
  stats: null, updatedAt: timestamp,
}));
function fixture() {
  return {
    id: 20, tournamentId: 30, status, playedAt: timestamp, winnerSide: "blue",
    redTotalKills: 10, blueTotalKills: 20, consistencyStatus: "WARNING",
    consistencyDetails: { privateOpponent: "opponent-secret-consistency" }, evidenceRevision: 3,
    recordRevision: 2, submittedAt: timestamp, updatedAt: timestamp,
    tournament: { name: "room", admins: adminRole ? [{ id: 1, role: adminRole }] : [],
      players: players.map((player) => ({ userId: player.memberId, user: { username: player.gameNickname, gameNickname: player.gameNickname } })) },
    players, screenshots: [{ id: 1, originalFilename: "opponent-secret-screenshot" }],
    recognitions: [{ normalizedResult: { players }, warnings: ["opponent-secret-recognition"] }],
    disputes: [
      { id: 1, matchPlayerId: 101, currentValue: 8 },
      { id: 2, matchPlayerId: 106, currentValue: "opponent-secret-old-dispute" },
      { id: 3, matchPlayerId: null, currentValue: "opponent-secret-old-implicit-player" },
    ], _count: { players: 10, screenshots: 6, combatPosts: 2 },
  };
}
const prisma = {
  async $transaction(work: (tx: unknown) => Promise<unknown>) {
    if (submitBeforeTransaction) { status = "SUBMITTED"; submitBeforeTransaction = false; }
    return work(prisma);
  },
  internalMatch: {
    async create(query: { data: { tacticRooms: { create: unknown[] } } }) { draftCreate = query.data; return { id: 20 }; },
    async findFirst(query: Query) {
      const result = fixture();
      const relation = (query.select?.players ?? query.include?.players) as { where?: { memberId?: number; id?: number; side?: string } } | undefined;
      if (relation?.where) result.players = result.players.filter((player) => Object.entries(relation.where!).every(([key, value]) => player[key as keyof typeof player] === value));
      return result;
    },
    async findMany(query: Query) {
      lastListQuery = query;
      const ownRows = (query.where?.players as { some?: { memberId: number } } | undefined)?.some;
      if (ownRows && !players.some((player) => player.memberId === ownRows.memberId)) return [];
      return [{ ...fixture(), players: players.filter((player) => player.memberId === actor.userId) }];
    },
  },
  tournament: { async findUnique() { return { ...fixture().tournament,
    splitResult: { teamRed: players.slice(0, 5).map((player) => ({ userId: player.memberId, assignedRole: "mid" })), teamBlue: players.slice(5).map((player) => ({ userId: player.memberId, assignedRole: "mid" })) }, picks: [],
  }; } },
  tacticRoom: { async findUnique(query: Query) { lastRoomQuery = query; return { id: 9, matchId: 20, side: "red", layers: [] }; } },
  tacticLayer: {
    async findFirst() { return existingLayer; },
    async create(query: { data: Omit<NonNullable<typeof existingLayer>, "id"> }) {
      layerWrites++;
      existingLayer = { id: 51, ...query.data };
      if (layerRace) {
        layerRace = false;
        const { Prisma } = nativeRequire("@prisma/client") as typeof import("@prisma/client");
        throw new Prisma.PrismaClientKnownRequestError("Concurrent base layer", { code: "P2002", clientVersion: "test" });
      }
      return existingLayer;
    },
  },
  matchDispute: {
    async count() { return 0; },
    async create(query: Query & { data: unknown }) { disputeWrites++; return query.data; },
  },
};
const cache = new Map<string, Record<string, unknown>>();
function loadLocal(filename: string): Record<string, unknown> {
  if (!existsSync(filename)) filename = existsSync(`${filename}.ts`) ? `${filename}.ts` : resolve(filename, "index.ts");
  if (statSync(filename).isDirectory()) filename = resolve(filename, "index.ts");
  if (filename === resolve(root, "src/lib/db.ts")) return { prisma };
  if (filename === resolve(root, "src/lib/auth.ts")) return { requireAuth: async () => actor };
  const cached = cache.get(filename);
  if (cached) return cached;
  const loaded = { exports: {} as Record<string, unknown> };
  cache.set(filename, loaded.exports);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = (specifier: string) => specifier.startsWith("@/")
    ? loadLocal(resolve(root, "src", specifier.slice(2)))
    : specifier.startsWith(".") ? loadLocal(resolve(dirname(filename), specifier)) : nativeRequire(specifier);
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const access = loadLocal(resolve(root, "src/features/matches/server/access.ts")) as Service;
const draft = loadLocal(resolve(root, "src/features/matches/server/draft.ts")) as Service;
const tactics = loadLocal(resolve(root, "src/features/tactics/server/service.ts")) as Service;
const records = loadLocal(resolve(root, "src/features/matches/server/records.ts")) as Service;

async function main() {
  actor.role = "admin";
  await draft.createMatchDraft(30);
  assert.deepEqual(draftCreate?.tacticRooms.create, [
    { side: "red", layers: { create: { name: "基础图层", sortOrder: 0, createdById: 1 } } },
    { side: "blue", layers: { create: { name: "基础图层", sortOrder: 0, createdById: 1 } } },
  ], "new matches must let both teams draw without requiring a team manager");
  actor.role = "member";
  status = "DRAFT";
  assert.equal(typeof tactics.initializeOwnTacticLayer, "function", "legacy empty tactic rooms need an explicit initialization operation");
  assert.deepEqual(await tactics.initializeOwnTacticLayer(30, 20, "red"), { id: 51, roomId: 9, name: "基础图层", sortOrder: 0, createdById: 1 });
  await tactics.initializeOwnTacticLayer(30, 20, "red");
  assert.equal(layerWrites, 1, "initializing an existing room is idempotent");
  existingLayer = null;
  layerRace = true;
  assert.equal((await tactics.initializeOwnTacticLayer(30, 20, "red") as { id: number }).id, 51, "concurrent initialization returns the already-created base layer");
  assert.equal(layerWrites, 2);
  const tacticRoute = loadLocal(resolve(root, "src/app/api/tournaments/[id]/matches/[matchId]/tactics/[side]/route.ts")) as Service;
  const initializedResponse = await tacticRoute.POST(new Request("http://localhost/api/tactics/red", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "initialize", name: "cannot override base name" }) }), { params: Promise.resolve({ id: "30", matchId: "20", side: "red" }) }) as Response;
  assert.equal(initializedResponse.status, 201, "POST initialization is available to ordinary own-team members");
  assert.equal((await initializedResponse.json()).layer.name, "基础图层");
  assert.equal(layerWrites, 2);
  await assert.rejects(() => tactics.initializeOwnTacticLayer(30, 20, "blue"), /FORBIDDEN/);
  await assert.rejects(() => tactics.createTacticLayer(30, 20, "red", { name: "arbitrary" }), /FORBIDDEN/, "initialization does not grant ordinary layer management");
  status = "SUBMITTED";
  await assert.rejects(() => tactics.initializeOwnTacticLayer(30, 20, "red"), /只读复盘/);
  status = "DRAFT";
  submitBeforeTransaction = true;
  await assert.rejects(() => tactics.initializeOwnTacticLayer(30, 20, "red"), /只读复盘/, "submission between initial permission read and transaction must prevent writes");
  assert.equal(layerWrites, 2);
  for (const unfinished of ["DRAFT", "UPLOADED", "WAITING_CONFIRMATION", "CONFIRMED"]) {
    status = unfinished;
    await assert.rejects(() => access.requireMatchViewer(30, 20), /FORBIDDEN/, `participants cannot open ${unfinished} archives`);
  }
  status = "SUBMITTED";
  actor.userId = 99;
  await assert.rejects(() => access.requireMatchViewer(30, 20), /FORBIDDEN/, "submitted matches are not public");
  assert.deepEqual(await draft.listTournamentMatches(30), [], "outsiders cannot list other teams' archives");
  assert.deepEqual(lastListQuery?.where, { tournamentId: 30, players: { some: { memberId: 99 } } });
  actor.userId = 1;
  // Literal access expectations cover both teams, managers, unassigned admins,
  // unfinished records, spectators, and guest/unbound slots without any I/O.
  const { getMatchVisibility } = loadLocal(resolve(root, "src/features/matches/visibility.ts")) as typeof import("../src/features/matches/visibility");
  for (const row of [
    { userId: 1, role: "member", assignment: null, state: "SUBMITTED", side: "red", manage: false, view: true },
    { userId: 6, role: "member", assignment: null, state: "SUBMITTED", side: "blue", manage: false, view: true },
    { userId: 99, role: "member", assignment: null, state: "SUBMITTED", side: null, manage: false, view: false },
    { userId: 1, role: "member", assignment: null, state: "CONFIRMED", side: "red", manage: false, view: false },
    { userId: 99, role: "member", assignment: "owner", state: "DRAFT", side: null, manage: true, view: true },
    { userId: 99, role: "member", assignment: "co_owner", state: "DRAFT", side: null, manage: true, view: true },
    { userId: 99, role: "admin", assignment: null, state: "DRAFT", side: null, manage: true, view: true },
    { userId: 99, role: "member", assignment: "observer", state: "DRAFT", side: null, manage: false, view: false },
  ]) {
    assert.deepEqual(getMatchVisibility({ userId: row.userId, role: row.role }, { status: row.state, players: [...players, { memberId: null, side: "red" }], tournament: { admins: row.assignment ? [{ role: row.assignment }] : [] } }), { ownSide: row.side, canManage: row.manage, canViewArchive: row.view });
  }
  const detail = await draft.getMatchDetail(30, 20) as { match: { players: typeof players; recognition: unknown; screenshots: unknown[]; consistencyDetails: unknown }; access: { ownSide: string }; eligibleMembers: unknown[] };
  assert.equal(detail.access.ownSide, "red");
  assert.deepEqual(detail.match.players.map((player) => player.id), [101, 102, 103, 104, 105]);
  assert.equal(JSON.stringify(detail).includes("opponent-secret"), false, "no indirect opponent data via recognition, member candidates, or consistency diagnostics");
  assert.equal(detail.match.recognition, null);
  assert.deepEqual(detail.match.screenshots, []);
  assert.deepEqual(detail.eligibleMembers, []);
  assert.equal(detail.match.consistencyDetails, null);
  const submittedRows = await draft.listTournamentMatches(30) as Array<{ ownSide: string; canViewArchive: boolean }>;
  assert.equal(submittedRows[0].canViewArchive, true);
  assert.equal(submittedRows[0].ownSide, "red");
  status = "DRAFT";
  const draftRows = await draft.listTournamentMatches(30) as Array<Record<string, unknown>>;
  assert.deepEqual(draftRows[0], { id: 20, playedAt: timestamp, status: "DRAFT", ownSide: "red", canViewArchive: false, winnerSide: null, redTotalKills: null, blueTotalKills: null, consistencyStatus: "PENDING", submittedAt: null, _count: { screenshots: 0, players: 0, combatPosts: 0 } });
  for (const role of ["owner", "co_owner"]) {
    adminRole = role;
    const manager = await draft.getMatchDetail(30, 20) as { match: { players: unknown[] }; access: { canManage: boolean } };
    assert.equal(manager.access.canManage, true);
    assert.equal(manager.match.players.length, 10);
  }
  adminRole = "observer";
  await assert.rejects(() => access.requireMatchViewer(30, 20), /FORBIDDEN/, "unrecognized assignment is not a manager");
  adminRole = null;
  actor.role = "admin";
  actor.userId = 99;
  const admin = await draft.getMatchDetail(30, 20) as { access: { ownSide: unknown }; match: { players: unknown[] } };
  assert.equal(admin.access.ownSide, null);
  assert.equal(admin.match.players.length, 10);
  await assert.rejects(() => tactics.getTacticRoom(30, 20, "red"), /FORBIDDEN/, "global admin must belong to tactic side");
  actor.userId = 1;
  await assert.rejects(() => tactics.getTacticRoom(30, 20, "blue"), /FORBIDDEN/, "global admin cannot open opponent tactics");
  for (const method of ["createTacticLayer", "updateTacticLayer", "deleteTacticLayer", "saveOwnTacticRoute", "deleteOwnTacticRoute", "createOwnTacticMarker", "updateOwnTacticMarker", "deleteOwnTacticMarker"]) {
    await assert.rejects(() => tactics[method](30, 20, "blue", 1, {}), /FORBIDDEN/, `${method} cannot bypass own-side access`);
  }
  for (const role of ["admin", "member"]) {
    actor.role = role;
    status = "DRAFT";
    await tactics.getTacticRoom(30, 20, "red");
    const privateLayers = (lastRoomQuery?.include?.layers as { include: { routes: { where: unknown }; markers: { where: unknown } } }).include;
    assert.deepEqual(privateLayers.routes.where, { ownerMemberId: 1 });
    assert.deepEqual(privateLayers.markers.where, { ownerMemberId: 1 });
    status = "SUBMITTED";
    await tactics.getTacticRoom(30, 20, "red");
    const sharedLayers = (lastRoomQuery?.include?.layers as { include: { routes: { where: unknown }; markers: { where: unknown } } }).include;
    assert.equal(sharedLayers.routes.where, undefined);
    assert.equal(sharedLayers.markers.where, undefined);
  }
  await assert.rejects(() => records.createMatchDispute(30, 20, { matchPlayerId: 106, field: "score", message: "please verify score" }), /FORBIDDEN/, "opponent disputes cannot capture hidden currentValue");
  assert.equal(disputeWrites, 0);
  await records.createMatchDispute(30, 20, { matchPlayerId: 102, field: "score", message: "please verify score" });
  assert.equal(disputeWrites, 1, "own teammate dispute remains available");
  const generalDispute = await records.createMatchDispute(30, 20, { field: "score", message: "please verify overall score" }) as { currentValue: unknown };
  assert.equal(String(generalDispute.currentValue), "Prisma.JsonNull", "general disputes must not implicitly copy the first player's score");
  actor.userId = 99;
  await assert.rejects(() => records.createMatchDispute(30, 20, { message: "please verify score" }), /FORBIDDEN/);
  console.log("Match visibility and actual service authorization/response tests passed (database isolated).");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
