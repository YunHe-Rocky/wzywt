import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const registryPath = resolve(root, "docs", "releases", "releases.json");
const packagePath = resolve(root, "package.json");

assert.equal(existsSync(registryPath), true, "release registry must exist at docs/releases/releases.json");

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const packageLock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));

assert.equal(registry.schemaVersion, 1, "release registry schemaVersion must be 1");
assert.equal(registry.project, "wangzhe-yanwutang", "release registry project must match the package name");
assert.ok(Array.isArray(registry.releases) && registry.releases.length > 0, "release registry must contain at least one release");

const versions = new Set();
const internalIds = new Set();
const tags = new Set();
const semverPattern = /^\d+\.\d+\.\d+$/;
const internalIdPattern = /^WZYWT-REL-\d{4}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/;
const commitPattern = /^[0-9a-f]{40}$/;

for (const release of registry.releases) {
  assert.match(release.version, semverPattern, "release version must use x.y.z format");
  assert.match(release.internalId, internalIdPattern, "internal release id must use WZYWT-REL-0001 format");
  assert.ok(["major", "minor", "patch"].includes(release.releaseType), "releaseType must be major, minor or patch");
  assert.match(release.releasedAt, timestampPattern, "releasedAt must include date, time to seconds, and +08:00 offset");
  assert.equal(release.timezone, "Asia/Shanghai", "release timezone must be Asia/Shanghai");
  assert.equal(release.tag, `v${release.version}`, "release tag must match the public version");
  assert.equal(existsSync(resolve(root, "docs", "releases", `v${release.version}.md`)), true, "each registered release needs detailed notes");
  assert.match(release.sourceRange.fromCommit, commitPattern, "source range start must be a full Git commit");
  assert.match(release.sourceRange.toCommit, commitPattern, "source range end must be a full Git commit");
  assert.ok(Array.isArray(release.pullRequests), "pullRequests must be an array");
  assert.ok(Array.isArray(release.summary) && release.summary.length > 0, "release summary must not be empty");

  for (const pullRequest of release.pullRequests) {
    assert.ok(Number.isSafeInteger(pullRequest.number) && pullRequest.number > 0, "PR number must be a positive integer");
    assert.ok(typeof pullRequest.title === "string" && pullRequest.title.length > 0, "PR title must not be empty");
    assert.match(pullRequest.url, /^https:\/\/github\.com\/YunHe-Rocky\/wzywt\/pull\/\d+$/, "PR URL must point to this repository");
    assert.match(pullRequest.mergeCommit, commitPattern, "PR merge commit must be a full Git commit");
  }

  assert.equal(versions.has(release.version), false, `duplicate release version: ${release.version}`);
  assert.equal(internalIds.has(release.internalId), false, `duplicate internal release id: ${release.internalId}`);
  assert.equal(tags.has(release.tag), false, `duplicate release tag: ${release.tag}`);
  versions.add(release.version);
  internalIds.add(release.internalId);
  tags.add(release.tag);
}

const development = registry.currentDevelopment;
if (development !== undefined) {
  assert.match(development.version, semverPattern, "internal version must use x.y.z format");
  assert.match(development.internalId, internalIdPattern, "internal version needs its own release id");
  assert.equal(development.status, "internal", "development version must remain explicitly internal");
  assert.match(development.registeredAt, timestampPattern, "internal registration needs a timestamp with +08:00 offset");
  assert.equal(development.timezone, "Asia/Shanghai");
  assert.equal(development.previousVersion, registry.releases[0].version, "internal version must identify its registered baseline");
  assert.equal(versions.has(development.version), false, "internal version cannot duplicate a registered release");
  assert.equal(internalIds.has(development.internalId), false, "internal version cannot reuse a registered release id");
  assert.equal(existsSync(resolve(root, "docs", "releases", `v${development.version}.md`)), true, "internal version needs detailed notes");
  assert.match(development.source.baseCommit, commitPattern, "internal version needs an honest base commit");
  assert.ok(["working-tree", "committed"].includes(development.source.state), "internal source must describe its actual state");
  if (development.source.state === "committed") assert.match(development.source.commit, commitPattern, "committed internal source needs its actual implementation commit");
  else assert.equal(development.source.commit, undefined, "uncommitted source must not invent an implementation commit");
  assert.equal(development.tag, undefined, "internal registration must not imply a created release tag");
  assert.equal(development.releasedAt, undefined, "internal registration is not a formal release timestamp");
  assert.ok(Array.isArray(development.summary) && development.summary.length > 0, "internal changes must be described");
  const [major, minor, patch] = development.previousVersion.split(".").map(Number);
  const nextVersion = {
    major: `${major + 1}.0.0`,
    minor: `${major}.${minor + 1}.0`,
    patch: `${major}.${minor}.${patch + 1}`,
  }[development.releaseType];
  assert.ok(nextVersion, "internal update type must be major, minor or patch");
  assert.equal(development.version, nextVersion, "version positions must follow major.minor.patch update levels");
}
assert.equal(packageJson.version, development?.version ?? registry.releases[0].version, "package version must match the current internal version or latest registered release");
assert.equal(packageLock.version, packageJson.version, "lockfile version must match the package");
assert.equal(packageLock.packages[""].version, packageJson.version, "lockfile root package version must match the package");
console.log("Release registry tests passed");
