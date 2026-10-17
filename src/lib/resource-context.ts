import { AsyncLocalStorage } from "node:async_hooks";

export interface ResourceWorkContext { id: string; name: string; signal: AbortSignal; phase?: string; phaseAt?: number; assertLease(): void }
const globalContext = globalThis as unknown as { resourceWorkContext?: AsyncLocalStorage<ResourceWorkContext> };
export const resourceWorkContext = globalContext.resourceWorkContext ??= new AsyncLocalStorage<ResourceWorkContext>();
export function assertResourceWorkAllowed(): void {
  const context = resourceWorkContext.getStore();
  if (!context) return;
  if (context.signal.aborted) throw context.signal.reason || new Error("RESOURCE_WORK_ABORTED");
  context.assertLease();
}
