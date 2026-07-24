"use client";

import { useEffect, useRef } from "react";
import type { JoinRoomPreview } from "@/features/tournaments/client/api";
import { FeaturePortal } from "@/web/components/ui/FeaturePortal";

interface JoinRoomPreviewModalProps {
  preview: JoinRoomPreview;
  joining: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function JoinRoomPreviewModal({
  preview,
  joining,
  onClose,
  onConfirm,
}: JoinRoomPreviewModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { room } = preview;

  useEffect(() => {
    dialogRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !joining) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [joining, onClose]);

  return (
    <FeaturePortal>
      <div
        className="layer-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !joining) onClose();
        }}
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
        }}
      >
        <div
          ref={dialogRef}
          className="layer-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-room-preview-title"
          tabIndex={-1}
          style={{
            position: "relative",
            width: "min(460px, calc(100vw - 32px))",
            maxHeight: "calc(100dvh - 32px)",
            overflowY: "auto",
            padding: 24,
            borderRadius: "var(--radius-lg)",
            background: "var(--bg-card-glass)",
            border: "1px solid var(--border)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "var(--text-muted)", marginBottom: 5 }}>
                房间信息
              </div>
              <h2 id="join-room-preview-title" style={{ margin: 0, fontSize: 22, color: "var(--text)" }}>
                {room.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={joining}
              aria-label="关闭房间预览"
              className="btn-ghost"
              style={{ width: 44, height: 44, padding: 0, fontSize: 22, flexShrink: 0 }}
            >
              ×
            </button>
          </div>

          <dl style={{ display: "grid", gap: 10, margin: "20px 0 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 14px", borderRadius: 10, background: "var(--bg-input)" }}>
              <dt style={{ fontSize: 13, color: "var(--text-muted)" }}>截止时间</dt>
              <dd style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gold)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {new Date(room.deadline).toLocaleString("zh-CN")}
              </dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 14px", borderRadius: 10, background: "var(--bg-input)" }}>
              <dt style={{ fontSize: 13, color: "var(--text-muted)" }}>报名情况</dt>
              <dd style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                {room.playerCount}/10
              </dd>
            </div>
          </dl>

          <section style={{ marginTop: 18 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--text)" }}>房间公告</h3>
            <div style={{
              minHeight: 72,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--border-light)",
              color: room.announcement ? "var(--text-secondary)" : "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}>
              {room.announcement || "房主暂未发布公告"}
            </div>
          </section>

          {!preview.canJoin && !preview.existing && (
            <p role="status" style={{ margin: "14px 0 0", color: "var(--red)", fontSize: 13 }}>
              {preview.unavailableReason}
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
            <button type="button" onClick={onClose} disabled={joining} className="btn-ghost" style={{ minHeight: 44, padding: "8px 18px" }}>
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={joining || (!preview.canJoin && !preview.existing)}
              className="btn-primary"
              style={{ minHeight: 44, padding: "8px 22px" }}
            >
              {joining ? "处理中..." : preview.existing ? "进入房间" : "确认加入"}
            </button>
          </div>
        </div>
      </div>
    </FeaturePortal>
  );
}
