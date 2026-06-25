// 将 data/announcements/*.md 迁移到数据库
import { PrismaClient } from "@prisma/client";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();
const dir = join(process.cwd(), "data", "announcements");

async function main() {
  if (!existsSync(dir)) {
    console.log("[migrate] No legacy announcements directory, skipping.");
    return;
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    console.log("[migrate] No markdown files to migrate.");
    return;
  }

  for (const f of files) {
    const match = f.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
    if (!match) continue;

    const date = match[1];
    const slug = match[2];
    const content = readFileSync(join(dir, f), "utf-8");

    // Parse frontmatter-like title
    const titleMatch = content.match(/^#\s+(.+)/m);
    let title = titleMatch ? titleMatch[1] : slug.replace(/-/g, " ");
    let version: string | null = null;

    // Extract version string: "V1.0.0 — Title" or "V1.0.0 - Title"
    const vMatch = title.match(/^(V\d+\.\d+\.\d+)\s*[—\-—]\s*(.+)/);
    if (vMatch) {
      version = vMatch[1];
      title = vMatch[2];
    }

    // Brief = first paragraph after title
    const body = content.replace(/^#\s+.+\n?/, "").trim();
    const brief = body.split(/\n\s*\n/)[0]?.trim() || title;

    await prisma.announcement.upsert({
      where: { slug },
      create: { title, version, brief, content: body, slug },
      update: { title, version, brief, content: body },
    });

    console.log(`[migrate] ${slug} — ${title}`);
  }

  console.log(`[migrate] Done: ${files.length} announcements migrated`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
