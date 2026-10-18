import { tryParseRouteId } from "@/lib/request-validation";
import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { authorizeSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

async function handleGET(req: NextRequest) {
  const authorization = await authorizeSuperAdmin();
  const userId = authorization.ok ? authorization.user.userId : 0;
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = tryParseRouteId(searchParams.get("page") || "1", "页码");
  if (page instanceof NextResponse) return page;
  if (page > 10000) return NextResponse.json({ error: "页码不能超过 10000" }, { status: 400 });
  const pageSize = 20;
  const search = searchParams.get("search") || "";
  if (search.length > 64) return NextResponse.json({ error: "搜索内容不能超过 64 字" }, { status: 400 });

  const where: Prisma.UserWhereInput = {
    isTemporary: false,
    ...(search ? { username: { contains: search } } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        role: true,
        banned: true,
        avatar: true,
        createdAt: true,
        _count: { select: { tournamentPlayers: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    users,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

export const GET = withRequestCapacity(handleGET);
