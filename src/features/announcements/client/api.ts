"use client";

import {
  apiRequest,
  jsonRequest,
  type ApiResult,
} from "@/features/shared/client/api";

export interface AdminAnnouncement {
  id: number;
  title: string;
  version: string | null;
  brief: string;
  content: string | null;
  slug: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  date: string;
}

interface AnnouncementListResponse {
  announcements: AdminAnnouncement[];
  error?: string;
}

interface AnnouncementMutationResponse extends Partial<AdminAnnouncement> {
  ok?: boolean;
  error?: string;
}

export interface AnnouncementWriteInput {
  version: string;
  title: string;
  content: string;
  slug?: string;
  published?: boolean;
}

export const listAdminAnnouncements = (): Promise<ApiResult<AnnouncementListResponse>> =>
  apiRequest("/api/admin/announcements");

export const createAdminAnnouncement = (
  body: AnnouncementWriteInput,
): Promise<ApiResult<AnnouncementMutationResponse>> =>
  jsonRequest("/api/admin/announcements", "POST", body);

export const updateAdminAnnouncement = (
  id: number,
  body: AnnouncementWriteInput | { published: boolean },
): Promise<ApiResult<AnnouncementMutationResponse>> =>
  jsonRequest(`/api/announcements/${id}`, "PUT", body);

export const deleteAdminAnnouncement = (
  id: number,
): Promise<ApiResult<AnnouncementMutationResponse>> =>
  apiRequest(`/api/announcements/${id}`, { method: "DELETE" });
