"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResourcePayload } from "@/features/resource-scheduler/model";
import { acquirePageLease, loadPageResource, releasePageLease, renewPageLease } from "./api";

const RENEW_INTERVAL_MS = 30_000;
const AUTH_IDENTITY_CHANGED_EVENT = "wzywt:auth-identity-changed";

export function usePageResources(page: string) {
  const [leaseId, setLeaseId] = useState<string | null>(null);
  const [immediate, setImmediate] = useState<Record<string, ResourcePayload>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const leaseRef = useRef<string | null>(null);
  const protectedLeaseRef = useRef(false);
  const retry = useCallback(() => setGeneration((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let renewTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRenewTimer = () => {
      if (renewTimer) clearTimeout(renewTimer);
      renewTimer = null;
    };
    const clearProtectedData = () => {
      if (!protectedLeaseRef.current) return;
      setImmediate({});
      setLeaseId(null);
    };
    const scheduleRenew = (renew: () => Promise<void>) => {
      clearRenewTimer();
      if (stopped || document.visibilityState === "hidden") return;
      renewTimer = setTimeout(() => void renew(), RENEW_INTERVAL_MS);
    };

    const renew = async (): Promise<void> => {
      const current = leaseRef.current;
      if (stopped || !current) return;
      try {
        const result = await renewPageLease(current);
        if (stopped) return;
        if (!result.ok) {
          if (result.status === 410 || result.data.code === "LEASE_NOT_FOUND") {
            setError("页面资源租约已失效，正在重新连接");
            retry();
            return;
          }
          if (result.status === 401 || result.status === 403) {
            clearProtectedData();
            setError("登录状态已变化，请重新登录或重试");
            return;
          }
          setError(result.data.error || "页面资源续租失败，正在等待恢复");
        } else {
          setError(null);
        }
      } catch {
        if (!stopped) setError("页面资源续租失败，正在等待网络恢复");
      }
      scheduleRenew(renew);
    };

    const acquire = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const { ok, status, data } = await acquirePageLease(page, controller.signal);
        if (stopped || controller.signal.aborted) return;
        if (!ok || !data.lease) {
          if (status === 401 || status === 403) clearProtectedData();
          throw new Error(data.error || "页面资源加载失败");
        }
        leaseRef.current = data.lease.id;
        protectedLeaseRef.current = data.lease.userId !== null;
        setLeaseId(data.lease.id);
        setImmediate(data.immediate ?? {});
        scheduleRenew(renew);
      } catch (cause) {
        if (!stopped && !controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "页面资源加载失败");
        }
      } finally {
        if (!stopped && !controller.signal.aborted) setLoading(false);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        clearRenewTimer();
        return;
      }
      if (leaseRef.current) void renew();
      else retry();
    };
    const handleIdentityChanged = () => {
      if (!protectedLeaseRef.current) return;
      clearProtectedData();
      setError("登录状态已变化，正在清理私有页面缓存");
      retry();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener(AUTH_IDENTITY_CHANGED_EVENT, handleIdentityChanged);
    void acquire();

    return () => {
      stopped = true;
      controller.abort();
      clearRenewTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(AUTH_IDENTITY_CHANGED_EVENT, handleIdentityChanged);
      const current = leaseRef.current;
      leaseRef.current = null;
      protectedLeaseRef.current = false;
      if (current) void releasePageLease(current).catch(() => undefined);
    };
  }, [generation, page, retry]);

  const loadResource = useCallback(async <T,>(resource: string, refresh = false, signal?: AbortSignal): Promise<T> => {
    const current = leaseRef.current;
    if (!current) throw new Error("页面资源租约尚未就绪");
    const { ok, status, data } = await loadPageResource<T>(current, resource, { refresh, signal });
    if (!ok) {
      if (status === 410 || data.code === "LEASE_NOT_FOUND") {
        setError("页面资源租约已失效，正在重新连接");
        retry();
      } else if (status === 401 || status === 403) {
        if (protectedLeaseRef.current) setImmediate({});
        setError("登录状态已变化，请重新登录或重试");
      }
      throw new Error(data.error || "资源加载失败");
    }
    setError(null);
    setImmediate((previous) => ({ ...previous, [resource]: data }));
    return data.data;
  }, [retry]);

  return { leaseId, immediate, loading, error, loadResource, retry };
}