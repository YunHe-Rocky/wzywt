import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const registryPath = resolve(root, "docs", "releases", "releases.json");
const packagePath = resolve(root, "package.json");

assert.equal(existsSync(registryPath), true, "release registry must exist at docs/releases/releases.json");

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

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
  assert.ok(["major", "minor"].includes(release.releaseType), "releaseType must be major or minor");
  assert.match(release.releasedAt, timestampPattern, "releasedAt must include date, time to seconds, and +08:00 offset");
  assert.equal(release.timezone, "Asia/Shanghai", "release timezone must be Asia/Shanghai");
  assert.equal(release.tag, `v${release.version}`, "release tag must match the public version");
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

assert.equal(packageJson.version, registry.releases[0].version, "package version must match the latest registered release");
console.log("Release registry tests passed");
