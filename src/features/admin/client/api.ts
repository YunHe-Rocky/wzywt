"use client";
import { apiRequest } from "@/features/shared/client/api";

export interface AdminPost { id: number; title: string; status: string; size: number; createdAt: string; author: { username: string }; _count: { likes: number; comments: number } }
export interface AdminPostPage { posts: AdminPost[]; page: number; total: number; totalPages: number; error?: string }
export interface AdminOverview { userCount: number; tournamentCount: number; activeTournamentCount: number; heroCount: number; postCount: number; hiddenPostCount: number; videoBytes: number; recentPosts: Pick<AdminPost, "id" | "title" | "status" | "createdAt" | "author">[]; error?: string }

export function getAdminOverview(signal: AbortSignal) { return apiRequest<AdminOverview>("/api/admin/stats", { signal }); }
export function getAdminPosts(page: number, status: string, query: string, signal: AbortSignal) {
  return apiRequest<AdminPostPage>(`/api/admin/combat-posts?${new URLSearchParams({ page: String(page), status, q: query })}`, { signal });
}
