import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repo = resolve(import.meta.dirname, "..");

for (const [mode, signal] of [
  ["script", "SIGINT"], ["script", "SIGTERM"],
  ["require", "SIGINT"], ["require", "SIGTERM"],
]) {
  test(`configured cron runtime keeps the monitored PID and drains on ${signal} (${mode})`, () => {
    const directory = mkdtempSync(join(tmpdir(), "wzywt-cron-runtime-"));
    try {
      // Only replace the worker that starts database/network jobs. Keep the real
      // production entry, TypeScript loader, path aliases and shutdown handlers.
      writeFileSync(join(directory, "worker.ts"), `
        export function startCronWorker() {
          const signal: NodeJS.Signals = ${JSON.stringify(signal)};
          console.log(JSON.stringify({ event: "started", pid: process.pid }));
          setImmediate(() => process.emit(signal));
          return {
            async stop() {
              await new Promise(resolve => setTimeout(resolve, 25));
              console.log(JSON.stringify({ event: "drained", pid: process.pid }));
            },
          };
        }
      `);
      const tsconfig = join(directory, "tsconfig.json");
      writeFileSync(tsconfig, JSON.stringify({
        compilerOptions: {
          baseUrl: directory,
          paths: { "@/features/cron/worker": ["./worker.ts"] },
        },
      }));
      const configuration = spawnSync(process.execPath, ["-e", `
        const app = require('./ecosystem.config.js').apps[1];
        console.log(JSON.stringify({ script: app.script, args: app.args,
          nodeArgs: app.node_args, interpreter: app.interpreter, role: app.env.APP_ROLE }));
      `], {
        cwd: repo,
        env: { ...process.env, APP_DIR: directory },
        encoding: "utf8", windowsHide: true, timeout: 15_000,
      });
      assert.ifError(configuration.error);
      assert.equal(configuration.status, 0, configuration.stderr);
      const app = JSON.parse(configuration.stdout);
      const argumentsOf = (value) => Array.isArray(value) ? value : value ? value.split(/\s+/) : [];
      // Windows npm .bin shims are not JS files. Resolve the equivalent CLI
      // module so the old production command reproduces its extra child PID.
      const entry = app.script === "node_modules/.bin/tsx"
        ? resolve(repo, "node_modules/tsx/dist/cli.mjs") : resolve(repo, app.script);
      // PM2's fork container requires a CommonJS entry; also exercise that
      // loading path, not just direct Node script execution.
      const entryArguments = mode === "require"
        ? ["-e", "require(process.argv[1])", entry] : [entry];
      const runtime = spawnSync(process.execPath, [
        ...argumentsOf(app.nodeArgs), ...entryArguments, ...argumentsOf(app.args),
      ], {
        cwd: repo,
        env: { ...process.env, NODE_ENV: "production", APP_ROLE: app.role, TSX_TSCONFIG_PATH: tsconfig },
        encoding: "utf8", windowsHide: true, timeout: 15_000,
      });
      assert.ifError(runtime.error);
      const output = runtime.stdout.split(/\r?\n/).filter(line => line.startsWith("{")).map(line => JSON.parse(line));
      const events = output.flatMap(entry => {
        if (entry.event !== "service.output") return [entry];
        try { return [JSON.parse(entry.message)]; } catch { return []; }
      }).filter(entry => ["started", "drained"].includes(entry.event));
      assert.ok(output.some(entry => entry.event === "process.boot" && entry.pid === runtime.pid), `boot identity must be logged before worker imports: ${runtime.stdout} ${runtime.stderr}`);
      assert.equal(output[0]?.event, "process.boot");
      assert.equal(output[0]?.role, "cron");
      assert.equal(events[0]?.event, "started", runtime.stdout + runtime.stderr);
      assert.equal(events[0].pid, runtime.pid,
        "PM2 must monitor the actual cron PID, not a tsx launcher that hides child memory");
      assert.equal(runtime.status, 0, runtime.stderr);
      assert.deepEqual(events, [
        { event: "started", pid: runtime.pid },
        { event: "drained", pid: runtime.pid },
      ], "cron must await worker.stop() before exiting");
      assert.match(runtime.stdout, new RegExp(`Received ${signal}, stopping`));
      assert.equal(app.interpreter, "node", "PM2 must not infer ts-node for the .ts entry");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
