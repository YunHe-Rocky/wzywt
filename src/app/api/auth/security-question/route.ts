import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { securityQuestion: true },
  });

  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  if (!user.securityQuestion) {
    return NextResponse.json({ error: "该账号未设置安全问题，请联系管理员" }, { status: 400 });
  }

  return NextResponse.json({ question: user.securityQuestion });
}
