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

  useEffect(() => {
    if (!open) { setPickOpen(null); return; }
    // Reset state on each open
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }, [open]);

  if (!open) return null;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const blanks = firstDay;

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
    if (r) setPickPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 180) });
    setPickOpen(pickOpen === type ? null : type);
  };

  // Close Portal picker on outside click
  useEffect(() => {
    if (!pickOpen) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!(e.target as Element).closest(".time-dropdown")) setPickOpen(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [pickOpen]);

  const rows: (number | null)[][] = [];
  const cells: (number | null)[] = [];
  for (let i = 0; i < blanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length) rows.push(cells.splice(0, 7));

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.35)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--bg-card-glass)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 20, width: 320, maxWidth: "calc(100vw - 40px)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
      }}>
        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={() => month === 0 ? (setMonth(11), setYear(y => y - 1)) : setMonth(m => m - 1)}
            style={{ ...btnStyle, fontSize: 20, padding: "4px 12px" }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
            {year}年{month + 1}月
          </span>
          <button onClick={() => month === 11 ? (setMonth(0), setYear(y => y + 1)) : setMonth(m => m + 1)}
            style={{ ...btnStyle, fontSize: 20, padding: "4px 12px" }}>›</button>
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4, textAlign: "center" }}>
          {["日","一","二","三","四","五","六"].map(w => (
            <div key={w} style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>{w}</div>
          ))}
        </div>

        {/* Day grid */}
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {row.map((d, ci) => {
              if (d === null) return <div key={ci} />;
              const past = isPastDay(d);
              const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate();
              return (
                <button key={d} disabled={past} onClick={() => handleSelect(d)} style={{
                  padding: "8px 0", textAlign: "center", fontSize: 14,
                  fontWeight: isToday ? 700 : 400,
                  color: past ? "var(--text-muted)" : isToday ? "var(--gold)" : "var(--text)",
                  background: "transparent", border: "none",
                  borderRadius: 6, cursor: past ? "default" : "pointer",
                  opacity: past ? 0.3 : 1,
                }}>{d}</button>
              );
            })}
          </div>
        ))}

        {/* Time pickers — Portal-based, no native select */}
        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "center", alignItems: "center" }}>
          <button ref={hourBtnRef} onClick={() => openPick("hour")}
            style={{
              ...timeBtnStyle,
              background: pickOpen === "hour" ? "var(--gold-alpha-08)" : "var(--bg-input)",
              borderColor: pickOpen === "hour" ? "var(--gold)" : "var(--border)",
              color: pickOpen === "hour" ? "var(--gold)" : "var(--text)",
            }}>
            {String(hour).padStart(2, "0")} 时
          </button>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>:</span>
          <button ref={minBtnRef} onClick={() => openPick("min")}
            style={{
              ...timeBtnStyle,
              background: pickOpen === "min" ? "var(--gold-alpha-08)" : "var(--bg-input)",
              borderColor: pickOpen === "min" ? "var(--gold)" : "var(--border)",
              color: pickOpen === "min" ? "var(--gold)" : "var(--text)",
            }}>
            {String(minute).padStart(2, "0")} 分
          </button>
        </div>
      </div>

      {/* Portal time dropdown */}
      {pickOpen && pickPos && createPortal(
        <div className="time-dropdown" style={{
          position: "fixed", zIndex: 10000,
          top: pickPos.top, left: pickPos.left,
          width: pickPos.width,
          background: "var(--bg-card-glass)", border: "1px solid var(--border)",
          borderRadius: 8, padding: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          display: "grid",
          gridTemplateColumns: pickOpen === "hour" ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
          gap: 4, maxHeight: 240, overflowY: "auto",
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
                padding: "8px 4px", textAlign: "center", fontSize: 14,
                fontWeight: isSel ? 700 : 400,
                background: isSel ? "var(--gold)" : "transparent",
                color: isSel ? "var(--bg-root)" : "var(--text)",
                border: "none", borderRadius: 6, cursor: "pointer",
              }}>{String(v).padStart(2, "0")}</button>
            );
          })}
        </div>,
        document.body
      )}

    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "none", border: "none", color: "var(--text-secondary)",
  cursor: "pointer", borderRadius: 6,
};

const timeBtnStyle: React.CSSProperties = {
  flex: 1, padding: "9px 14px", fontSize: 14, fontWeight: 600,
  border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer",
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
