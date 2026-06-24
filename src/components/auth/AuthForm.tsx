"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

const PRESET_QUESTIONS = [
  "你的出生城市是？",
  "你母亲的名字是？",
  "你父亲的名字是？",
  "你第一只宠物的名字是？",
  "你最喜欢的电影角色是？",
  "你的小学名称是？",
  "你最好的朋友的名字是？",
  "你的座右铭是？",
];

const cardBg = "linear-gradient(180deg, #1a1830 0%, #12101c 100%)";
const cardBorder = "1px solid rgba(192,168,74,0.15)";
const cardShadow = "0 0 60px rgba(192,168,74,0.04), 0 4px 32px rgba(0,0,0,0.4)";
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 6, border: "1px solid rgba(192,168,74,0.12)",
  background: "rgba(255,255,255,0.03)", color: "#e0d8c0", fontSize: 13, boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#b0a060", display: "block", marginBottom: 6,
  textTransform: "uppercase", letterSpacing: 1,
};
const goldBtn: React.CSSProperties = {
  width: "100%", padding: "14px 0", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: "pointer",
  background: "linear-gradient(135deg, #d4b85a, #a08030)",
  color: "#1a1408", letterSpacing: 1,
  boxShadow: "0 4px 20px rgba(192,168,74,0.2)",
};

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success } = useToast();
  const redirect = searchParams.get("redirect") || "/";

  // Common
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Register
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Forgot password modal
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotQuestion, setForgotQuestion] = useState("");
  const [forgotAnswer, setForgotAnswer] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotConfirm, setForgotConfirm] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) router.replace(redirect);
        else setChecking(false);
      });
  }, [router]);

  // --- Handlers ---

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body: Record<string, string> = { username, password };
    if (mode === "register") {
      body.securityQuestion = securityQuestion;
      if (securityQuestion === "__custom__") body.customQuestion = customQuestion;
      body.securityAnswer = securityAnswer;
      body.confirmPassword = confirmPassword;
    }

    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || "操作失败"); return; }
    if (mode === "register") success("欢迎加入王者演武堂！");
    router.push(redirect);
    router.refresh();
  }

  async function lookupQuestion() {
    if (!forgotUsername) { setForgotError("请输入用户名"); return; }
    setForgotLoading(true); setForgotError("");
    const res = await fetch(`/api/auth/security-question?username=${encodeURIComponent(forgotUsername)}`);
    const data = await res.json();
    setForgotLoading(false);
    if (!res.ok) { setForgotError(data.error || "查询失败"); return; }
    setForgotQuestion(data.question);
    setForgotStep(2);
  }

  async function verifyAndReset() {
    if (!forgotAnswer) { setForgotError("请输入安全答案"); return; }
    if (forgotPassword.length < 11) { setForgotError("密码至少11位"); return; }
    if (forgotPassword !== forgotConfirm) { setForgotError("两次密码不一致"); return; }
    setForgotLoading(true); setForgotError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: forgotUsername,
        answer: forgotAnswer,
        newPassword: forgotPassword,
        confirmPassword: forgotConfirm,
      }),
    });
    const data = await res.json();
    setForgotLoading(false);
    if (!res.ok) { setForgotError(data.error || "重置失败"); return; }
    success("密码已重置，请登录");
    setShowForgot(false);
    resetForgot();
  }

  function resetForgot() {
    setForgotStep(1); setForgotUsername(""); setForgotQuestion("");
    setForgotAnswer(""); setForgotPassword(""); setForgotConfirm(""); setForgotError("");
  }

  const title = mode === "login" ? "登录" : "注册";
  const subtitle = mode === "login" ? "重返演武战场" : "新召唤师报到";
  const switchText = mode === "login" ? "没有账号？前往注册" : "已有账号？返回登录";
  const switchHref = mode === "login" ? "/register" : "/login";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "calc(100vh - 64px)", padding: "0 24px",
    }}>
      {checking ? (
        <div className="skeleton" style={{ width: 420, height: 380, borderRadius: "var(--radius)" }} />
      ) : (
        <div style={{
          width: "100%", maxWidth: 420, padding: "40px 36px 36px",
          borderRadius: 12, position: "relative", overflow: "hidden",
          background: cardBg, border: cardBorder, boxShadow: cardShadow,
          color: "#e0d8c0", animation: "slide-up 0.5s ease-out",
        }}>
          {/* Top glow */}
          <div style={{
            position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)",
            width: 200, height: 80,
            background: "radial-gradient(ellipse, rgba(192,168,74,0.12), transparent)",
            pointerEvents: "none",
          }} />

          {/* Title */}
          <h1 style={{
            fontSize: 28, fontWeight: 800, textAlign: "center", margin: "0 0 6px",
            background: "linear-gradient(135deg, #d4b85a, #c0a84a, #a08030)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: 2,
          }}>{title}</h1>
          <p style={{ fontSize: 13, textAlign: "center", color: "#888", margin: "0 0 28px" }}>{subtitle}</p>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(192,168,74,0.2))" }} />
            <div style={{ width: 6, height: 6, background: "#c0a84a", borderRadius: 1, transform: "rotate(45deg)" }} />
            <div style={{ flex: 1, height: 1, background: "linear-gradient(-90deg, transparent, rgba(192,168,74,0.2))" }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Username */}
            <div>
              <label style={labelStyle}>召唤师名称</label>
              <input type="text" placeholder="请输入召唤师名称" value={username}
                onChange={(e) => setUsername(e.target.value)} required minLength={2} style={inputStyle} />
            </div>

            {/* Register: security question + answer + confirm password */}
            {mode === "register" && (
              <>
                <div>
                  <label style={labelStyle}>安全问题</label>
                  <select value={securityQuestion} onChange={(e) => setSecurityQuestion(e.target.value)}
                    required style={{ ...inputStyle, cursor: "pointer" }}>
                    <option value="">请选择安全问题</option>
                    {PRESET_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                    <option value="__custom__">自定义问题...</option>
                  </select>
                </div>

                {securityQuestion === "__custom__" && (
                  <div>
                    <label style={labelStyle}>自定义问题</label>
                    <input placeholder="请输入你的安全问题" value={customQuestion}
                      onChange={(e) => setCustomQuestion(e.target.value)}
                      style={{ ...inputStyle, borderColor: "rgba(192,168,74,0.3)" }} />
                  </div>
                )}

                <div>
                  <label style={labelStyle}>安全答案</label>
                  <input placeholder="请输入答案" value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)} required style={inputStyle} />
                  <span style={{ fontSize: 10, color: "#665", display: "block", marginTop: 3 }}>
                    用于找回密码和注销账号验证
                  </span>
                </div>
              </>
            )}

            {/* Password */}
            <div>
              <label style={labelStyle}>密码</label>
              <input type="password" placeholder={mode === "register" ? "至少 11 位" : "请输入密码"}
                value={password} onChange={(e) => setPassword(e.target.value)} required minLength={11} style={inputStyle} />
            </div>

            {/* Register: confirm password */}
            {mode === "register" && (
              <div>
                <label style={labelStyle}>确认密码</label>
                <input type="password" placeholder="再次输入密码" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} required minLength={11} style={inputStyle} />
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                padding: "12px 14px", borderRadius: "var(--radius-sm)",
                animation: "slide-up 0.2s ease-out",
                background: "rgba(224,80,80,0.06)", border: "1px solid rgba(224,80,80,0.12)",
              }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--red)", textAlign: "center" }}>
                  {error}
                </p>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading}
              style={{ ...goldBtn, marginTop: 6, opacity: loading ? 0.6 : 1 }}>
              {loading ? "请稍候..." : title}
            </button>
          </form>

          {/* Links */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginTop: 28, fontSize: 14,
          }}>
            {mode === "login" ? (
              <>
                <button type="button" onClick={() => { setShowForgot(true); resetForgot(); }}
                  style={{
                    background: "none", border: "none", color: "#b0a060",
                    cursor: "pointer", fontSize: 14, fontWeight: 600, padding: 0,
                  }}>
                  忘记密码？
                </button>
                <Link href={switchHref} style={{ color: "#b0a060", fontWeight: 600, textDecoration: "none" }}>
                  {switchText}
                </Link>
              </>
            ) : (
              <Link href={switchHref} style={{
                color: "#b0a060", fontWeight: 600, textDecoration: "none", margin: "0 auto",
              }}>
                {switchText}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/*  FORGOT PASSWORD MODAL (security question based)                  */}
      {/* ================================================================ */}
      {showForgot && (
        <>
          <div onClick={() => setShowForgot(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            zIndex: 1001, padding: "32px 28px", width: 380, maxWidth: "90vw",
            borderRadius: 12, border: cardBorder, background: cardBg, boxShadow: cardShadow,
            color: "#e0d8c0",
          }}>
            <div style={{
              position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
              width: 160, height: 60,
              background: "radial-gradient(ellipse, rgba(192,168,74,0.1), transparent)",
              pointerEvents: "none",
            }} />

            {forgotStep === 1 ? (
              <>
                <h3 style={{
                  fontSize: 18, fontWeight: 700, color: "#e0d8c0",
                  margin: "0 0 6px", textAlign: "center",
                }}>
                  找回密码
                </h3>
                <p style={{ fontSize: 11, color: "#888", textAlign: "center", marginBottom: 18 }}>
                  输入用户名以验证身份
                </p>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>召唤师名称</label>
                  <input placeholder="请输入召唤师名称" value={forgotUsername}
                    onChange={(e) => setForgotUsername(e.target.value)} style={inputStyle} />
                </div>
                {forgotError && (
                  <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12, textAlign: "center" }}>
                    {forgotError}
                  </p>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setShowForgot(false)} style={{
                    flex: 1, padding: "10px 0", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6, fontSize: 13, color: "#888", background: "transparent", cursor: "pointer",
                  }}>取消</button>
                  <button onClick={lookupQuestion} disabled={forgotLoading} style={{
                    ...goldBtn, flex: 1, fontSize: 13, padding: "10px 0", opacity: forgotLoading ? 0.6 : 1,
                  }}>
                    {forgotLoading ? "查询中..." : "下一步"}
                  </button>
                </div>
              </>
            ) : forgotStep === 2 ? (
              <>
                <h3 style={{
                  fontSize: 18, fontWeight: 700, color: "#e0d8c0",
                  margin: "0 0 6px", textAlign: "center",
                }}>
                  验证安全问题
                </h3>
                <p style={{ fontSize: 11, color: "#888", textAlign: "center", marginBottom: 14 }}>
                  账号：<span style={{ color: "#c0a84a" }}>{forgotUsername}</span>
                </p>
                <div style={{
                  background: "rgba(192,168,74,0.04)", border: "1px solid rgba(192,168,74,0.1)",
                  borderRadius: 8, padding: "12px 14px", marginBottom: 14,
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: "#b0a060",
                    display: "block", marginBottom: 4,
                  }}>安全问题</span>
                  <span style={{ fontSize: 13, color: "#e0d8c0", fontWeight: 500 }}>
                    {forgotQuestion}
                  </span>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>安全答案</label>
                  <input placeholder="请输入答案" value={forgotAnswer}
                    onChange={(e) => setForgotAnswer(e.target.value)} style={inputStyle} />
                </div>
                {forgotError && (
                  <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12, textAlign: "center" }}>
                    {forgotError}
                  </p>
                )}
                <button onClick={() => { setForgotStep(3); setForgotError(""); }}
                  style={{ ...goldBtn, fontSize: 13, padding: "10px 0", marginBottom: 10 }}>
                  继续设置新密码
                </button>
                <div style={{ textAlign: "center" }}>
                  <button onClick={() => setShowForgot(false)} style={{
                    background: "none", border: "none", color: "#888", fontSize: 11, cursor: "pointer",
                  }}>取消</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{
                  fontSize: 18, fontWeight: 700, color: "#e0d8c0",
                  margin: "0 0 6px", textAlign: "center",
                }}>
                  重置密码
                </h3>
                <p style={{ fontSize: 11, color: "#888", textAlign: "center", marginBottom: 18 }}>
                  为 <span style={{ color: "#c0a84a" }}>{forgotUsername}</span> 设置新密码
                </p>
                <div style={{
                  display: "flex", flexDirection: "column", gap: 12,
                  marginBottom: forgotError ? 12 : 18,
                }}>
                  <div>
                    <label style={labelStyle}>新密码</label>
                    <input type="password" placeholder="至少 11 位" value={forgotPassword}
                      onChange={(e) => setForgotPassword(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>确认新密码</label>
                    <input type="password" placeholder="再次输入" value={forgotConfirm}
                      onChange={(e) => setForgotConfirm(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                {forgotError && (
                  <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12, textAlign: "center" }}>
                    {forgotError}
                  </p>
                )}
                <button onClick={verifyAndReset} disabled={forgotLoading} style={{
                  ...goldBtn, fontSize: 13, padding: "10px 0", opacity: forgotLoading ? 0.6 : 1,
                }}>
                  {forgotLoading ? "重置中..." : "确认重置"}
                </button>
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button onClick={() => setShowForgot(false)} style={{
                    background: "none", border: "none", color: "#888", fontSize: 11, cursor: "pointer",
                  }}>取消</button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <style jsx>{`
        @media (max-width: 480px) {
          .auth-form-container { padding: 0 16px !important; }
        }
      `}</style>
    </div>
  );
}
