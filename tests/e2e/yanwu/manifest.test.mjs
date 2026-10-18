import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { YANWU_FAMILIES, encodeRelativeFileUrl, validateYanwuManifest } from "./manifest.mjs";

async function currentRecords() {
  const roots = ["yanwu-public", "yanwu-workspaces", "yanwu-admin"];
  const manifests = await Promise.all(roots.map(async root => JSON.parse(await readFile(path.resolve("test-results", root, "manifest.json"), "utf8"))));
  return manifests.flat();
}

test("the approved matrix has 26 ordered page families", () => {
  assert.deepEqual(YANWU_FAMILIES.map(family => family.id), Array.from({ length: 26 }, (_, index) => String(index + 1).padStart(2, "0")));
});

test("current suite artifacts contain one valid desktop/mobile baseline per family", async () => {
  const result = await validateYanwuManifest(await currentRecords());
  assert.equal(result.baselines.length, 52);
  assert.equal(result.families, 26);
});

test("validation rejects a missing family", async () => {
  const records = (await currentRecords()).filter(record => record.family !== "26");
  await assert.rejects(validateYanwuManifest(records), /Missing 26/);
});

test("validation rejects duplicate baselines", async () => {
  const records = await currentRecords();
  const duplicate = records.find(record => record.family === "01" && record.state === "baseline" && record.profile === "desktop");
  await assert.rejects(validateYanwuManifest([...records, { ...duplicate }]), /Duplicate 01 desktop/);
});

test("validation rejects a missing screenshot", async () => {
  const records = await currentRecords();
  const changed = records.map(record => record.family === "01" && record.state === "baseline" && record.profile === "desktop"
    ? { ...record, file: path.resolve("test-results/yanwu-public/does-not-exist.png") }
    : record);
  await assert.rejects(validateYanwuManifest(changed), /Missing screenshot/);
});

test("gallery URLs encode percent, hash, and spaces within each path segment", () => {
  assert.equal(
    encodeRelativeFileUrl("..\\yanwu public\\zoom-200-percent-%2Fm #proof.png"),
    "../yanwu%20public/zoom-200-percent-%252Fm%20%23proof.png",
  );
});
