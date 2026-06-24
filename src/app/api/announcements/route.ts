import { NextRequest, NextResponse } from "next/server";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

interface Announcement {
  date: string;
  title: string;
  version: string | null;
  brief: string;
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

    // Parse title line: "# V1.0.0 — Title" or "# Title"
    const titleMatch = content.match(/^#\s+(.+)/m);
    let rawTitle = titleMatch ? titleMatch[1] : slug.replace(/-/g, " ");
    let version: string | null = null;

    // Extract version from title like "V1.0.0 — Something"
    const versionMatch = rawTitle.match(/^(V\d+\.\d+\.\d+)\s*[—\-—]\s*(.+)/);
    if (versionMatch) {
      version = versionMatch[1];
      rawTitle = versionMatch[2];
    }

    // Extract brief: first non-empty paragraph after the title (before any ## heading or ---)
    const bodyWithoutTitle = content.replace(/^#\s+.+\n?/, "").trim();
    const briefMatch = bodyWithoutTitle.match(/^([\s\S]+?)(?:\n\s*\n|\n##|\n---)/);
    const brief = briefMatch ? briefMatch[1].trim() : bodyWithoutTitle.split("\n")[0]?.trim() || rawTitle;

    announcements.push({
      date,
      title: rawTitle,
      version,
      brief,
      slug,
      filename,
      ...(includeContent ? { content: bodyWithoutTitle } : {}),
    });
  }

  return NextResponse.json({ announcements });
}
