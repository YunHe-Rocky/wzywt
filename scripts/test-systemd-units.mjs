import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { serviceFiles } from "./runtime-service.mjs";

test("the real systemd parser accepts generated units and rejects the old quoted working directory", {
  skip: process.platform !== "linux" ? "Real systemd unit parsing requires Linux; portable service tests run separately." : false,
}, (t) => {
  const options = { encoding: "utf8", windowsHide: true, timeout: 30_000,
    env: { ...process.env, LC_ALL: "C" } };
  const version = spawnSync("systemd-analyze", ["--version"], options);
  if (version.error?.code === "ENOENT") {
    t.skip("systemd-analyze is not installed; Linux CI explicitly requires it.");
    return;
  }
  assert.ifError(version.error);
  assert.equal(version.status, 0, version.stderr);

  const directory = mkdtempSync(join(tmpdir(), "wzywt systemd parser "));
  try {
    const current = join(directory, "current release");
    const pm2Home = join(directory, "pm2 home");
    const validDirectory = join(directory, "valid");
    const invalidDirectory = join(directory, "invalid");
    for (const path of [current, pm2Home, validDirectory, invalidDirectory]) mkdirSync(path);
    const config = { name: "wzywt-parser-test", user: userInfo().username,
      current, pm2Home, configuration: join(directory, "runtime-service.json"),
      // Verification checks executable paths without running these commands.
      // No PM2 daemon, systemctl action, database or live service is involved.
      pm2: process.execPath, node: process.execPath, webName: "parser-web", cronName: "parser-cron" };
    const files = serviceFiles(config);
    const paths = Object.entries(files).map(([name, content]) => {
      const path = join(validDirectory, name);
      writeFileSync(path, content);
      return path;
    });
    const valid = spawnSync("systemd-analyze", ["verify", "--man=no", ...paths], options);
    assert.ifError(valid.error);
    assert.equal(valid.status, 0, `Generated units failed real systemd verification:\n${valid.stdout}${valid.stderr}`);

    const serviceName = `${config.name}.service`;
    const oldUnit = files[serviceName].replace(/^WorkingDirectory=(.+)$/m, 'WorkingDirectory="$1"');
    assert.notEqual(oldUnit, files[serviceName], "the regression must introduce the old quoted scalar path");
    const invalidPath = join(invalidDirectory, serviceName);
    writeFileSync(invalidPath, oldUnit);
    const invalid = spawnSync("systemd-analyze", ["verify", "--man=no", invalidPath], options);
    assert.ifError(invalid.error);
    assert.notEqual(invalid.status, 0, "systemd must reject the old WorkingDirectory quoting that stopped deployment");
    assert.match(`${invalid.stdout}${invalid.stderr}`, /WorkingDirectory|working directory|not absolute/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
