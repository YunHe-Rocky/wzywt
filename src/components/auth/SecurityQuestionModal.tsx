"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

const modalBackdrop: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
};
const modalCard: React.CSSProperties = {
  position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
  zIndex: 1001, padding: "32px 28px", width: 380, maxWidth: "90vw",
  borderRadius: 12, border: "1px solid rgba(192,168,74,0.15)",
  background: "linear-gradient(180deg, #1a1830 0%, #12101c 100%)",
  boxShadow: "0 0 60px rgba(192,168,74,0.04), 0 8px 40px rgba(0,0,0,0.5)",
  color: "#e0d8c0",
};

const glowStyle: React.CSSProperties = {
  position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
  width: 160, height: 60, background: "radial-gradient(ellipse, rgba(192,168,74,0.1), transparent)",
  pointerEvents: "none" as const,
};

const goldBtn: React.CSSProperties = {
  width: "100%", padding: "11px 0", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer",
  background: "linear-gradient(135deg, #d4b85a, #a08030)",
  color: "#1a1408", letterSpacing: 0.5,
  boxShadow: "0 3px 14px rgba(192,168,74,0.18)",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(192,168,74,0.12)",
  background: "rgba(255,255,255,0.03)", color: "#e0d8c0", fontSize: 13, boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: "#999", display: "block", marginBottom: 4,
};

export function SecurityQuestionModal({
  question,
  open,
  onClose,
}: {
  question: string;
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { success } = useToast();

  if (!open) return null;

  async function verifyAnswer() {
    if (!answer) { setError("请输入安全答案"); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer, verifyOnly: true }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || "验证失败"); return; }
    if (data.verified) setStep(2);
  }

  async function changePassword() {
    if (newPassword.length < 11) { setError("密码至少11位"); return; }
    if (newPassword !== confirmPassword) { setError("两次密码不一致"); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer, newPassword, confirmPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || "修改失败"); return; }
    success("密码已修改");
    handleClose();
  }

  function handleClose() {
    setStep(1); setAnswer(""); setNewPassword(""); setConfirmPassword(""); setError(""); onClose();
  }

  return (
    <>
      <div onClick={handleClose} style={modalBackdrop} />
      <div className="card" style={modalCard}>
        <div style={glowStyle} />

        {step === 1 ? (
          <>
            {/* Step badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(192,168,74,0.08)", border: "1px solid rgba(192,168,74,0.15)",
              borderRadius: 20, padding: "3px 12px", marginBottom: 16,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%", background: "#c0a84a",
                color: "#1a1408", fontSize: 10, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>1</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#b0a060", letterSpacing: 0.5 }}>
                验证身份
              </span>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e0d8c0", margin: "0 0 4px" }}>修改密码</h3>
            <p style={{ fontSize: 11, color: "#888", margin: "0 0 18px" }}>请回答以下安全问题确认身份</p>

            <div style={{
              background: "rgba(192,168,74,0.04)", border: "1px solid rgba(192,168,74,0.1)",
              borderRadius: 8, padding: "12px 14px", marginBottom: 14,
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#b0a060", display: "block", marginBottom: 4 }}>
                安全问题
              </span>
              <span style={{ fontSize: 13, color: "#e0d8c0", fontWeight: 500 }}>{question}</span>
            </div>

            <div style={{ marginBottom: error ? 12 : 18 }}>
              <label style={labelStyle}>安全答案</label>
              <input
                placeholder="请输入你的答案"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                style={inputStyle}
              />
            </div>

            {error && (
              <p style={{
                fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 12,
                padding: "8px 12px", background: "rgba(224,80,80,0.06)", borderRadius: "var(--radius-sm)",
              }}>{error}</p>
            )}

            <button onClick={verifyAnswer} disabled={loading}
              style={{ ...goldBtn, opacity: loading ? 0.6 : 1 }}>
              {loading ? "验证中..." : "验证并继续"}
            </button>
          </>
        ) : (
          <>
            {/* Step badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(80,176,80,0.08)", border: "1px solid rgba(80,176,80,0.15)",
              borderRadius: 20, padding: "3px 12px", marginBottom: 16,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%", background: "#50b050",
                color: "#fff", fontSize: 10, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>✓</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#50b050", letterSpacing: 0.5 }}>
                身份已验证
              </span>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e0d8c0", margin: "0 0 4px" }}>设置新密码</h3>
            <p style={{ fontSize: 11, color: "#888", margin: "0 0 18px" }}>身份验证通过，请输入新密码</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: error ? 12 : 18 }}>
              <div>
                <label style={labelStyle}>新密码</label>
                <input type="password" placeholder="至少 11 位"
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>确认新密码</label>
                <input type="password" placeholder="再次输入"
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  style={inputStyle} />
              </div>
            </div>

            {error && (
              <p style={{
                fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 12,
                padding: "8px 12px", background: "rgba(224,80,80,0.06)", borderRadius: "var(--radius-sm)",
              }}>{error}</p>
            )}

            <button onClick={changePassword} disabled={loading}
              style={{ ...goldBtn, opacity: loading ? 0.6 : 1 }}>
              {loading ? "修改中..." : "确认修改"}
            </button>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button onClick={handleClose}
            style={{ background: "none", border: "none", color: "#888", fontSize: 11, cursor: "pointer" }}>
            取消
          </button>
        </div>
      </div>
    </>
  );
}
