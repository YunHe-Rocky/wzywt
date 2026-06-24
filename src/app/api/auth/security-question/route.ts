import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, hashPassword } from "@/lib/auth";

const PRESET_QUESTIONS = [
  "你的出生城市是？",
  "你母亲的名字是？",
  "你父亲的名字是？",
  "你第一只宠物的名字是？",
  "你最喜欢的电影角色是？",
  "你的小学名称是？",
  "你最好的朋友的名字是？",
  "你的座右铭是？",
];

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

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { securityQuestion, customQuestion, securityAnswer } = await req.json();

  if (!securityQuestion || !securityAnswer) {
    return NextResponse.json({ error: "请填写所有字段" }, { status: 400 });
  }

  let finalQuestion: string;
  if (securityQuestion === "__custom__") {
    if (!customQuestion || customQuestion.trim().length < 2) {
      return NextResponse.json({ error: "请填写自定义安全问题" }, { status: 400 });
    }
    finalQuestion = customQuestion.trim();
  } else if (!PRESET_QUESTIONS.includes(securityQuestion)) {
    return NextResponse.json({ error: "无效的安全问题" }, { status: 400 });
  } else {
    finalQuestion = securityQuestion;
  }

  const securityAnswerHash = await hashPassword(securityAnswer.trim());

  await prisma.user.update({
    where: { id: userId },
    data: { securityQuestion: finalQuestion, securityAnswerHash },
  });

  return NextResponse.json({ ok: true, question: finalQuestion });
}
