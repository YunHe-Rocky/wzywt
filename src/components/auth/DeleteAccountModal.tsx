"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export function DeleteAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { success } = useToast();

  if (!open) return null;

  const canDelete = confirmText === "DELETE" && password.length >= 11;

  async function doDelete() {
    if (!canDelete) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "注销失败");
      return;
    }
    success("账号已注销");
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000 }}
      />
      <div
        className="card"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1001,
          padding: "28px",
          width: 400,
          maxWidth: "90vw",
        }}
      >
        <h3 style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--red)",
          textAlign: "center",
          margin: "0 0 6px",
        }}>
          注销账号
        </h3>
        <p style={{
          fontSize: 12,
          color: "var(--text-muted)",
          textAlign: "center",
          marginBottom: 18,
          lineHeight: 1.6,
        }}>
          此操作<strong style={{ color: "var(--red)" }}>不可撤销</strong>，全部数据将被永久删除
        </p>

        <div style={{
          background: "rgba(224,80,80,0.04)",
          border: "1px solid rgba(224,80,80,0.12)",
          borderRadius: "var(--radius-sm)",
          padding: "10px 14px",
          marginBottom: 18,
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.8,
        }}>
          将删除：账号 · 密码 · 分路偏好 · 段位 · 英雄战力 · 赛事记录 · 管理权限
        </div>

        {/* Step 1 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              display: "inline-flex",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "var(--gold)",
              color: "#1a1408",
              fontSize: 11,
              fontWeight: 700,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>1</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
              输入 <code style={{
                background: "rgba(224,80,80,0.08)",
                padding: "1px 4px",
                borderRadius: 3,
                fontSize: 11,
                color: "var(--red)",
              }}>DELETE</code> 确认删除
            </span>
          </div>
          <input
            type="text"
            placeholder="DELETE"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </div>

        {/* Step 2 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              display: "inline-flex",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "var(--gold)",
              color: "#1a1408",
              fontSize: 11,
              fontWeight: 700,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>2</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>输入密码确认身份</span>
          </div>
          <input
            type="password"
            placeholder="当前密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p style={{
            fontSize: 12,
            color: "var(--red)",
            textAlign: "center",
            marginBottom: 12,
            padding: "8px 12px",
            background: "rgba(224,80,80,0.06)",
            borderRadius: "var(--radius-sm)",
          }}>{error}</p>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px 0",
              textAlign: "center",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-muted)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            取消
          </button>
          <button
            onClick={doDelete}
            disabled={!canDelete || loading}
            style={{
              flex: 1,
              padding: "10px 0",
              textAlign: "center",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: canDelete ? "var(--red)" : "rgba(224,80,80,0.3)",
              cursor: canDelete ? "pointer" : "not-allowed",
              opacity: !canDelete || loading ? 0.5 : 1,
            }}
          >
            {loading ? "注销中..." : "确认注销"}
          </button>
        </div>

        <p style={{
          textAlign: "center",
          marginTop: 10,
          marginBottom: 0,
          fontSize: 11,
          color: "var(--text-muted)",
        }}>
          完成①②步后按钮自动激活
        </p>
      </div>
    </>
  );
}
