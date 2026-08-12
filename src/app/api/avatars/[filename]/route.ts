export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const AVATAR_DIR = process.env.AVATAR_DIR || "/data/uploads/avatars";

export async function GET(req: NextRequest, props: { params: Promise<{ filename: string }> }) {
  const params = await props.params;
  const filename = params.filename;
  if (filename.includes("..") || filename.includes("/")) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 });
  }

  const filepath = join(AVATAR_DIR, filename);
  if (!existsSync(filepath)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const buffer = await readFile(filepath);
  const ext = filename.split(".").pop();
  const contentType = ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
