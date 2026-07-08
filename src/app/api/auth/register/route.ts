export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";

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

export async function POST(req: NextRequest) {
  const { username, securityQuestion, customQuestion, securityAnswer, password, confirmPassword } = await req.json();

  if (!username || !securityQuestion || !securityAnswer || !password || !confirmPassword) {
    return NextResponse.json({ error: "请填写所有字段" }, { status: 400 });
  }

  if (username.length < 2 || password.length < 11) {
    return NextResponse.json({ error: "用户名至少2位，密码至少11位" }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ error: "两次密码不一致" }, { status: 400 });
  }

  // Normalize fullwidth characters in security question (e.g. ？ → ?)
  const normalizeQuestion = (q: string) =>
    q.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  // Validate security question
  let finalQuestion: string;
  if (securityQuestion === "__custom__") {
    if (!customQuestion || customQuestion.trim().length < 2) {
      return NextResponse.json({ error: "请填写自定义安全问题" }, { status: 400 });
    }
    finalQuestion = customQuestion.trim();
  } else if (!PRESET_QUESTIONS.map(normalizeQuestion).includes(normalizeQuestion(securityQuestion))) {
    return NextResponse.json({ error: "无效的安全问题" }, { status: 400 });
  } else {
    finalQuestion = securityQuestion;
  }

  // Check username uniqueness
  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
  }

  // Create user
  const passwordHash = await hashPassword(password);
  const securityAnswerHash = await hashPassword(securityAnswer.trim());

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      securityQuestion: finalQuestion,
      securityAnswerHash,
    },
  });

  // Auto login
  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return NextResponse.json({ id: user.id, username: user.username });
}
