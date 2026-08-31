"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResourceSnapshot } from "@/features/resource-scheduler/model";
import { usePageResources } from "@/features/resource-scheduler/client";
import { getResourceSnapshots, openMonitorEvents, queueMonitorCheck } from "./api";

export interface MonitorLogEntry {
  id: number;
  time: string;
  module: string;
  status: string;
  detail: string;
}

interface MonitorMessage {
  type?: string;
  cycle?: number;
  results?: Array<{ module: string; ok?: boolean; changed?: boolean; detail: string }>;
  modules?: string[];
  events?: Array<{ module: string; action: string; detail: string }>;
}

let nextLogId = 1;

export function useMonitorDashboard() {
  const [logs, setLogs] = useState<MonitorLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastCycle, setLastCycle] = useState(0);
  const [checking, setChecking] = useState(false);
  const [resources, setResources] = useState<ResourceSnapshot[]>([]);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const manualCheckRef = useRef<AbortController | null>(null);
  const { leaseId, error: leaseError } = usePageResources("monitor");

  const addLog = useCallback((module: string, status: string, detail: string) => {
    const time = new Date().toLocaleTimeString("zh-CN");
    setLogs((previous) => [{ id: nextLogId++, time, module, status, detail }, ...previous].slice(0, 200));
  }, []);

  useEffect(() => {
    if (!leaseId) return;
    const events = openMonitorEvents();
    events.onopen = () => setConnected(true);
    events.onerror = () => setConnected(false);
    events.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as MonitorMessage;
        if (message.type === "connected") addLog("system", "connected", "实时连接已建立，监控就绪");
        if (message.type === "monitor-check") {
          if (message.cycle) setLastCycle(message.cycle);
          for (const result of message.results ?? []) addLog(result.module, result.ok === false ? "error" : result.changed ? "changed" : "idle", result.detail);
        }
        if (message.type === "scrape-triggered") for (const moduleName of message.modules ?? []) addLog(moduleName, "scraping", "开始同步数据");
        if (message.type === "scrape-result") {
          for (const result of message.events ?? []) {
            if (result.action === "scrape-done") addLog(result.module, "done", result.detail);
            if (result.action === "scrape-fail") addLog(result.module, "error", result.detail);
          }
        }
        if (message.type === "monitor-idle" && message.cycle) setLastCycle(message.cycle);
      } catch {
        addLog("system", "error", "收到无法识别的实时监控消息");
      }
    };
    return () => {
      events.close();
      manualCheckRef.current?.abort();
    };
  }, [addLog, leaseId]);

  useEffect(() => {
    if (!leaseId) return;
    const controller = new AbortController();
    let refreshing = false;
    const refresh = () => {
      if (refreshing) return;
      refreshing = true;
      void getResourceSnapshots(controller.signal)
        .then(({ ok, data }) => {
          if (controller.signal.aborted) return;
          if (!ok) {
            setResourceError(data.error || "资源状态读取失败，请确认管理员权限");
            return;
          }
          setResourceError(null);
          setResources(data.resources ?? []);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setResourceError(cause instanceof Error ? cause.message : "资源状态读取失败，请稍后重试");
        })
        .finally(() => { refreshing = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [leaseId]);

  const triggerCheck = useCallback(async () => {
    if (manualCheckRef.current) return;
    const controller = new AbortController();
    manualCheckRef.current = controller;
    setChecking(true);
    addLog("system", "manual", "正在提交手动检查");
    try {
      const result = await queueMonitorCheck(controller.signal);
      if (result.ok) addLog("system", "queued", "检查已入队，结果会通过实时连接推送");
      else addLog("system", "error", result.data.error || "手动检查失败，请稍后重试");
    } catch (cause) {
      if (!controller.signal.aborted) addLog("system", "error", cause instanceof Error ? cause.message : "手动检查失败，请稍后重试");
    } finally {
      if (manualCheckRef.current === controller) manualCheckRef.current = null;
      setChecking(false);
    }
  }, [addLog]);

  return { logs, connected, lastCycle, checking, resources, leaseError, resourceError, triggerCheck };
}
