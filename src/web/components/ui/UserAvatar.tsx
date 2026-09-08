"use client";

import { useState } from "react";

export function UserAvatar({ avatar, name, size = 36 }: { avatar?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--gold-alpha-08)", color: "var(--gold)", fontWeight: 600 }}>
    {avatar && failed !== avatar
      ? <img src={`/api/avatars/${encodeURIComponent(avatar)}`} alt={`${name}的头像`} width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setFailed(avatar)} />
      : <span role="img" aria-label={`${name}的默认头像`}>{Array.from(name)[0] || "?"}</span>}
  </span>;
}
