import { AsyncLocalStorage } from "node:async_hooks";
import { assertResourceWorkAllowed } from "./resource-context";

export interface TaskWriteFence {
  readonly name: string;
  readonly token: string;
  expiresAt: number;
  readonly signal: AbortSignal;
}

export class TaskWriteFenceError extends Error {
  constructor(public readonly taskName: string, message = "TASK_LEASE_LOST") {
    super(message);
    this.name = "TaskWriteFenceError";
  }
}

const globals = globalThis as unknown as { taskFenceContext?: AsyncLocalStorage<TaskWriteFence> };
const storage = globals.taskFenceContext ??= new AsyncLocalStorage<TaskWriteFence>();

export function runWithTaskWriteFence<T>(fence: TaskWriteFence, operation: () => Promise<T>): Promise<T> {
  return storage.run(fence, operation);
}

export function assertTaskWriteAllowed(now = Date.now()): void {
  const fence = storage.getStore();
  if (!fence) return;
  assertResourceWorkAllowed();
  if (fence.signal.aborted || now >= fence.expiresAt) {
    throw new TaskWriteFenceError(fence.name);
  }
}
