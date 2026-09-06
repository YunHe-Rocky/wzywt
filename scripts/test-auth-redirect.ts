import assert from "node:assert/strict";
import {
  loginTransitionRedirect,
  protectedPageLoginRedirect,
  safeAuthRedirect,
} from "../src/features/auth/redirect";

for (const unsafe of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/\n/evil.example", "/\t/evil.example", "/%5cevil.example", "/%2f%2fevil.example", "/a/..//evil.example", "/%00bad", "/%zz", "javascript:alert(1)"]) {
  assert.equal(safeAuthRedirect(unsafe), "/", `reject unsafe return path ${JSON.stringify(unsafe)}`);
}
for (const [input, expected] of [
  ["/me?tab=history#recent", "/me?tab=history#recent"],
  ["/m/me?tab=history", "/m/me?tab=history"],
  ["/heroes/../me?name=%E7%8E%A9%E5%AE%B6", "/me?name=%E7%8E%A9%E5%AE%B6"],
  ["/me?next=https://example.com", "/me?next=https://example.com"],
]) assert.equal(safeAuthRedirect(input), expected);
assert.equal(loginTransitionRedirect("/me?tab=history#recent"), "/me?tab=history&_from=login#recent");
assert.equal(loginTransitionRedirect("/m/me?_from=old"), "/m/me?_from=login");
assert.equal(loginTransitionRedirect("/\\evil.example"), "/?_from=login");
assert.equal(protectedPageLoginRedirect("/me"), "/login?redirect=%2Fme");
assert.equal(protectedPageLoginRedirect("/m/me"), "/m/login?redirect=%2Fm%2Fme");
assert.equal(protectedPageLoginRedirect("/m/me?tab=heroes"), "/m/login?redirect=%2Fm%2Fme%3Ftab%3Dheroes");
console.log("Auth redirects: same-origin paths, URL normalization, query/fragment and hostile inputs passed.");
