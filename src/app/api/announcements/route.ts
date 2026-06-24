import { NextRequest, NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

interface Announcement {
  date: string;
  title: string;
  slug: string;
  filename: string;
  content?: string;
}

export async function GET(req: NextRequest) {
  const dir = join(process.cwd(), "data", "announcements");

  if (!existsSync(dir)) {
    return NextResponse.json({ announcements: [] });
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();

  const { searchParams } = new URL(req.url);
  const includeContent = searchParams.get("full") === "true";

  const announcements: Announcement[] = [];

  for (const filename of files) {
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
    if (!dateMatch) continue;

    const date = dateMatch[1];
    const slug = dateMatch[2];
    const content = readFileSync(join(dir, filename), "utf-8");

    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1] : slug.replace(/-/g, " ");

    announcements.push({
      date,
      title,
      slug,
      filename,
      ...(includeContent ? { content: content.replace(/^#\s+.+\n?/, "").trim() } : {}),
    });
  }

  return NextResponse.json({ announcements });
}
