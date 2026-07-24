"use client";

import { useEffect, useState } from "react";

interface Announcement {
  date: string; title: string; version: string | null;
  brief: string; slug: string; content?: string;
}

export function useAnnouncements(full = false) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/announcements${full ? "?full=true" : ""}`)
      .then(r => r.json())
      .then(d => { if (d.announcements) setAnnouncements(d.announcements); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [full]);

  const latestVersion = announcements.find(a => a.version)?.version || null;

  return { announcements, loaded, latestVersion };
}
