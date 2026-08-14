"use client";

import { apiRequest, jsonRequest } from "@/features/shared/client/api";

export function listCombatPosts<T>(page = 1) {
  return apiRequest<T>(`/api/combat-posts?page=${page}`);
}

export function getCombatPost<T>(postId: string | number) {
  return apiRequest<T>(`/api/combat-posts/${postId}`);
}

export function publishCombatPost<T>(input: { title: string; content: string; video: File; matchId?: string; tournamentId?: string }) {
  const body = new FormData();
  body.set("title", input.title);
  body.set("content", input.content);
  body.set("video", input.video);
  if (input.matchId) body.set("matchId", input.matchId);
  if (input.tournamentId) body.set("tournamentId", input.tournamentId);
  return apiRequest<T>("/api/combat-posts", { method: "POST", body });
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
