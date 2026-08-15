export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { normalizeTournamentDraft, TournamentValidationError } from "@/features/tournaments/model";
import { tryReadJsonRequest } from "@/lib/request-validation";
import { listTournamentLobbyForUser } from "@/features/tournaments/server/list";

function generateCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export async function GET() {
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账户已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;

  return NextResponse.json(await listTournamentLobbyForUser(userId));
}

export async function POST(req: NextRequest) {
  const auth = await authenticate();
  if (!auth.ok) return NextResponse.json({ error: auth.code === "BANNED" ? "账户已被封禁" : "请先登录" }, { status: auth.code === "BANNED" ? 403 : 401 });
  const { userId } = auth.user;

  const parsedBody = await tryReadJsonRequest<Record<string, unknown>>(req);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.value;

  let draft;
  try {
    draft = normalizeTournamentDraft(body);
  } catch (error) {
    if (error instanceof TournamentValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const tournament = await prisma.tournament.create({
        data: {
          name: draft.name!,
          code: generateCode(),
          deadline: draft.deadline!,
          isPublic: draft.isPublic!,
          announcement: draft.announcement ?? null,
          admins: { create: { userId, role: "owner" } },
          players: { create: { userId, isSpectator: false } },
        },
        include: { admins: true, _count: { select: { players: true } } },
      });
      return NextResponse.json({ tournament });
    } catch (error) {
      const codeCollision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!codeCollision || attempt === 4) throw error;
    }
  }
  throw new Error("unreachable");
}
