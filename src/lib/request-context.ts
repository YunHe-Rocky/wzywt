import { AsyncLocalStorage } from "node:async_hooks";
interface RequestContext { requestId: string; startedAt: number }
const globalContext = globalThis as unknown as { runtimeRequestContext?: AsyncLocalStorage<RequestContext> };
export const requestContext = globalContext.runtimeRequestContext ??= new AsyncLocalStorage<RequestContext>();
