"use client";
import { apiRequest, jsonRequest } from "@/features/shared/client/api";
import type { CrawlConfig } from "@/features/heroes/crawl-config";
export interface SyncProgress { jobId?: string; phase: string; current: number; total: number; message: string; updatedAt?: string }
export function readCrawlSettings(signal: AbortSignal) { return apiRequest<{ settings: CrawlConfig; error?: string }>("/api/admin/settings", { signal }); }
export function saveCrawlSettings(settings: CrawlConfig) { return jsonRequest<{ ok?: boolean; settings: CrawlConfig; error?: string }>("/api/admin/settings", "PUT", settings); }
export function readHeroSyncProgress(signal: AbortSignal) { return apiRequest<{ progress: SyncProgress | null; error?: string }>("/api/admin/sync-status", { signal, timeoutMs: 5000 }); }
export function startHeroSync() { return apiRequest<{ ok?: boolean; jobId?: string; message?: string; error?: string }>("/api/heroes", { method: "POST" }); }
