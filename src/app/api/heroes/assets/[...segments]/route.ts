import { withRequestCapacity } from "@/lib/request-capacity";
import { readHeroAsset } from "@/features/heroes/server/assets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handleGET(_request: Request, context: { params: Promise<{ segments: string[] }> }) {
  const { segments } = await context.params;
  const data = await readHeroAsset(segments);
  if (!data) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(data, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(data.byteLength),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = withRequestCapacity(handleGET);
