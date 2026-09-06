import assert from "node:assert/strict";
import {
  assertTaskWriteAllowed,
  runWithTaskWriteFence,
  TaskWriteFenceError,
  type TaskWriteFence,
} from "../src/lib/task-write-fence";

async function main(): Promise<void> {
  assert.doesNotThrow(() => assertTaskWriteAllowed());

  const activeController = new AbortController();
  const activeFence: TaskWriteFence = {
    name: "active",
    token: "active-token",
    expiresAt: 2_000,
    signal: activeController.signal,
  };
  await runWithTaskWriteFence(activeFence, async () => {
    assert.doesNotThrow(() => assertTaskWriteAllowed(1_999));
    assert.throws(() => assertTaskWriteAllowed(2_000), TaskWriteFenceError);
  });

  const abortedController = new AbortController();
  abortedController.abort();
  await runWithTaskWriteFence({
    name: "aborted",
    token: "aborted-token",
    expiresAt: Number.MAX_SAFE_INTEGER,
    signal: abortedController.signal,
  }, async () => {
    assert.throws(() => assertTaskWriteAllowed(0), TaskWriteFenceError);
  });

  console.log("Task write fence tests passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
