"use client";

import "@/web/styles/yanwu-workspaces.css";
import { useEffect, useRef, useState } from "react";
import { inspectCombatVideoSource } from "@/features/combat-posts/client/api";

const BUFFER_TIMEOUT_MS = 20_000;

export function CombatVideoPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const position = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probe = useRef<AbortController | null>(null);
  const pendingPlay = useRef(false);
  const failed = useRef(false);
  const attempt = useRef(0);
  const active = useRef(false);
  const [error, setError] = useState("");
  const [buffering, setBuffering] = useState(false);
  const [started, setStarted] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16 / 9");
  function clearPending() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    probe.current?.abort(); probe.current = null;
  }
  function showFailure(message: string) {
    if (!active.current) return;
    clearPending(); pendingPlay.current = false; failed.current = true; setBuffering(false); setError(message);
    const controller = new AbortController(); probe.current = controller;
    void inspectCombatVideoSource(src, controller.signal).then(detail => {
      if (!controller.signal.aborted && detail) setError(detail);
    }).catch(() => { /* Keep the playback error if the diagnostic request fails. */ });
  }
  function waitForVideo() {
    // Metadata preloading may stop until the user taps Play, especially on
    // phones. Only show buffering for an actual playback request.
    if (!active.current || failed.current || (!pendingPlay.current && ref.current?.paused)) return;
    setBuffering(true); setError("");
    // Repeated waiting/stalled events must not postpone recovery forever.
    timer.current ??= setTimeout(() => showFailure("视频加载时间较长，请重新加载视频；也可打开视频单独播放。"), BUFFER_TIMEOUT_MS);
  }
  function ready() { if (!active.current) return; clearPending(); pendingPlay.current = false; failed.current = false; setBuffering(false); setError(""); }
  function playbackFailure(cause?: unknown) {
    showFailure((cause instanceof DOMException && cause.name === "NotSupportedError") || ref.current?.error?.code === 3 || ref.current?.error?.code === 4
      ? "此视频无法解码或格式不受当前浏览器支持，请重新发布兼容版本。"
      : "视频读取中断，请检查网络后重新加载。");
  }
  useEffect(() => {
    const video = ref.current;
    active.current = true;
    clearPending(); pendingPlay.current = false; failed.current = false;
    setStarted(false); setBuffering(false); setError(""); setAspectRatio("16 / 9");
    position.current = 0;
    // StrictMode runs setup/cleanup/setup on the same element in development.
    // Restore the source removed by cleanup before resuming normal playback.
    if (video && video.getAttribute("src") !== src) { video.src = src; video.load(); }
    // A full navigation need not unmount React. WebKit can deliver media
    // errors/reject play() while discarding the document; those events must
    // not start a new diagnostic fetch from the departing page.
    const suspend = () => {
      active.current = false;
      attempt.current += 1;
      clearPending(); pendingPlay.current = false;
      video?.pause();
    };
    const resume = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      active.current = true;
      failed.current = false;
      setStarted(false); setBuffering(false); setError("");
    };
    window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", resume);
    return () => {
      window.removeEventListener("pagehide", suspend);
      window.removeEventListener("pageshow", resume);
      suspend();
      if (video) { video.removeAttribute("src"); video.load(); }
    };
  }, [src]);
  function play(reload = false) {
    const video = ref.current; if (!video || !active.current) return;
    const currentAttempt = ++attempt.current;
    clearPending(); pendingPlay.current = true; failed.current = false;
    if (reload && Number.isFinite(video.currentTime) && video.currentTime > 0) position.current = video.currentTime;
    // Call play during the click gesture. A metadata callback loses mobile
    // user activation and may be rejected by the browser's autoplay policy.
    video.preload = "auto";
    if (reload || video.error) video.load();
    waitForVideo();
    void video.play().catch(cause => {
      if (attempt.current !== currentAttempt) return;
      if (cause instanceof DOMException && cause.name === "NotAllowedError")
        showFailure("浏览器暂停了播放，请点击重新加载视频，或使用播放器中的播放按钮。");
      else playbackFailure(cause);
    });
  }
  return <section className="combat-player" aria-label="复盘视频">
    <div className="combat-player-stage">
    <video ref={ref} controls preload="metadata" playsInline src={src} style={{ aspectRatio }}
      onLoadStart={waitForVideo}
      onPlay={() => { if (!active.current) return; pendingPlay.current = true; failed.current = false; if (ref.current) ref.current.preload = "auto"; waitForVideo(); }}
      onWaiting={waitForVideo} onStalled={waitForVideo}
      onPlaying={() => { if (!active.current) return; setStarted(true); ready(); }}
      onPause={() => { if (active.current && ref.current?.paused) { clearPending(); pendingPlay.current = false; setBuffering(false); } }}
      onEnded={() => { if (!active.current) return; setStarted(false); ready(); }}
      onError={playbackFailure}
      onLoadedMetadata={() => {
        // Metadata can arrive after play() was rejected. Keep the failure
        // visible until a new attempt actually starts playing.
        const video = ref.current; if (!video || !active.current) return;
        if (video.videoWidth && video.videoHeight) setAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
        if (position.current > 0 && Number.isFinite(video.duration)) {
          video.currentTime = Math.min(position.current, Math.max(0, video.duration - 0.1)); position.current = 0;
        }
      }}>
      浏览器不支持视频播放。
    </video>
    {!started && !buffering && !error && <button type="button" className="combat-player-start" onClick={() => play()}><span aria-hidden="true">▶</span>点击播放视频</button>}
    </div>
    {buffering && <p className="combat-player-status" role="status">正在缓冲视频…</p>}
    {error && <div className="combat-player-status" role="alert"><p>{error}</p><div className="combat-player-actions"><button type="button" className="btn-subtle" onClick={() => play(true)}>重新加载视频</button><a className="btn-subtle" href={src} target="_blank" rel="noopener noreferrer">单独打开视频</a></div></div>}
  </section>;
}
