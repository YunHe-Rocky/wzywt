import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

interface Rule {
  root: string;
  forbidden: readonly string[];
  forbiddenDirectories: readonly string[];
  forbiddenSourcePatterns?: readonly { pattern: RegExp; message: string }[];
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const rules: Rule[] = [
  {
    root: "src/core",
    forbidden: [
      "@/app",
      "@/features",
      "@/lib",
      "@/web",
      "react",
      "next",
      "@prisma",
      "ioredis",
      "iron-session",
      "node:",
    ],
    forbiddenDirectories: ["src/app", "src/features", "src/lib", "src/web"],
  },
  {
    root: "src/features",
    forbidden: ["@/app", "@/web"],
    forbiddenDirectories: ["src/app", "src/web"],
  },
  {
    root: "src/web",
    forbidden: ["@/app", "@/lib"],
    forbiddenDirectories: ["src/app", "src/lib"],
    forbiddenSourcePatterns: [
      {
        pattern: /\bfetch\s*\(/,
        message: "direct fetch is forbidden; call a feature client API",
      },
      {
        pattern: /\bzIndex\s*:\s*\d+/,
        message: "numeric z-index is forbidden; use a semantic layer token",
      },
    ],
  },
];

const importPattern =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

async function listSourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return listSourceFiles(path);
      return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
    }),
  );
  return nested.flat();
}

function isForbidden(specifier: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      specifier === prefix ||
      specifier.startsWith(prefix.endsWith(":") ? prefix : `${prefix}/`),
  );
}

function isWithin(path: string, root: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (!relation.startsWith("..") && !relation.includes(`..${sep}`));
}

function hasForbiddenRelativeTarget(
  file: string,
  specifier: string,
  directories: readonly string[],
): boolean {
  if (!specifier.startsWith(".")) return false;
  const target = resolve(dirname(file), specifier);
  return directories.some((directory) => isWithin(target, resolve(directory)));
}

async function checkRule(rule: Rule): Promise<string[]> {
  const files = await listSourceFiles(rule.root);
  const violations: string[] = [];

  await Promise.all(
    files.map(async (file) => {
      const source = await readFile(file, "utf8");
      for (const forbidden of rule.forbiddenSourcePatterns ?? []) {
        if (forbidden.pattern.test(source)) {
          violations.push(
            `${relative(process.cwd(), file).split(sep).join("/")}: ${forbidden.message}`,
          );
        }
      }
      importPattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = importPattern.exec(source)) !== null) {
        const specifier = match[1];
        if (
          isForbidden(specifier, rule.forbidden) ||
          hasForbiddenRelativeTarget(file, specifier, rule.forbiddenDirectories)
        ) {
          violations.push(
            `${relative(process.cwd(), file).split(sep).join("/")}: forbidden import "${specifier}"`,
          );
        }
      }
    }),
  );

  return violations;
}

async function checkCronEntry(): Promise<string[]> {
  const file = "scripts/cron.ts";
  const source = await readFile(file, "utf8");
  const violations: string[] = [];
  importPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier !== "@/features/cron/worker") {
      violations.push(`${file}: cron entry must only import the feature worker, found "${specifier}"`);
    }
  }
  return violations;
}

async function main(): Promise<void> {
  const violations = (
    await Promise.all([...rules.map(checkRule), checkCronEntry()])
  ).flat().sort();
  if (violations.length > 0) {
    console.error("Architecture boundary violations:");
    violations.forEach((violation) => console.error(`- ${violation}`));
    process.exitCode = 1;
    return;
  }
  console.log("Architecture boundaries are valid.");
}

void main();
