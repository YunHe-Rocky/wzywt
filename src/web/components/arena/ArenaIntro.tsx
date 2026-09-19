"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FeaturePortal } from "@/web/components/ui/FeaturePortal";

const STORAGE_KEY = "yanwu:intro-seen:v1";
const REPLAY_EVENT = "yanwu:replay-intro";
const MOTION_DURATION = 1860;
const STATIC_DURATION = 420;
let memorySeen = false;

type IntroMotion = "motion" | "static";

export function replayArenaIntro() {
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

function InkOpening({ motion, onComplete }: { motion: IntroMotion; onComplete: () => void }) {
  const skipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = [...document.querySelectorAll<HTMLElement>("main, header, .dock-shell")].map(element => ({ element, inert: element.inert }));
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    background.forEach(({ element }) => { element.inert = true; });
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    skipRef.current?.focus({ preventScroll: true });

    const finish = () => onComplete();
    const timer = window.setTimeout(finish, motion === "static" ? STATIC_DURATION : MOTION_DURATION);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); finish(); }
      if (event.key === "Tab") { event.preventDefault(); skipRef.current?.focus({ preventScroll: true }); }
    };
    const visibility = () => { if (document.hidden) finish(); };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => { if (reduced.matches && motion === "motion") finish(); };
    document.addEventListener("keydown", keydown);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", preference);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", preference);
      background.forEach(({ element, inert }) => { element.inert = inert; });
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [motion, onComplete]);

  return <div className="arena-intro" data-motion={motion} role="dialog" aria-modal="true" aria-label="演武堂开场动画">
    <svg className="arena-intro-mark" viewBox="0 0 160 160" aria-hidden="true">
      <rect x="25" y="24" width="110" height="110" />
      <path d="M42 52h76M48 78h64M48 104h64M63 39v82M96 39v82" />
      <text x="80" y="100" textAnchor="middle">武</text>
    </svg>
    <svg className="arena-intro-ink" viewBox="0 0 600 36" preserveAspectRatio="none" aria-hidden="true">
      <path d="M8 22c73-8 121 5 191-2 82-8 128 5 201-1 70-6 119 4 192-3" />
    </svg>
    <div className="arena-intro-caption"><p>王者演武堂</p><span>以武会友，以文知古</span><small>YANWU · FRIENDS &amp; PLAY</small></div>
    <button ref={skipRef} type="button" className="arena-intro-skip" onClick={onComplete} aria-label="跳过开场动画">跳过</button>
  </div>;
}

export function ArenaIntro() {
  const [run, setRun] = useState(0);
  const [motion, setMotion] = useState<IntroMotion>("motion");
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const complete = useCallback(() => {
    activeRef.current = false;
    setActive(false);
  }, []);

  useEffect(() => {
    const start = (manual: boolean) => {
      if (activeRef.current) return;
      if (location.search.includes("_from=login")) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced && !manual) return;
      activeRef.current = true;
      setMotion(reduced ? "static" : "motion");
      setRun(value => value + 1);
      setActive(true);
    };
    let seen = memorySeen;
    try {
      seen = sessionStorage.getItem(STORAGE_KEY) === "1";
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      seen = memorySeen;
    }
    memorySeen = true;
    if (!seen) start(false);
    const replay = () => start(true);
    window.addEventListener(REPLAY_EVENT, replay);
    return () => {
      activeRef.current = false;
      window.removeEventListener(REPLAY_EVENT, replay);
    };
  }, []);

  return active ? <FeaturePortal><InkOpening key={run} motion={motion} onComplete={complete} /></FeaturePortal> : null;
}
