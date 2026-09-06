import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";
const mobile = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
function response(path: string, ua: string) {
  return middleware(new NextRequest(`https://arena.example${path}`, { headers: { "user-agent": ua } }));
}

function proxiedResponse(path: string, ua: string) {
  return middleware(new NextRequest(`https://localhost:8001${path}`, {
    headers: {
      "host": "ywt.yunhe.ink",
      "user-agent": ua,
      "x-forwarded-proto": "https",
    },
  }));
}

assert.equal(response("/heroes?role=mid", mobile).headers.get("location"), "https://arena.example/m/heroes?role=mid");
assert.equal(response("/m/heroes?role=mid", desktop).headers.get("location"), "https://arena.example/heroes?role=mid");
assert.equal(response("/m", desktop).headers.get("location"), "https://arena.example/");
assert.equal(proxiedResponse("/?entry=home", mobile).headers.get("location"), "https://ywt.yunhe.ink/m?entry=home");
assert.equal(proxiedResponse("/m/heroes?role=mid", desktop).headers.get("location"), "https://ywt.yunhe.ink/heroes?role=mid");
assert.equal(response("/monitor", desktop).headers.get("location"), null);
assert.equal(response("/m/heroes", mobile).headers.get("location"), null);
assert.equal(response("/art/arena.webp", mobile).headers.get("location"), null);
assert.equal(response("/api/heroes", mobile).headers.get("location"), null);
console.log("Device routing tests passed: bidirectional redirects, query preservation, exact /m prefix and static assets.");
