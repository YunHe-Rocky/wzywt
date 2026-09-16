"use client";
import { useEffect, useRef, useState } from "react";

export function CombatVideoPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const position = useRef(0);
  const resume = useRef(false);
  const [error, setError] = useState("");
  const [buffering, setBuffering] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const video = ref.current;
    // StrictMode runs setup/cleanup/setup on the same element in development.
    // Restore the source removed by cleanup before resuming normal playback.
    if (video && video.getAttribute("src") !== src) { video.src = src; video.load(); }
    return () => { if (video) { video.pause(); video.removeAttribute("src"); video.load(); } };
  }, [src, attempt]);
  function retry() {
    const video = ref.current; if (!video) return;
    position.current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    resume.current = !video.paused; setError(""); setBuffering(false); setAttempt(v => v + 1);
  }
  return <section className="combat-player" aria-label="复盘视频">
    <video key={`${src}:${attempt}`} ref={ref} controls preload="metadata" playsInline src={src}
      onPlay={() => { if (ref.current) ref.current.preload = "auto"; }}
      onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onCanPlay={() => setBuffering(false)} onPause={() => setBuffering(false)}
      onError={() => { setBuffering(false); setError("视频暂时无法播放，请检查网络或重试。若持续失败，该视频编码可能不受浏览器支持。"); }}
      onLoadedMetadata={() => { const video = ref.current; if (!video) return; if (position.current > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(position.current, Math.max(0, video.duration - 0.1)); if (resume.current) void video.play().catch(() => undefined); }}>
      浏览器不支持视频播放。
    </video>
    {buffering && <p className="combat-player-status" role="status">正在缓冲视频…</p>}
    {error && <div className="combat-player-status" role="alert"><p>{error}</p><button className="btn-subtle" onClick={retry}>重新加载视频</button></div>}
  </section>;
}
