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

function versionNum(v: string): number[] {
  return v.replace(/^V/i, "").split(".").map(Number);
}

function compareVersion(a: string, b: string): number {
  const pa = versionNum(a), pb = versionNum(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] || 0) - (pa[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const dir = join(process.cwd(), "data", "announcements");

  if (!existsSync(dir)) {
    return NextResponse.json({ announcements: [] });
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

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
    let rawTitle = titleMatch ? titleMatch[1] : slug.replace(/-/g, " ");
    let version: string | null = null;

    const versionMatch = rawTitle.match(/^(V\d+\.\d+\.\d+)\s*[—\-—]\s*(.+)/);
    if (versionMatch) {
      version = versionMatch[1];
      rawTitle = versionMatch[2];
    }

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

  // Sort: by version descending, then by date descending for unversioned
  announcements.sort((a, b) => {
    if (a.version && b.version) return compareVersion(a.version, b.version);
    if (a.version) return -1;
    if (b.version) return 1;
    return b.date.localeCompare(a.date);
  });

  return NextResponse.json({ announcements });
}
