import assert from "node:assert/strict";
import { test } from "node:test";
import { databaseUrl, healthyHeartbeat, runtimeEnvironment } from "./runtime-env.mjs";

test("database credentials preserve reserved characters without changing host/database", () => {
  const credentials = { MYSQL_USER: "user@name", MYSQL_PASSWORD: "p@ss:/#?% word", MYSQL_DATABASE: "db-name" };
  const parsed = new URL(databaseUrl(credentials));
  assert.equal(parsed.hostname, "mysql");
  assert.equal(decodeURIComponent(parsed.username), credentials.MYSQL_USER);
  assert.equal(decodeURIComponent(parsed.password), credentials.MYSQL_PASSWORD);
  assert.equal(parsed.pathname, "/db-name");
  assert.equal(parsed.searchParams.get("connect_timeout"), "5");
  assert.throws(() => databaseUrl({ ...credentials, MYSQL_HOST: "mysql/other" }));
  assert.throws(() => databaseUrl({ ...credentials, MYSQL_PORT: "65536" }));
  assert.throws(() => databaseUrl({ MYSQL_USER: "user" }));
});

test("invalid adaptive limits are rejected before a container starts", () => {
  const base = { DATABASE_URL: "mysql://fixture:fixture@localhost/db" };
  assert.throws(() => runtimeEnvironment({ ...base, RESOURCE_INTERNAL_CONCURRENCY: "0" }), /RESOURCE_INTERNAL_CONCURRENCY/);
  assert.throws(() => runtimeEnvironment({ ...base, RESOURCE_EXTERNAL_RPS: "NaN" }), /RESOURCE_EXTERNAL_RPS/);
  assert.throws(() => runtimeEnvironment({ ...base, RESOURCE_WEB_MEMORY_MB: "8" }), /RESOURCE_WEB_MEMORY_MB/);
  assert.equal(runtimeEnvironment(base).DATABASE_URL, base.DATABASE_URL);
});

test("cron readiness requires a fresh current-release heartbeat from this container lifetime", () => {
  const beat = (timestamp, releaseId = "release-a") => JSON.stringify({ version: 1, releaseId, timestamp });
  assert.equal(healthyHeartbeat(beat(200_000), "release-a", 199_000, 250_000), true);
  assert.equal(healthyHeartbeat(beat(198_000), "release-a", 199_000, 250_000), false);
  assert.equal(healthyHeartbeat(beat(200_000), "release-b", 199_000, 250_000), false);
  assert.equal(healthyHeartbeat(beat(100_000), "release-a", 90_000, 250_000), false);
  assert.equal(healthyHeartbeat(beat(260_000), "release-a", 199_000, 250_000), false);
  assert.equal(healthyHeartbeat("null", "release-a", 199_000, 250_000), false);
  assert.equal(healthyHeartbeat("invalid", "release-a", 199_000, 250_000), false);
});
