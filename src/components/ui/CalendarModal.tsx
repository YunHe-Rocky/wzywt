"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface CalendarModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  defaultHour?: number;
  defaultMinute?: number;
}

export function CalendarModal({ open, onClose, onSelect, defaultHour = 20, defaultMinute = 0 }: CalendarModalProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [hour, setHour] = useState(defaultHour);
  const [minute, setMinute] = useState(defaultMinute);
  const [pickOpen, setPickOpen] = useState<"hour" | "min" | null>(null);
  const [pickPos, setPickPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const hourBtnRef = useRef<HTMLButtonElement>(null);
  const minBtnRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) { setPickOpen(null); setVisible(false); return; }
    requestAnimationFrame(() => setVisible(true));
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!pickOpen) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!(e.target as Element).closest(".cal-time-dropdown")) setPickOpen(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [pickOpen]);

  if (!open) return null;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const isPastDay = (d: number) =>
    year < today.getFullYear() ||
    (year === today.getFullYear() && month < today.getMonth()) ||
    (year === today.getFullYear() && month === today.getMonth() && d < today.getDate());

  const handleSelect = (d: number) => {
    if (isPastDay(d)) return;
    const m = String(month + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    onSelect(`${year}-${m}-${dd}T${hh}:${mm}`);
    onClose();
  };

  const openPick = (type: "hour" | "min") => {
    const ref = type === "hour" ? hourBtnRef : minBtnRef;
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const w = Math.max(r.width, 200);
      // Keep dropdown in viewport
      let left = r.left;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      if (left < 8) left = 8;
      setPickPos({ top: r.bottom + 6, left, width: w });
    }
    setPickOpen(pickOpen === type ? null : type);
  };

  // Build calendar grid
  const rows: (number | null)[][] = [];
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length) rows.push(cells.splice(0, 7));

  const navBtn: React.CSSProperties = {
    background: "none", border: "none", color: "var(--text-secondary)",
    cursor: "pointer", fontSize: 18, width: 36, height: 36,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8, transition: "background 0.15s",
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.35)", display: "flex",
      alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: "var(--bg-card-glass)", border: "1px solid var(--border)",
        borderTop: "1px solid var(--border-top)",
        borderRadius: "var(--radius-lg)", padding: "clamp(16px, 3vw, 24px)",
        width: "min(340px, calc(100vw - 32px))",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 16px 48px rgba(0,0,0,0.18)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(8px) scale(0.97)",
        transition: "opacity 0.2s ease-out, transform 0.2s ease-out",
      }}>
        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button onClick={() => month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1)}
            style={navBtn}
            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-input)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
          >‹</button>
          <span style={{
            fontSize: 16, fontWeight: 700, color: "var(--text)",
            letterSpacing: 1, userSelect: "none",
          }}>
            {year}年{month + 1}月
          </span>
          <button onClick={() => month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1)}
            style={navBtn}
            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-input)"}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
          >›</button>
        </div>

        {/* Day headers */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
          gap: 2, marginBottom: 6, textAlign: "center",
        }}>
          {["日","一","二","三","四","五","六"].map((w, i) => (
            <div key={w} style={{
              fontSize: 11, fontWeight: 600,
              color: i === 0 || i === 6 ? "var(--text-muted)" : "var(--text-muted)",
              padding: "6px 0",
            }}>{w}</div>
          ))}
        </div>

        {/* Day grid */}
        {rows.map((row, ri) => (
          <div key={ri} style={{
            display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1,
          }}>
            {row.map((d, ci) => {
              if (d === null) return <div key={ci} />;
              const past = isPastDay(d);
              const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate();
              return (
                <button key={d} disabled={past} onClick={() => handleSelect(d)} style={{
                  aspectRatio: "1", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: "clamp(13px, 2.5vw, 15px)",
                  fontWeight: isToday ? 700 : 400,
                  color: past ? "var(--text-muted)" : isToday ? "var(--gold)" : "var(--text)",
                  background: "transparent", border: isToday ? "1px solid var(--gold)" : "1px solid transparent",
                  borderRadius: 8, cursor: past ? "default" : "pointer",
                  opacity: past ? 0.3 : 1, outline: "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!past) e.currentTarget.style.background = "var(--bg-input)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >{d}</button>
              );
            })}
          </div>
        ))}

        {/* Time pickers */}
        <div style={{
          display: "flex", gap: 8, marginTop: 16,
          justifyContent: "center", alignItems: "center",
        }}>
          <button ref={hourBtnRef} onClick={() => openPick("hour")} style={{
            flex: 1, padding: "10px 12px", fontSize: "clamp(13px, 2.5vw, 15px)",
            fontWeight: 600, borderRadius: 8, cursor: "pointer",
            background: pickOpen === "hour" ? "var(--gold-alpha-08)" : "var(--bg-input)",
            border: pickOpen === "hour" ? "1px solid var(--gold)" : "1px solid var(--border)",
            color: pickOpen === "hour" ? "var(--gold)" : "var(--text)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            transition: "border-color 0.15s, background 0.15s",
          }}>
            <span>{String(hour).padStart(2, "0")}</span>
            <span style={{ fontSize: 12, opacity: 0.5 }}>时</span>
          </button>
          <span style={{
            color: "var(--text-secondary)", fontSize: 18, fontWeight: 600,
            userSelect: "none",
          }}>:</span>
          <button ref={minBtnRef} onClick={() => openPick("min")} style={{
            flex: 1, padding: "10px 12px", fontSize: "clamp(13px, 2.5vw, 15px)",
            fontWeight: 600, borderRadius: 8, cursor: "pointer",
            background: pickOpen === "min" ? "var(--gold-alpha-08)" : "var(--bg-input)",
            border: pickOpen === "min" ? "1px solid var(--gold)" : "1px solid var(--border)",
            color: pickOpen === "min" ? "var(--gold)" : "var(--text)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            transition: "border-color 0.15s, background 0.15s",
          }}>
            <span>{String(minute).padStart(2, "0")}</span>
            <span style={{ fontSize: 12, opacity: 0.5 }}>分</span>
          </button>
        </div>
      </div>

      {/* Portal time dropdown */}
      {pickOpen && pickPos && createPortal(
        <div className="cal-time-dropdown" style={{
          position: "fixed", zIndex: 10000,
          top: pickPos.top, left: pickPos.left,
          width: pickPos.width,
          background: "var(--bg-card-glass)", border: "1px solid var(--border)",
          borderTop: "1px solid var(--border-top)",
          borderRadius: 10, padding: 6,
          boxShadow: "0 4px 20px rgba(0,0,0,0.15), 0 12px 40px rgba(0,0,0,0.2)",
          display: "grid",
          gridTemplateColumns: pickOpen === "hour" ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
          gap: 3, maxHeight: 260, overflowY: "auto",
          animation: "slide-up 0.12s ease-out",
        }}>
          {(pickOpen === "hour"
            ? Array.from({ length: 24 }, (_, i) => i)
            : [0,5,10,15,20,25,30,35,40,45,50,55]
          ).map(v => {
            const isSel = pickOpen === "hour" ? hour === v : minute === v;
            return (
              <button key={v} onClick={() => {
                if (pickOpen === "hour") setHour(v);
                else setMinute(v);
                setPickOpen(null);
              }} style={{
                padding: "10px 4px", textAlign: "center",
                fontSize: 14, fontWeight: isSel ? 700 : 500,
                background: isSel ? "var(--gold)" : "transparent",
                color: isSel ? "var(--bg-root)" : "var(--text)",
                border: "none", borderRadius: 7, cursor: "pointer",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "var(--bg-input)"; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >{String(v).padStart(2, "0")}</button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
