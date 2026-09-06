import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

interface Rule {
  root: string;
  forbidden: readonly string[];
  forbiddenDirectories: readonly string[];
  forbiddenSourcePatterns?: readonly { pattern: RegExp; message: string }[];
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const rules: Rule[] = [
  { root: "src/core", forbidden: ["@/app", "@/features", "@/lib", "@/web", "react", "next", "@prisma", "ioredis", "iron-session", "node:"], forbiddenDirectories: ["src/app", "src/features", "src/lib", "src/web"] },
  { root: "src/features", forbidden: ["@/app", "@/web"], forbiddenDirectories: ["src/app", "src/web"] },
  {
    root: "src/web",
    forbidden: ["@/app", "@/lib"],
    forbiddenDirectories: ["src/app", "src/lib"],
    forbiddenSourcePatterns: [
      { pattern: /\bfetch\s*\(/, message: "direct fetch is forbidden; call a feature client API" },
      { pattern: /\bzIndex\s*:\s*\d+/, message: "numeric z-index is forbidden; use a semantic layer token" },
    ],
  },
];

async function listSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  }))).flat();
}

function importedModules(source: string, file: string): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const modules: string[] = [];
  const add = (node: ts.Expression | undefined) => {
    if (node && ts.isStringLiteralLike(node)) modules.push(node.text);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return modules;
}

function isForbidden(specifier: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => specifier === prefix || specifier.startsWith(prefix.endsWith(":") ? prefix : `${prefix}/`));
}

function isWithin(path: string, root: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (!relation.startsWith("..") && !relation.includes(`..${sep}`));
}

function hasForbiddenRelativeTarget(file: string, specifier: string, directories: readonly string[]): boolean {
  if (!specifier.startsWith(".")) return false;
  const target = resolve(dirname(file), specifier);
  return directories.some((directory) => isWithin(target, resolve(directory)));
}

function normalized(path: string): string {
  return relative(process.cwd(), path).split(sep).join("/");
}

async function checkRule(rule: Rule): Promise<string[]> {
  const files = await listSourceFiles(rule.root);
  return (await Promise.all(files.map(async (file) => {
    const source = await readFile(file, "utf8");
    const violations: string[] = [];
    for (const forbidden of rule.forbiddenSourcePatterns ?? []) {
      if (forbidden.pattern.test(source)) violations.push(`${normalized(file)}: ${forbidden.message}`);
    }
    for (const specifier of importedModules(source, file)) {
      if (isForbidden(specifier, rule.forbidden) || hasForbiddenRelativeTarget(file, specifier, rule.forbiddenDirectories)) {
        violations.push(`${normalized(file)}: forbidden import "${specifier}"`);
      }
    }
    return violations;
  }))).flat();
}

async function checkClientServerImports(): Promise<string[]> {
  const files = await listSourceFiles("src");
  return (await Promise.all(files.map(async (file) => {
    const source = await readFile(file, "utf8");
    const path = normalized(file);
    const clientOwned = /^\s*["']use client["'];/m.test(source) || /(^|\/)client(\/|$)/.test(path);
    if (!clientOwned) return [];
    return importedModules(source, file).flatMap((specifier) => {
      const aliasServer = /(^|\/)server(\/|$)/.test(specifier);
      const relativeServer = specifier.startsWith(".") && /(^|\/)server(\/|$)/.test(resolve(dirname(file), specifier).split(sep).join("/"));
      return aliasServer || relativeServer ? [`${path}: client module imports server module "${specifier}"`] : [];
    });
  }))).flat();
}

async function checkApiRouteDataAccess(): Promise<string[]> {
  const baseline = JSON.parse(await readFile("scripts/architecture-route-db-baseline.json", "utf8")) as unknown;
  if (!Array.isArray(baseline) || baseline.some((item) => typeof item !== "string")) return ["scripts/architecture-route-db-baseline.json: invalid baseline"];
  const expected = new Set(baseline as string[]);
  const files = (await listSourceFiles("src/app/api")).filter((file) => file.endsWith(`${sep}route.ts`));
  const actual = new Set<string>();
  for (const file of files) {
    const imports = importedModules(await readFile(file, "utf8"), file);
    if (imports.some((specifier) => specifier === "@/lib/db" || specifier === "@prisma/client" || (specifier.startsWith(".") && resolve(dirname(file), specifier) === resolve("src/lib/db")))) actual.add(normalized(file));
  }
  return [
    ...[...actual].filter((path) => !expected.has(path)).map((path) => `${path}: API route adds direct Prisma/database access; move the use case to features/server`),
    ...[...expected].filter((path) => !actual.has(path)).map((path) => `scripts/architecture-route-db-baseline.json: remove resolved route debt "${path}"`),
  ];
}

async function checkCronEntry(): Promise<string[]> {
  const file = "scripts/cron.ts";
  return importedModules(await readFile(file, "utf8"), file).filter((specifier) => specifier !== "@/features/cron/worker").map((specifier) => `${file}: cron entry must only import the feature worker, found "${specifier}"`);
}

async function main(): Promise<void> {
  const violations = (await Promise.all([...rules.map(checkRule), checkClientServerImports(), checkApiRouteDataAccess(), checkCronEntry()])).flat().sort();
  if (violations.length > 0) {
    console.error("Architecture boundary violations:");
    violations.forEach((violation) => console.error(`- ${violation}`));
    process.exitCode = 1;
    return;
  }
  console.log("Architecture boundaries are valid, including AST imports, client/server separation, and API route data-access debt.");
}

void main();