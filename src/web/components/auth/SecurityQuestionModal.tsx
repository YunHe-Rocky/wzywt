"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/web/components/ui/Toast";
import { FeaturePortal } from "@/web/components/ui/FeaturePortal";
import { changePassword as changePasswordRequest } from "@/features/auth/client/api";


const goldBtn: React.CSSProperties = {
  width: "100%", minHeight: 44, padding: "11px 0", border: "none",
  borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 700, cursor: "pointer",
  background: "linear-gradient(135deg, var(--gold-light), var(--gold-dim))",
  color: "#fff", letterSpacing: 0.5,
  boxShadow: "0 2px 8px var(--gold-alpha-10)",
};

const inputStyle: React.CSSProperties = {
  width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
  background: "var(--bg-input)", color: "var(--text)", fontSize: 16, boxSizing: "border-box",
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
  const modalRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);
  const newPwRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const loadingRef = useRef(loading);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { window.requestAnimationFrame(() => returnFocusRef.current?.focus()); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Focus first input on open
    setTimeout(() => {
      if (step === 1) answerRef.current?.focus();
      else newPwRef.current?.focus();
    }, 100);

    // Esc to close and focus trap
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); handleClose(); return; }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  if (!open) return null;

  async function verifyAnswer() {
    if (!answer) { setError("请输入安全答案"); return; }
    setLoading(true); setError("");
    try {
      const { ok, data } = await changePasswordRequest({ answer, verifyOnly: true });
      if (!ok) { setError(data.error || "验证失败，请核对答案后重试。"); return; }
      if (data.verified) setStep(2);
    } catch {
      setError("验证请求未完成，请检查网络后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function changePassword() {
    if (newPassword.length < 11) { setError("密码至少11位"); return; }
    if (newPassword !== confirmPassword) { setError("两次密码不一致"); return; }
    setLoading(true); setError("");
    try {
      const { ok, data } = await changePasswordRequest({ answer, newPassword, confirmPassword });
      if (!ok) { setError(data.error || "修改失败，请检查输入后重试。"); return; }
      success("密码已修改");
      setStep(1); setAnswer(""); setNewPassword(""); setConfirmPassword(""); setError("");
      onCloseRef.current();
    } catch {
      setError("密码修改请求未完成，请检查网络后重试。原密码保持不变。");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (loadingRef.current) return;
    setStep(1); setAnswer(""); setNewPassword(""); setConfirmPassword(""); setError(""); onCloseRef.current();
  }

  return (
    <FeaturePortal>
      <>
      <div onMouseDown={handleClose} className="modal-backdrop" aria-hidden="true" />
      <div ref={modalRef} className="modal-card" role="dialog" aria-modal="true" aria-label="修改密码" aria-busy={loading}>
        <div className="modal-glow" />

        {step === 1 ? (
          <>
            {/* Step badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "var(--gold-alpha-08)", border: "1px solid var(--gold-alpha-20)",
              borderRadius: 20, padding: "3px 12px", marginBottom: 16,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%", background: "var(--gold)",
                color: "#fff", fontSize: 10, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>1</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--gold-dim)", letterSpacing: 0.5 }}>
                验证身份
              </span>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--gold-light)", margin: "0 0 4px" }}>修改密码</h3>
            <p style={{ fontSize: 11, color: "#888", margin: "0 0 18px" }}>请回答以下安全问题确认身份</p>

            <div style={{
              background: "var(--gold-alpha-04)", border: "1px solid var(--gold-alpha-10)",
              borderRadius: 8, padding: "12px 14px", marginBottom: 14,
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--gold-dim)", display: "block", marginBottom: 4 }}>
                安全问题
              </span>
              <span style={{ fontSize: 13, color: "var(--gold-light)", fontWeight: 500 }}>{question}</span>
            </div>

            <div style={{ marginBottom: error ? 12 : 18 }}>
              <label htmlFor="security-answer" style={labelStyle}>安全答案</label>
              <input
                ref={answerRef}
                id="security-answer"
                name="security-answer"
                placeholder="请输入你的答案"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                style={inputStyle}
                autoComplete="off"
              />
            </div>

            {error && (
              <p role="alert" style={{
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

            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--gold-light)", margin: "0 0 4px" }}>设置新密码</h3>
            <p style={{ fontSize: 11, color: "#888", margin: "0 0 18px" }}>身份验证通过，请输入新密码</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: error ? 12 : 18 }}>
              <div>
                <label htmlFor="new-password" style={labelStyle}>新密码</label>
                <input ref={newPwRef} type="password" placeholder="至少 11 位"
                  id="new-password" name="new-password"
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  style={inputStyle} autoComplete="new-password" />
              </div>
              <div>
                <label htmlFor="confirm-password" style={labelStyle}>确认新密码</label>
                <input type="password" placeholder="再次输入"
                  id="confirm-password" name="confirm-password"
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  style={inputStyle} autoComplete="new-password" />
              </div>
            </div>

            {error && (
              <p role="alert" style={{
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
          <button type="button" onClick={handleClose} disabled={loading} className="btn-subtle">
            取消
          </button>
        </div>
      </div>
      </>
    </FeaturePortal>
  );
}
