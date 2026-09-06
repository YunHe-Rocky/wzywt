"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FeaturePortal } from "@/web/components/ui/FeaturePortal";

const STORAGE_KEY = "yanwu:intro-seen:v1";
const REPLAY_EVENT = "yanwu:replay-intro";
const DURATION = 3100;

export function replayArenaIntro() {
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

// The same shield and sword geometry used by the site's crest, sampled into stars.
const strokes = [
  [[0, -1], [.8, -.64], [.8, .09], [0, 1], [-.8, .09], [-.8, -.64], [0, -1]],
  [[0, -.66], [0, .66]],
  [[-.45, -.4], [0, .05], [.45, -.4]],
  [[-.45, .06], [0, .61], [.45, .06]],
];
const segments = strokes.flatMap(stroke => stroke.slice(1).map((point, i) => ({ from: stroke[i], to: point })));
const fraction = (value: number) => { const n = Math.sin(value * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

function Constellation({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) { onComplete(); return; }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = [...document.querySelectorAll<HTMLElement>("main, header, .dock-shell")].map(element => ({ element, inert: element.inert }));
    background.forEach(({ element }) => { element.inert = true; });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    skipRef.current?.focus({ preventScroll: true });
    let width = 0;
    let height = 0;
    let frame = 0;
    let start: number | null = null;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const count = width < 640 ? 170 : 300;
    const particles = Array.from({ length: count }, (_, i) => {
      const line = segments[i % segments.length];
      const t = fraction(i + 6);
      return {
        x: line.from[0] + (line.to[0] - line.from[0]) * t,
        y: line.from[1] + (line.to[1] - line.from[1]) * t,
        angle: fraction(i + 12) * Math.PI * 2,
        radius: .35 + fraction(i + 24) * .55,
        size: .65 + fraction(i + 40) * 1.4,
        delay: fraction(i + 48) * 360,
        cool: i % 5 === 0,
      };
    });
    const draw = (now: number) => {
      if (start === null) start = now;
      const elapsed = now - start;
      if (elapsed >= DURATION) { onComplete(); return; }
      context.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height * .43;
      const scale = Math.min(width * .24, 112);
      const span = Math.max(width, height);
      const gathering = ease((elapsed - 200) / 1450);
      const dispersal = ease((elapsed - 2370) / 660);
      const opacity = Math.min(elapsed / 300, 1) * (1 - dispersal);
      // A soft central glow, never a flashing full-screen frame.
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, scale * 2.8);
      glow.addColorStop(0, `rgba(173, 145, 88, ${gathering * .085 * (1 - dispersal)})`);
      glow.addColorStop(1, "rgba(15, 28, 40, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      for (let i = 0; i < 52; i++) {
        const x = fraction(i + 60) * width;
        const y = fraction(i + 120) * height;
        context.fillStyle = `rgba(146, 183, 204, ${(.14 + .12 * Math.sin(elapsed / 650 + i)) * opacity})`;
        context.fillRect(x, y, 1, 1);
      }
      for (const p of particles) {
        const progress = ease((elapsed - p.delay) / 1550);
        const orbit = p.angle + (1 - progress) * .65;
        const radius = span * p.radius * (1 - progress) + dispersal * span * .28;
        const x = cx + p.x * scale * progress + Math.cos(orbit) * radius;
        const y = cy + p.y * scale * progress + Math.sin(orbit) * radius;
        const alpha = opacity * (.6 + .35 * Math.sin(elapsed / 270 + p.angle));
        const color = p.cool ? "143, 207, 216" : "232, 204, 151";
        context.fillStyle = `rgba(${color},${alpha})`;
        context.shadowColor = `rgba(${color},.7)`;
        context.shadowBlur = 5 + gathering * 5;
        context.beginPath();
        context.arc(x, y, p.size, 0, Math.PI * 2);
        context.fill();
      }
      context.shadowBlur = 0;
      if (elapsed > 1430) {
        context.strokeStyle = `rgba(233, 205, 152, ${Math.min((elapsed - 1430) / 600, .58) * (1 - dispersal)})`;
        context.lineWidth = .7;
        for (const stroke of strokes) {
          context.beginPath();
          stroke.forEach(([x, y], i) => { if (i === 0) context.moveTo(cx + x * scale, cy + y * scale); else context.lineTo(cx + x * scale, cy + y * scale); });
          context.stroke();
        }
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    const fallback = window.setTimeout(onComplete, DURATION + 600);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onComplete(); }
      if (event.key === "Tab") { event.preventDefault(); skipRef.current?.focus(); }
    };
    const visibility = () => { if (document.hidden) onComplete(); };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => { if (reduced.matches) onComplete(); };
    window.addEventListener("resize", resize);
    document.addEventListener("keydown", keydown);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", preference);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
      window.removeEventListener("resize", resize);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", preference);
      background.forEach(({ element, inert }) => { element.inert = inert; });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [onComplete]);

  return <div className="arena-intro" role="dialog" aria-modal="true" aria-label="演武堂开场动画">
    <canvas ref={canvasRef} aria-hidden="true" />
    <div className="arena-intro-caption"><p>王者演武堂</p><span>群星相聚，为热爱而战</span><small>YANWU ARENA</small></div>
    <button ref={skipRef} type="button" className="arena-intro-skip" onClick={onComplete} aria-label="跳过开场动画">跳过 <span>→</span></button>
    <div className="arena-intro-progress" aria-hidden="true" />
  </div>;
}

export function ArenaIntro() {
  const [run, setRun] = useState(0);
  const [active, setActive] = useState(false);
  const complete = useCallback(() => setActive(false), []);
  useEffect(() => {
    const start = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      setRun(value => value + 1);
      setActive(true);
    };
    let seen = false;
    try { seen = sessionStorage.getItem(STORAGE_KEY) === "1"; sessionStorage.setItem(STORAGE_KEY, "1"); } catch { /* The opening still works when storage is unavailable. */ }
    if (!seen) start();
    window.addEventListener(REPLAY_EVENT, start);
    return () => window.removeEventListener(REPLAY_EVENT, start);
  }, []);
  return active ? <FeaturePortal><Constellation key={run} onComplete={complete} /></FeaturePortal> : null;
}
