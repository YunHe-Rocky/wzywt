import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { normalizeAuthUsername, normalizeSecurityAnswer, passwordValidationError, resolveAuthState } from "@/features/auth/model";
import { getRequestIp, normalizeRequestIp } from "@/lib/auth-rate-limit";

function countDestroyCalls(relativePath: string, functionName: string) {
  const absolutePath = path.join(process.cwd(), relativePath);
  const source = ts.createSourceFile(
    absolutePath,
    readFileSync(absolutePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const declaration = source.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === functionName,
  );
  assert.ok(declaration?.body, `${relativePath} must export ${functionName}()`);

  let count = 0;
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "destroy"
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration.body);
  return count;
}

assert.equal(normalizeAuthUsername("  player  "), "player");
assert.equal(normalizeAuthUsername("x"), null);
assert.equal(passwordValidationError("12345678901"), null);
assert.match(passwordValidationError("😀".repeat(19)) || "", /72/);
assert.equal(normalizeSecurityAnswer("  answer  "), "answer");
assert.equal(normalizeRequestIp("::ffff:127.0.0.1"), "127.0.0.1");
assert.equal(getRequestIp(new Headers({ "x-real-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.9" })), "203.0.113.8");
assert.equal(getRequestIp(new Headers({ "x-forwarded-for": "198.51.100.9" })), "unknown");

const deleted = resolveAuthState(
  { userId: 7, sessionVersion: 2 },
  { id: 7, username: "deleted-7", role: "user", banned: true, isTemporary: true, sessionVersion: 2, deletedAt: new Date() },
);
assert.deepEqual(deleted, { ok: false, code: "UNAUTHORIZED" }, "deactivated accounts must not authenticate");

// Authentication reads must fail closed without mutating the browser cookie.
// Otherwise a late response from an old tab can delete a newly issued session.
assert.equal(countDestroyCalls("src/lib/auth.ts", "requireAuth"), 0);
assert.equal(countDestroyCalls("src/app/api/auth/me/route.ts", "GET"), 0);

// Explicit user-authorized session termination still has to clear the cookie.
assert.equal(countDestroyCalls("src/app/api/auth/logout/route.ts", "POST"), 1);
assert.equal(countDestroyCalls("src/app/api/auth/me/route.ts", "DELETE"), 1);

console.log("Auth session contract tests passed");
