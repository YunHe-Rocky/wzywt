import { makeMonitorFixture } from "./workspace-fixtures";
const params = new URLSearchParams(location.search);
const monitor = makeMonitorFixture(Number(params.get("owner") || 1));
export function usePageResources(name: string) {
  if (name !== "monitor") throw new Error(`Unknown admin resource page: ${name}`);
  return {
    leaseId: params.get("case") === "lease-error" ? null : monitor.leaseId,
    immediate: {}, loading: false,
    error: params.get("case") === "lease-error" ? "测试：监控租约不可用" : null,
    loadResource: async (resource: string) => { throw new Error(`Unknown admin resource: ${resource}`); },
    retry: () => undefined,
  };
}
