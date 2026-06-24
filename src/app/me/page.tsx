"use client";

import { useState } from "react";
import { RolePreferenceEditor } from "@/components/me/RolePreferenceEditor";
import { HeroPowerEditor } from "@/components/me/HeroPowerEditor";
import { DeleteAccountModal } from "@/components/auth/DeleteAccountModal";

export default function MePage() {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 32,
        animation: "fade-in 0.4s ease-out",
      }}
    >
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--text)",
        }}
      >
        个人空间
      </h1>
      <div style={{ animation: "slide-up 0.4s 0.05s ease-out both" }}>
        <RolePreferenceEditor />
      </div>
      <div style={{ animation: "slide-up 0.4s 0.1s ease-out both" }}>
        <HeroPowerEditor />
      </div>

      {/* Danger zone */}
      <div
        style={{
          animation: "slide-up 0.4s 0.15s ease-out both",
          padding: "20px",
          border: "1px solid var(--red)",
          borderRadius: "var(--radius)",
          background: "rgba(224,80,80,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--red)", marginBottom: 4 }}>
              危险区域
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              注销后所有数据将被永久删除，无法恢复
            </div>
          </div>
          <button
            onClick={() => setShowDelete(true)}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: "var(--red)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
          >
            注销账号
          </button>
        </div>
      </div>

      <DeleteAccountModal open={showDelete} onClose={() => setShowDelete(false)} />
    </div>
  );
}
