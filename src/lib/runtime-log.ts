import { configureRuntimeLogContext } from "./runtime-logging.mjs";
import { resourceWorkContext } from "./resource-context";
import { requestContext } from "./request-context";
export { runtimeLog, runtimeBootId, redactRuntimeText, installRuntimeConsole } from "./runtime-logging.mjs";

configureRuntimeLogContext(() => ({ taskId: resourceWorkContext.getStore()?.id,
  task: resourceWorkContext.getStore()?.name, requestId: requestContext.getStore()?.requestId }));
