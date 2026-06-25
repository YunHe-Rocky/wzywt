export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface ChangelogEntry {
  slug: string;
  date: string;
  title: string;
  desc: string;
}

const CHANGELOG_DIR = path.join(process.cwd(), "data", "changelog");
const FEATURE_DOC = path.join(process.cwd(), "docs", "superpowers", "specs", "2026-06-23-王者演武堂-功能说明.md");
const TECH_DOC = path.join(process.cwd(), "docs", "superpowers", "specs", "2026-06-23-王者演武堂-技术设计.md");

export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get("slug");
  const type = new URL(req.url).searchParams.get("type") || "features";

  // Single entry detail
  if (slug) {
    const filePath = path.join(CHANGELOG_DIR, `${slug}.md`);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ content: fs.readFileSync(filePath, "utf-8") });
  }

  // Return full doc content for rendering
  if (type === "features") {
    if (!fs.existsSync(FEATURE_DOC)) return NextResponse.json({ content: "" });
    return NextResponse.json({ content: fs.readFileSync(FEATURE_DOC, "utf-8") });
  }
  if (type === "tech") {
    if (!fs.existsSync(TECH_DOC)) return NextResponse.json({ content: "" });
    return NextResponse.json({ content: fs.readFileSync(TECH_DOC, "utf-8") });
  }

  return NextResponse.json({ content: "" });
}
