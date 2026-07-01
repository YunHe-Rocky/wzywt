export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get("slug");

  // Single entry: try DB first, fallback to files
  if (slug) {
    const db = await prisma.announcement.findUnique({ where: { slug } });
    if (db && db.published) {
      const md = [
        `# ${db.title}`,
        "",
        `**日期**：${db.createdAt.toISOString().split("T")[0]}`,
        `**概述**：${db.brief}`,
        "",
        db.content || "",
      ].join("\n");
      return NextResponse.json({ content: md });
    }
    // Fallback: local file
    const fp = path.join(process.cwd(), "data", "changelog", `${slug}.md`);
    if (fs.existsSync(fp)) {
      return NextResponse.json({ content: fs.readFileSync(fp, "utf-8") });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // List: return all published announcements
  const list = await prisma.announcement.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
    select: { title: true, version: true, brief: true, slug: true, createdAt: true },
  });

  return NextResponse.json({
    entries: list.map((a) => ({
      slug: a.slug,
      date: a.createdAt.toISOString().split("T")[0],
      title: a.title,
      version: a.version,
      desc: a.brief,
    })),
  });
}
