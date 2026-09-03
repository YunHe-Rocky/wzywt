import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

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

// Authentication reads must fail closed without mutating the browser cookie.
// Otherwise a late response from an old tab can delete a newly issued session.
assert.equal(countDestroyCalls("src/lib/auth.ts", "requireAuth"), 0);
assert.equal(countDestroyCalls("src/app/api/auth/me/route.ts", "GET"), 0);

// Explicit user-authorized session termination still has to clear the cookie.
assert.equal(countDestroyCalls("src/app/api/auth/logout/route.ts", "POST"), 1);
assert.equal(countDestroyCalls("src/app/api/auth/me/route.ts", "DELETE"), 1);

console.log("Auth session contract tests passed");
