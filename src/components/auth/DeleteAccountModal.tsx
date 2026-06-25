"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 6,
  border: "1px solid var(--red-alpha-15)", background: "var(--bg-input)",
  color: "var(--text)", fontSize: 13, boxSizing: "border-box",
};

export function DeleteAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { success } = useToast();

  useEffect(() => {
    if (!open) return;
    setConfirmText(""); setAnswer(""); setError("");
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.securityQuestion) setQuestion(d.user.securityQuestion);
      });
  }, [open]);

  if (!open) return null;

  const canDelete = confirmText === "DELETE" && answer.length > 0;

  async function doDelete() {
    if (!canDelete) return;
    setLoading(true); setError("");
    const res = await fetch("/api/auth/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || "注销失败"); return; }
    success("账号已注销");
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <div onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 1001, padding: "28px", width: 400, maxWidth: "90vw",
        borderRadius: "var(--radius-lg)", border: "1px solid var(--red-alpha-08)",
        background: "var(--bg-card)", color: "var(--text)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}>
        {/* Top glow (red) */}
        <div style={{
          position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
          width: 160, height: 60,
          background: "radial-gradient(ellipse, var(--red-alpha-06), transparent)",
          pointerEvents: "none",
        }} />

        <h3 style={{
          fontSize: 18, fontWeight: 700, color: "var(--red)",
          textAlign: "center", margin: "0 0 6px",
        }}>
          注销账号
        </h3>
        <p style={{
          fontSize: 12, color: "var(--text-muted)", textAlign: "center",
          marginBottom: 18, lineHeight: 1.6,
        }}>
          此操作<strong style={{ color: "var(--red)" }}>不可撤销</strong>，全部数据将被永久删除
        </p>

        <div style={{
          background: "var(--red-alpha-04)", border: "1px solid var(--red-alpha-08)",
          borderRadius: 6, padding: "8px 12px", marginBottom: 18,
          fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6,
        }}>
          将删除：账号 · 密码 · 安全问题 · 分路偏好 · 段位 · 英雄战力 · 赛事记录 · 管理权限
        </div>

        {/* Step 1: DELETE confirm */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              width: 18, height: 18, borderRadius: "50%", background: "var(--red)",
              color: "#fff", fontSize: 10, fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>1</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
              输入 <code style={{
                background: "var(--red-alpha-08)", padding: "1px 4px",
                borderRadius: 3, fontSize: 11, color: "var(--red)",
              }}>DELETE</code> 确认删除
            </span>
          </div>
          <input type="text" placeholder="DELETE" value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)} style={inputStyle} />
        </div>

        {/* Step 2: Security question */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              width: 18, height: 18, borderRadius: "50%", background: "var(--red)",
              color: "#fff", fontSize: 10, fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>2</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>验证安全问题</span>
          </div>
          {question ? (
            <div style={{
              background: "var(--red-alpha-04)", border: "1px solid var(--red-alpha-08)",
              borderRadius: 6, padding: "10px 12px", marginBottom: 8,
            }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>安全问题</span>
              <span style={{ fontSize: 12, color: "var(--text)" }}>{question}</span>
            </div>
          ) : (
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 8px" }}>加载安全问题中...</p>
          )}
          <input type="text" placeholder="安全答案" value={answer}
            onChange={(e) => setAnswer(e.target.value)} style={inputStyle} />
        </div>

        {error && (
          <p style={{
            fontSize: 12, color: "var(--red)", textAlign: "center",
            marginBottom: 12, padding: "8px 12px",
            background: "var(--red-alpha-06)", borderRadius: 6,
          }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "11px 0", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6, fontSize: 13, color: "var(--text-muted)",
            background: "transparent", cursor: "pointer",
          }}>取消</button>
          <button onClick={doDelete} disabled={!canDelete || loading} style={{
            flex: 1, padding: "11px 0", border: "none", borderRadius: 6,
            fontSize: 13, fontWeight: 600, color: "#fff",
            cursor: canDelete ? "pointer" : "not-allowed",
            background: canDelete
              ? "var(--red)"
              : "var(--red-dim)",
            boxShadow: canDelete ? "0 3px 12px var(--red-alpha-15)" : "none",
            opacity: (!canDelete || loading) ? 0.5 : 1,
          }}>{loading ? "注销中..." : "确认注销"}</button>
        </div>

        <p style={{
          textAlign: "center", marginTop: 10, marginBottom: 0,
          fontSize: 11, color: "var(--text-muted)",
        }}>
          完成①②步后按钮自动激活
        </p>
      </div>
    </>
  );
}
