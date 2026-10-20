"use client";

import { apiRequest, jsonRequest } from "@/features/shared/client/api";
import type { ApiResult } from "@/features/shared/client/api";
import type { CombatVideoPolicy } from "@/features/combat-posts/video-policy";

export function listCombatPosts<T>(page = 1, signal?: AbortSignal) {
  return apiRequest<T>(`/api/combat-posts?page=${page}`, { signal });
}

export function getCombatVideoPolicy(signal?: AbortSignal) { return apiRequest<CombatVideoPolicy & { error?: string }>("/api/combat-posts/policy", { signal }); }

/** Probe two bytes, never an entire movie, to distinguish access and decoding. */
export async function inspectCombatVideoSource(src: string, signal: AbortSignal): Promise<string | null> {
  const url = new URL(src, window.location.href);
  if (url.origin !== window.location.origin || !/^\/api\/combat-posts\/\d+\/video$/.test(url.pathname)) return null;
  // Older Android vendor browsers lack AbortSignal.any/timeout.
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 6000);
  try {
    const response = await fetch(url, { credentials: "same-origin", headers: { Range: "bytes=0-1" }, cache: "no-store", signal: controller.signal });
    if (response.ok && response.headers.get("content-type")?.startsWith("video/")) {
      await response.body?.cancel(); return null;
    }
    const messages: Record<number, string> = {
      401: "登录已失效，请重新登录后播放视频。", 403: "当前账号无权播放这条视频。",
      404: "视频文件不存在或已被删除，请联系发布者。", 503: "视频服务暂时繁忙，请稍后重试。",
    };
    await response.body?.cancel();
    return messages[response.status] || "视频读取失败，请稍后重试。";
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort);
  }
}

export function readLocalVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video"); const url = URL.createObjectURL(file);
    const finish = (error?: Error) => {
      video.onloadedmetadata = null; video.onerror = null;
      clearTimeout(timer); video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url);
      if (error) reject(error);
    };
    const timer = setTimeout(() => finish(new Error("读取视频信息超时，请确认文件可正常播放")), 15_000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const seconds = video.duration;
      if (!Number.isFinite(seconds) || seconds <= 0) return finish(new Error("无法读取视频时长，请重新导出视频"));
      video.onloadedmetadata = null; video.onerror = null; finish(); resolve(seconds);
    };
    video.onerror = () => finish(new Error("当前浏览器无法读取此视频，请使用 MP4 或 WebM"));
    video.src = url;
  });
}

export function getCombatPost<T>(postId: string | number, commentCursor?: number | null) {
  const query = commentCursor ? `?commentCursor=${commentCursor}` : "";
  return apiRequest<T>(`/api/combat-posts/${postId}${query}`);
}

export function publishCombatPost<T>(input: { title: string; content: string; video: File; matchId?: string; tournamentId?: string }, options: { signal?: AbortSignal; timeoutMs?: number; onProgress?: (percent: number) => void } = {}): Promise<ApiResult<T>> {
  const body = new FormData();
  body.set("title", input.title);
  body.set("content", input.content);
  body.set("video", input.video);
  if (input.matchId) body.set("matchId", input.matchId);
  if (input.tournamentId) body.set("tournamentId", input.tournamentId);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => options.signal?.removeEventListener("abort", abort);
    request.open("POST", "/api/combat-posts");
    request.timeout = options.timeoutMs ?? 900_000;
    request.upload.onprogress = event => { if (event.lengthComputable) options.onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100))); };
    request.onload = () => {
      cleanup();
      try { resolve({ ok: request.status >= 200 && request.status < 300, status: request.status, data: JSON.parse(request.responseText) as T }); }
      catch { reject(new Error(request.status === 413 ? "上传超过服务器代理限制，请联系管理员调整上传上限" : "服务器返回异常，请检查发布结果后重试")); }
    };
    request.onerror = () => { cleanup(); reject(new Error("上传连接中断，请检查网络")); };
    request.ontimeout = () => { cleanup(); reject(new Error("上传超时，请检查网络或压缩视频后重试")); };
    request.onabort = () => { cleanup(); reject(new Error("上传已取消")); };
    if (options.signal?.aborted) { reject(new Error("上传已取消")); return; }
    options.signal?.addEventListener("abort", abort, { once: true });
    request.send(body);
  });
}

export function setCombatPostLike<T>(postId: string | number, liked: boolean) {
  return apiRequest<T>(`/api/combat-posts/${postId}/like`, { method: liked ? "PUT" : "DELETE" });
}

export function addCombatPostComment<T>(postId: string | number, content: string) {
  return jsonRequest<T>(`/api/combat-posts/${postId}/comments`, "POST", { content });
}

export function removeCombatPostComment<T>(postId: string | number, commentId: string | number) {
  return apiRequest<T>(`/api/combat-posts/${postId}/comments/${commentId}`, { method: "DELETE" });
}

export function moderateCombatPost<T>(postId: string | number, action: "HIDE" | "RESTORE" | "DELETE") {
  return jsonRequest<T>(`/api/combat-posts/${postId}`, "PATCH", { action });
}
