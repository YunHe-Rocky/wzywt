"use client";

import { useEffect } from "react";

const SURFACES = ".arena-room, .arena-catalog-card, .arena-empty-room, .arena-filter-panel, .arena-profile-summary, .arena-lobby-cards > .card, .hero-catalog-grid > .card, .arena-equipment-grid > .card, .auth-card";

/** Light only the hovered surface; leave card transforms and shadows to CSS. */
export function CursorLighting() {
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const root = document.documentElement;
    let current: HTMLElement | null = null;
    let frame = 0;
    let enabled = false;

    function clear() {
      cancelAnimationFrame(frame);
      frame = 0;
      current?.removeAttribute("data-glass-active");
      current?.style.removeProperty("--light-x");
      current?.style.removeProperty("--light-y");
      current = null;
    }

    function syncPreference() {
      enabled = !motion.matches && pointer.matches && !document.hidden;
      root.toggleAttribute("data-arena-paused", document.hidden);
      if (!enabled) clear();
    }

    function move(event: PointerEvent) {
      if (!enabled || event.pointerType !== "mouse") return;
      const surface = event.target instanceof Element ? event.target.closest<HTMLElement>(SURFACES) : null;
      if (surface !== current) { clear(); current = surface; }
      if (!surface) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!surface.isConnected) { clear(); return; }
        const bounds = surface.getBoundingClientRect();
        surface.style.setProperty("--light-x", `${event.clientX - bounds.left}px`);
        surface.style.setProperty("--light-y", `${event.clientY - bounds.top}px`);
        surface.setAttribute("data-glass-active", "");
      });
    }

    function leave(event: PointerEvent) { if (!event.relatedTarget) clear(); }
    syncPreference();
    motion.addEventListener("change", syncPreference);
    pointer.addEventListener("change", syncPreference);
    document.addEventListener("visibilitychange", syncPreference);
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", leave, { passive: true });
    document.addEventListener("scroll", clear, { passive: true, capture: true });
    window.addEventListener("blur", clear);
    window.addEventListener("resize", clear);
    return () => {
      clear();
      root.removeAttribute("data-arena-paused");
      motion.removeEventListener("change", syncPreference);
      pointer.removeEventListener("change", syncPreference);
      document.removeEventListener("visibilitychange", syncPreference);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("scroll", clear, true);
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", clear);
    };
  }, []);
  return null;
}
