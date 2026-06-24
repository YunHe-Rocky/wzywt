"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type ToastType = "success" | "error" | "loading";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  exiting: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  loading: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message, exiting: false }]);
    const duration = type === "loading" ? 8000 : 2500;
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 200);
    }, duration);
  }, []);

  const ctx: ToastContextValue = {
    toast: addToast,
    success: (msg) => addToast(msg, "success"),
    error: (msg) => addToast(msg, "error"),
    loading: (msg) => addToast(msg, "loading"),
  };

  const icons: Record<ToastType, string> = {
    success: "✓",
    error: "✗",
    loading: "◌",
  };

  const typeStyles: Record<ToastType, React.CSSProperties> = {
    success: { background: "#1a2a1a", borderColor: "#2a4a2a" },
    error: { background: "#2a1a1a", borderColor: "#4a2a2a" },
    loading: { background: "#1a1a24", borderColor: "#3a3a4a" },
  };

  const typeIconColors: Record<ToastType, string> = {
    success: "var(--green)",
    error: "var(--red)",
    loading: "var(--gold)",
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div
        style={{
          position: "fixed",
          top: 72,
          right: 24,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              minWidth: 200,
              maxWidth: 360,
              backdropFilter: "blur(12px)",
              animation: t.exiting ? "toast-out 0.2s ease-in forwards" : "toast-in 0.25s ease-out",
              pointerEvents: "auto",
              background: typeStyles[t.type].background,
              border: `1px solid ${typeStyles[t.type].borderColor}`,
            }}
          >
            <span style={{ fontSize: 18, color: typeIconColors[t.type] }}>
              {icons[t.type]}
            </span>
            <span style={{ color: "var(--text-primary)" }}>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
