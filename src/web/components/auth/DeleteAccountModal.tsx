"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/web/components/ui/Toast";
import { FeaturePortal } from "@/web/components/ui/FeaturePortal";
import { deleteAccount, getCurrentUser } from "@/features/auth/client/api";

const inputStyle: React.CSSProperties = {
  width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 6,
  border: "1px solid var(--red-alpha-15)", background: "var(--bg-input)",
  color: "var(--text)", fontSize: 16, boxSizing: "border-box",
};

export function DeleteAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { success } = useToast();
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const confirmInputId = useId();
  const answerInputId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const loadingRef = useRef(loading);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  const closeDialog = useCallback(() => {
    if (loadingRef.current) return;
    setConfirmText("");
    setAnswer("");
    setError("");
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;
    setConfirmText(""); setAnswer(""); setQuestion(""); setError("");
    getCurrentUser()
      .then(({ data }) => {
        if (data.user?.securityQuestion) setQuestion(data.user.securityQuestion);
        else setError("未读取到安全问题，请关闭后重试。");
      })
      .catch(() => setError("安全问题加载失败，请检查网络后关闭并重试。"));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => confirmInputRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [closeDialog, open]);

  if (!open) return null;

  const canDelete = confirmText === "DELETE" && answer.length > 0;

  async function doDelete() {
    if (!canDelete) return;
    setLoading(true); setError("");
    try {
      const { ok, data } = await deleteAccount(answer);
      if (!ok) { setError(data.error || "注销失败，请核对安全答案后重试。"); return; }
      success("账号已注销");
      setConfirmText(""); setAnswer(""); setError("");
      onCloseRef.current();
      router.push("/");
      router.refresh();
    } catch {
      setError("注销请求未完成，请检查网络后重试。账号尚未被删除。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FeaturePortal>
      <>
      <div onMouseDown={closeDialog} className="modal-backdrop" aria-hidden="true" />
      <div ref={dialogRef} className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`} aria-busy={loading} style={{ borderColor: "var(--red-alpha-08)", boxShadow: "0 8px 40px rgba(0,0,0,0.35)" }}>
        <div style={{
          position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
          width: 160, height: 60,
          background: "radial-gradient(ellipse, var(--red-alpha-06), transparent)",
          pointerEvents: "none",
        }} />

        <h2 id={titleId} style={{
          fontSize: 18, fontWeight: 700, color: "var(--red)",
          textAlign: "center", margin: "0 0 6px",
        }}>
          注销账号
        </h2>
        <p id={descriptionId} style={{
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
            <label htmlFor={confirmInputId} style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
              输入 <code style={{
                background: "var(--red-alpha-08)", padding: "1px 4px",
                borderRadius: 3, fontSize: 11, color: "var(--red)",
              }}>DELETE</code> 确认删除
            </label>
          </div>
          <input ref={confirmInputRef} id={confirmInputId} type="text" inputMode="text" autoComplete="off" placeholder="DELETE" value={confirmText}
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
            <label htmlFor={answerInputId} style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>验证安全问题</label>
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
          <input id={answerInputId} type="text" placeholder="安全答案" autoComplete="off" value={answer}
            onChange={(e) => setAnswer(e.target.value)} style={inputStyle} />
        </div>

        {error && (
          <p id={errorId} role="alert" style={{
            fontSize: 12, color: "var(--red)", textAlign: "center",
            marginBottom: 12, padding: "8px 12px",
            background: "var(--red-alpha-06)", borderRadius: 6,
          }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={closeDialog} disabled={loading} className="btn-subtle" style={{ flex: 1 }}>取消</button>
          <button type="button" onClick={() => void doDelete()} disabled={!canDelete || loading} className="btn-danger" style={{ flex: 1 }}>{loading ? "注销中…" : "确认注销"}</button>
        </div>

        <p style={{
          textAlign: "center", marginTop: 10, marginBottom: 0,
          fontSize: 11, color: "var(--text-muted)",
        }}>
          完成①②步后按钮自动激活
        </p>
      </div>
      </>
    </FeaturePortal>
  );
}
