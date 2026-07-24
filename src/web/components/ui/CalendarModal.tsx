"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  createLocalDateTime,
  formatLocalDateTime,
  getCalendarRows,
  isCalendarDayBefore,
} from "@/features/calendar";

interface CalendarModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  defaultHour?: number;
  defaultMinute?: number;
  initialValue?: string | Date;
  minValue?: string | Date;
  title?: string;
  confirmLabel?: string;
}

const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const TIME_PRESETS = [
  { label: "傍晚", hour: 18 },
  { label: "黄金档", hour: 20 },
  { label: "夜场", hour: 22 },
];
const WHEEL_ITEM_HEIGHT = 44;

function TimeWheel({
  label,
  unit,
  values,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  values: readonly number[];
  value: number;
  onChange: (value: number) => void;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const index = Math.max(0, values.indexOf(value));
    if (wheelRef.current) {
      wheelRef.current.scrollTop = index * WHEEL_ITEM_HEIGHT;
    }
  }, [value, values]);

  useEffect(() => () => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
  }, []);

  const selectAtScrollPosition = () => {
    const wheel = wheelRef.current;
    if (!wheel) return;
    const index = Math.max(
      0,
      Math.min(values.length - 1, Math.round(wheel.scrollTop / WHEEL_ITEM_HEIGHT)),
    );
    const nextValue = values[index];
    if (nextValue !== value) onChange(nextValue);
  };

  const scrollToValue = (nextValue: number) => {
    const index = values.indexOf(nextValue);
    if (index < 0 || !wheelRef.current) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    wheelRef.current.scrollTo({
      top: index * WHEEL_ITEM_HEIGHT,
      behavior: reducedMotion ? "auto" : "smooth",
    });
    onChange(nextValue);
  };

  const moveSelection = (offset: number) => {
    const currentIndex = Math.max(0, values.indexOf(value));
    const nextIndex = Math.max(0, Math.min(values.length - 1, currentIndex + offset));
    scrollToValue(values[nextIndex]);
  };

  return (
    <div className="time-wheel-field">
      <div className="time-wheel-label">{label}</div>
      <div className="time-wheel-frame">
        <div className="time-wheel-selection" aria-hidden="true" />
        <div
          ref={wheelRef}
          className="time-wheel"
          role="listbox"
          aria-label={label}
          aria-activedescendant={`time-${unit}-${value}`}
          tabIndex={0}
          onScroll={() => {
            if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
            scrollTimerRef.current = setTimeout(selectAtScrollPosition, 70);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveSelection(-1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              moveSelection(1);
            } else if (event.key === "Home") {
              event.preventDefault();
              scrollToValue(values[0]);
            } else if (event.key === "End") {
              event.preventDefault();
              scrollToValue(values[values.length - 1]);
            }
          }}
        >
          {values.map((option) => {
            const selected = option === value;
            return (
              <div
                id={`time-${unit}-${option}`}
                key={option}
                role="option"
                aria-selected={selected}
                className="time-wheel-option"
                data-selected={selected || undefined}
                onClick={() => scrollToValue(option)}
              >
                <span>{String(option).padStart(2, "0")}</span>
                <small>{unit}</small>
                {selected && <i aria-hidden="true">已选</i>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function parseDate(value?: string | Date): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundUpToFiveMinutes(date: Date): Date {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 5) * 5);
  return rounded;
}

export function CalendarModal({
  open,
  onClose,
  onSelect,
  defaultHour = 20,
  defaultMinute = 0,
  initialValue,
  minValue,
  title = "选择日期和时间",
  confirmLabel = "确认",
}: CalendarModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [day, setDay] = useState(() => new Date().getDate());
  const [hour, setHour] = useState(defaultHour);
  const [minute, setMinute] = useState(defaultMinute);
  const [minimum, setMinimum] = useState(() => new Date());
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const errorId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }

    const now = new Date();
    const nextMinimum = parseDate(minValue) ?? now;
    const providedInitial = parseDate(initialValue);
    let initial = providedInitial
      ? new Date(providedInitial)
      : new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          defaultHour,
          defaultMinute,
        );

    if (initial.getTime() <= nextMinimum.getTime()) {
      initial = roundUpToFiveMinutes(new Date(nextMinimum.getTime() + 5 * 60 * 1000));
    }

    setMinimum(nextMinimum);
    setYear(initial.getFullYear());
    setMonth(initial.getMonth());
    setDay(initial.getDate());
    setHour(initial.getHours());
    setMinute(MINUTES.reduce((closest, option) => (
      Math.abs(option - initial.getMinutes()) < Math.abs(closest - initial.getMinutes())
        ? option
        : closest
    ), MINUTES[0]));
    setError("");

    const frame = requestAnimationFrame(() => {
      setVisible(true);
      dialogRef.current?.focus();
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [defaultHour, defaultMinute, initialValue, minValue, open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!mounted || !open) return null;

  const rows = getCalendarRows(year, month);
  const selected = createLocalDateTime({ year, month, day, hour, minute });
  const selectedDateLabel = selected.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const selectedTimeLabel = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  const moveMonth = (offset: number) => {
    const next = new Date(year, month + offset, 1);
    const nextYear = next.getFullYear();
    const nextMonth = next.getMonth();
    const lastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
    setYear(nextYear);
    setMonth(nextMonth);
    setDay((value) => Math.min(value, lastDay));
    setError("");
  };

  const confirm = () => {
    if (selected.getTime() <= minimum.getTime()) {
      setError(`请选择晚于 ${minimum.toLocaleString("zh-CN")} 的时间`);
      return;
    }
    onSelect(formatLocalDateTime({ year, month, day, hour, minute }));
    onClose();
  };

  const modal = (
    <div
      className="calendar-overlay layer-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="calendar-dialog layer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        tabIndex={-1}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0) scale(1)" : "translateY(8px) scale(0.98)",
          transition: "opacity 0.2s ease-out, transform 0.2s ease-out",
        }}
      >
        <header className="calendar-header">
          <div>
            <h2 id={titleId} className="calendar-title">{title}</h2>
            <p className="calendar-subtitle">先选日期，再确认具体开场时间</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭日期时间选择器"
            className="btn-ghost"
            style={{ width: 44, height: 44, padding: 0, fontSize: 22, flexShrink: 0 }}
          >
            ×
          </button>
        </header>

        <div className="calendar-content">
          <section className="calendar-panel" aria-label="选择日期">
            <div className="calendar-month-bar">
              <button type="button" aria-label="上个月" onClick={() => moveMonth(-1)} className="btn-ghost" style={{ width: 44, height: 44, padding: 0, fontSize: 22 }}>
                ‹
              </button>
              <span className="calendar-month-label">{year}年{month + 1}月</span>
              <button type="button" aria-label="下个月" onClick={() => moveMonth(1)} className="btn-ghost" style={{ width: 44, height: 44, padding: 0, fontSize: 22 }}>
                ›
              </button>
            </div>

            <div className="calendar-weekdays" aria-hidden="true">
              {["日", "一", "二", "三", "四", "五", "六"].map((weekDay) => (
                <span key={weekDay} className="calendar-weekday">{weekDay}</span>
              ))}
            </div>

            {rows.map((row, rowIndex) => (
              <div key={`${year}-${month}-${rowIndex}`} className="calendar-row">
                {row.map((calendarDay, columnIndex) => {
                  if (calendarDay === null) return <span key={`empty-${rowIndex}-${columnIndex}`} />;
                  const disabled = isCalendarDayBefore(year, month, calendarDay, minimum);
                  const selectedDay = calendarDay === day;
                  return (
                    <button
                      key={`${year}-${month}-${calendarDay}`}
                      type="button"
                      className="calendar-day"
                      disabled={disabled}
                      aria-pressed={selectedDay}
                      aria-label={`${year}年${month + 1}月${calendarDay}日`}
                      onClick={() => {
                        setDay(calendarDay);
                        setError("");
                      }}
                    >
                      {calendarDay}
                    </button>
                  );
                })}
              </div>
            ))}
          </section>

          <section className="calendar-panel calendar-time-panel" aria-label="选择时间">
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>具体时间</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>分钟按 5 分钟递增</div>
            </div>

            <div className="calendar-time-grid">
              <TimeWheel
                label="小时"
                unit="时"
                values={HOURS}
                value={hour}
                onChange={(value) => {
                  setHour(value);
                  setError("");
                }}
              />
              <span className="time-wheel-colon" aria-hidden="true">:</span>
              <TimeWheel
                label="分钟"
                unit="分"
                values={MINUTES}
                value={minute}
                onChange={(value) => {
                  setMinute(value);
                  setError("");
                }}
              />
            </div>

            <div className="responsive-toolbar" style={{ marginTop: 12, gap: 8 }} aria-label="常用时间">
              {TIME_PRESETS.map((preset) => (
                <button
                  key={preset.hour}
                  type="button"
                  className="btn-ghost"
                  aria-pressed={hour === preset.hour && minute === 0}
                  onClick={() => {
                    setHour(preset.hour);
                    setMinute(0);
                    setError("");
                  }}
                  style={{ minHeight: 40, padding: "6px 10px", flex: "1 1 auto", fontSize: 12 }}
                >
                  {preset.label} {preset.hour}:00
                </button>
              ))}
            </div>

            <div className="calendar-summary" aria-live="polite">
              <div style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 700 }}>已选择</div>
              <div style={{ marginTop: 5, color: "var(--text)", fontSize: 16, fontWeight: 800 }}>
                {selectedDateLabel}
              </div>
              <div style={{ marginTop: 2, color: "var(--gold)", fontSize: 24, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {selectedTimeLabel}
              </div>
            </div>

            {error && (
              <p id={errorId} role="alert" style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--red)" }}>
                {error}
              </p>
            )}

            <div className="calendar-actions">
              <button type="button" onClick={onClose} className="btn-ghost" style={{ minHeight: 44, padding: "8px 18px" }}>
                取消
              </button>
              <button type="button" onClick={confirm} className="btn-primary" style={{ minHeight: 44, padding: "8px 22px" }}>
                {confirmLabel}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
