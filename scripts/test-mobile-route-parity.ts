import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

async function pages(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => entry.isDirectory() ? pages(join(root, entry.name)) : entry.name === "page.tsx" ? [dirname(join(root, entry.name))] : []))).flat();
}
async function main(): Promise<void> {
  const appRoot = join(process.cwd(), "src", "app");
  const allPages = await pages(appRoot);
  const desktop = allPages.filter((path) => !relative(appRoot, path).split(sep).includes("m")).map((path) => relative(appRoot, path).split(sep).join("/") || ".").sort();
  const mobileRoot = join(appRoot, "m");
  const mobile = allPages.filter((path) => path === mobileRoot || path.startsWith(`${mobileRoot}${sep}`)).map((path) => relative(mobileRoot, path).split(sep).join("/") || ".").sort();
  assert.deepEqual(mobile, desktop, "mobile UA redirect requires every desktop page to have a matching /m alias");
  console.log(`Mobile route parity tests passed (${desktop.length} page routes).`);
}

void main();