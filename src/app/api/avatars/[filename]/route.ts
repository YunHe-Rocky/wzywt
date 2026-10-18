import { withRequestCapacity } from "@/lib/request-capacity";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { getAvatarDirectory } from "@/features/profile/server/avatar-storage";
import { avatarFilenamePattern } from "@/features/profile/avatar-file";

async function handleGET(req: NextRequest, props: { params: Promise<{ filename: string }> }) {
  const params = await props.params;
  const filename = params.filename;
  if (!avatarFilenamePattern.test(filename)) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(join(getAvatarDirectory(), filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
    throw error;
  }
  const ext = filename.split(".").pop();
  const contentType = ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg";

  return new NextResponse(Uint8Array.from(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

export const GET = withRequestCapacity(handleGET);
