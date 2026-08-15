"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResourcePayload } from "@/features/resource-scheduler/model";
import { acquirePageLease, loadPageResource, releasePageLease, renewPageLease } from "./api";

const RENEW_INTERVAL_MS = 30_000;

export function usePageResources(page: string) {
  const [leaseId, setLeaseId] = useState<string | null>(null);
  const [immediate, setImmediate] = useState<Record<string, ResourcePayload>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const leaseRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let renewTimer: ReturnType<typeof setInterval> | null = null;
    setLoading(true);
    setError(null);
    void acquirePageLease(page, controller.signal)
      .then(({ ok, data }) => {
        if (controller.signal.aborted) return;
        if (!ok || !data.lease) throw new Error(data.error || "页面资源加载失败");
        leaseRef.current = data.lease.id;
        setLeaseId(data.lease.id);
        setImmediate(data.immediate ?? {});
        renewTimer = setInterval(() => {
          const current = leaseRef.current;
          if (!current) return;
          void renewPageLease(current).then(({ ok }) => {
            if (!ok) setError("页面资源租约已失效，请刷新页面");
          }).catch(() => setError("页面资源续租失败，正在等待恢复"));
        }, RENEW_INTERVAL_MS);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "页面资源加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
      if (renewTimer) clearInterval(renewTimer);
      const current = leaseRef.current;
      leaseRef.current = null;
      if (current) void releasePageLease(current).catch(() => undefined);
    };
  }, [page]);

  const loadResource = useCallback(async <T,>(resource: string, refresh = false, signal?: AbortSignal): Promise<T> => {
    const current = leaseRef.current;
    if (!current) throw new Error("页面资源租约尚未就绪");
    const { ok, data } = await loadPageResource<T>(current, resource, { refresh, signal });
    if (!ok) throw new Error(data.error || "资源加载失败");
    setImmediate((previous) => ({ ...previous, [resource]: data }));
    return data.data;
  }, []);

  return { leaseId, immediate, loading, error, loadResource };
}
