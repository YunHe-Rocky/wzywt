"use client";

import { useState } from "react";

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

  const rows: (number | null)[][] = [];
  const cells: (number | null)[] = [];
  for (let i = 0; i < blanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length) rows.push(cells.splice(0, 7));

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.35)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
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

        {/* Time pickers */}
        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "center", alignItems: "center" }}>
          <select value={hour} onChange={e => setHour(Number(e.target.value))}
            style={selectStyle}>
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
            ))}
          </select>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>:</span>
          <select value={minute} onChange={e => setMinute(Number(e.target.value))}
            style={selectStyle}>
            {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => (
              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "none", border: "none", color: "var(--text-secondary)",
  cursor: "pointer", borderRadius: 6,
};

const selectStyle: React.CSSProperties = {
  background: "var(--bg-input)", border: "1px solid var(--border)",
  borderRadius: 6, color: "var(--text)", fontSize: 14,
  padding: "8px 14px", outline: "none", cursor: "pointer",
  minWidth: 64, textAlign: "center" as const,
};
