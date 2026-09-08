"use client";

import { useState } from "react";
import { createHeroImageCandidates } from "@/features/heroes/model";

export function HeroPortrait({ heroId, name, imageUrl, size = 32 }: { heroId: number; name: string; imageUrl?: string; size?: number }) {
  const candidates = createHeroImageCandidates({ heroId, skinIndex: 1, remoteImageUrl: imageUrl,
    remoteSkinUrls: [`https://game.gtimg.cn/images/yxzj/img201606/heroimg/${heroId}/${heroId}.jpg`] });
  return <Portrait key={`${heroId}:${imageUrl}`} name={name} candidates={candidates} size={size} />;
}

function Portrait({ name, candidates, size }: { name: string; candidates: string[]; size: number }) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  return <span style={{ display: "inline-flex", position: "relative", alignItems: "center", justifyContent: "center", width: size, height: size, flexShrink: 0, borderRadius: 4, overflow: "hidden", background: "var(--bg-hover)", color: "var(--gold)" }}>
    {!loaded && <span aria-hidden="true">{Array.from(name)[0]}</span>}
    {index < candidates.length && <img src={candidates[index]} alt={name} width={size} height={size}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: loaded ? 1 : 0 }}
      onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setIndex(i => i + 1); }} />}
  </span>;
}
