import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function shellScripts() {
  return readdirSync(scriptDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && [".sh", ".bash"].includes(extname(entry.name)))
    .map((entry) => resolve(scriptDir, entry.name))
    .sort();
}

const failures = [];
for (const path of shellScripts()) {
  const bytes = readFileSync(path);
  const relativePath = path.slice(repoRoot.length + 1).replaceAll("\\", "/");
  const carriageReturns = bytes.reduce((count, byte) => count + Number(byte === 0x0d), 0);
  if (carriageReturns > 0) {
    failures.push(`${relativePath}: contains ${carriageReturns} carriage-return byte(s); normalize to LF`);
  }
  if (!bytes.includes(0x0a)) {
    failures.push(`${relativePath}: contains no LF newline`);
  }
  if (bytes[0] !== 0x23 || bytes[1] !== 0x21) {
    failures.push(`${relativePath}: must start with a shebang at byte 0`);
  }
}

if (failures.length > 0) {
  console.error("[shell-eol] FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[shell-eol] PASS: ${shellScripts().length} Shell scripts use LF without CR bytes`);
