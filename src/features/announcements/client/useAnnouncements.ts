"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/features/shared/client/api";

interface Announcement {
  date: string; title: string; version: string | null;
  brief: string; slug: string; content?: string;
}

export function useAnnouncements(full = false) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ announcements?: Announcement[] }>(
      `/api/announcements${full ? "?full=true" : ""}`,
      { signal: controller.signal },
    ).then(({ data }) => {
      if (!controller.signal.aborted && data.announcements) setAnnouncements(data.announcements);
    }).catch(() => undefined).finally(() => {
      if (!controller.signal.aborted) setLoaded(true);
    });
    return () => controller.abort();
  }, [full]);

  const latestVersion = announcements.find(a => a.version)?.version || null;

  return { announcements, loaded, latestVersion };
}
