"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success } = useToast();
  const redirect = searchParams.get("redirect") || "/";
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);

  // Forgot password modal states
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotConfirm, setForgotConfirm] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          router.replace(redirect);
        } else {
          setChecking(false);
        }
      });
  }, [router]);

  // Code cooldown timer
  useEffect(() => {
    if (codeCooldown <= 0) return;
    const t = setInterval(() => setCodeCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [codeCooldown]);

  async function sendCode() {
    if (!email || !email.endsWith("@qq.com")) {
      setError("请输入有效的QQ邮箱地址");
      return;
    }
    setSendingCode(true);
    setError("");
    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, type: "register" }),
    });
    const data = await res.json();
    setSendingCode(false);
    if (!res.ok) {
      setError(data.error || "发送失败");
      return;
    }
    setCodeCooldown(60);
    success("验证码已发送，请查收QQ邮箱");
  }

  async function sendForgotCode() {
    if (!forgotEmail || !forgotEmail.endsWith("@qq.com")) {
      setForgotError("请输入有效的QQ邮箱地址");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail, type: "reset" }),
    });
    const data = await res.json();
    setForgotLoading(false);
    if (!res.ok) {
      setForgotError(data.error || "发送失败");
      return;
    }
    setForgotStep(2);
  }

  async function resetPassword() {
    if (forgotPassword.length < 11) {
      setForgotError("密码至少11位");
      return;
    }
    if (forgotPassword !== forgotConfirm) {
      setForgotError("两次密码不一致");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail, code: forgotCode, newPassword: forgotPassword }),
    });
    const data = await res.json();
    setForgotLoading(false);
    if (!res.ok) {
      setForgotError(data.error || "重置失败");
      return;
    }
    success("密码已重置，请登录");
    setShowForgot(false);
    setForgotStep(1);
    setForgotEmail("");
    setForgotCode("");
    setForgotPassword("");
    setForgotConfirm("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "register" && !code) {
      setError("请先发送并填写邮箱验证码");
      setLoading(false);
      return;
    }

    const body: Record<string, string> = { username, password };
    if (mode === "register") {
      body.email = email;
      body.code = code;
    }

    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "操作失败");
      return;
    }
    if (mode === "register") {
      success("欢迎加入王者演武堂！");
    }
    router.push(redirect);
    router.refresh();
  }

  const title = mode === "login" ? "登录" : "注册";
  const subtitle =
    mode === "login" ? "重返演武战场" : "新召唤师报到";
  const switchText =
    mode === "login" ? "没有账号？前往注册" : "已有账号？返回登录";
  const switchHref = mode === "login" ? "/register" : "/login";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "calc(100vh - 64px)",
        padding: "0 24px",
      }}
    >
      {checking ? (
        <div className="skeleton" style={{ width: 420, height: 380, borderRadius: "var(--radius)" }} />
      ) : (
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "40px 36px 36px",
          animation: "slide-up 0.5s ease-out",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            textAlign: "center",
            marginBottom: 4,
            color: "var(--text)",
          }}
        >
          {title}
        </h1>

        <p
          style={{
            fontSize: 13,
            fontWeight: 400,
            textAlign: "center",
            color: "var(--text-muted)",
            marginBottom: 32,
          }}
        >
          {subtitle}
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          {/* Username */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              召唤师名称
            </label>
            <input
              type="text"
              placeholder="请输入召唤师名称"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={2}
            />
          </div>

          {/* Email (register only) */}
          {mode === "register" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  QQ邮箱
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="email"
                    placeholder="example@qq.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={sendingCode || codeCooldown > 0}
                    className="btn-primary"
                    style={{
                      fontSize: 12,
                      padding: "8px 14px",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      opacity: sendingCode || codeCooldown > 0 ? 0.6 : 1,
                    }}
                  >
                    {sendingCode ? "发送中..." : codeCooldown > 0 ? `${codeCooldown}s` : "发送验证码"}
                  </button>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  仅用于找回密码，验证码5分钟内有效
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  验证码
                </label>
                <input
                  type="text"
                  placeholder="6位数字验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={6}
                  inputMode="numeric"
                />
              </div>
            </>
          )}

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              密码
            </label>
            <input
              type="password"
              placeholder={mode === "register" ? "请输入密码（至少 11 位）" : "请输入密码"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={11}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              className="card-red"
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-sm)",
                animation: "slide-up 0.2s ease-out",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--red)",
                  textAlign: "center",
                }}
              >
                {error}
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: "100%",
              marginTop: 6,
              padding: "14px 0",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {loading ? "请稍候..." : title}
          </button>
        </form>

        {/* Links */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 28,
            fontSize: 14,
          }}
        >
          {mode === "login" ? (
            <>
              <button
                type="button"
                onClick={() => { setShowForgot(true); setForgotStep(1); setForgotError(""); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--gold)",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  padding: 0,
                }}
              >
                忘记密码？
              </button>
              <Link
                href={switchHref}
                style={{
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {switchText}
              </Link>
            </>
          ) : (
            <Link
              href={switchHref}
              style={{
                color: "var(--text-muted)",
                fontWeight: 600,
                textDecoration: "none",
                margin: "0 auto",
              }}
            >
              {switchText}
            </Link>
          )}
        </div>
      </div>
      )}

      {/* ================================================================ */}
      {/*  FORGOT PASSWORD MODAL                                           */}
      {/* ================================================================ */}
      {showForgot && (
        <>
          <div
            onClick={() => setShowForgot(false)}
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
              padding: "32px 28px",
              width: 380,
            }}
          >
            {forgotStep === 1 ? (
              <>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 6px", textAlign: "center" }}>
                  找回密码
                </h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginBottom: 20 }}>
                  输入注册时绑定的QQ邮箱
                </p>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>QQ邮箱</label>
                  <input
                    type="email"
                    placeholder="example@qq.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </div>
                {forgotError && (
                  <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12 }}>{forgotError}</p>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowForgot(false)}
                    className="btn-ghost"
                    style={{ flex: 1, fontSize: 13 }}
                  >
                    取消
                  </button>
                  <button
                    onClick={sendForgotCode}
                    disabled={forgotLoading}
                    className="btn-primary"
                    style={{ flex: 1, fontSize: 13 }}
                  >
                    {forgotLoading ? "发送中..." : "发送验证码"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 6px", textAlign: "center" }}>
                  重置密码
                </h3>
                <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 20 }}>
                  已发送至 {forgotEmail.replace(/(.{3}).*(@.*)/, "$1***$2")}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>验证码</label>
                    <input
                      type="text"
                      placeholder="6位数字"
                      value={forgotCode}
                      onChange={(e) => setForgotCode(e.target.value)}
                      maxLength={6}
                      inputMode="numeric"
                      style={{ marginTop: 4 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>新密码</label>
                    <input
                      type="password"
                      placeholder="至少 11 位"
                      value={forgotPassword}
                      onChange={(e) => setForgotPassword(e.target.value)}
                      minLength={11}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>确认新密码</label>
                    <input
                      type="password"
                      placeholder="再次输入"
                      value={forgotConfirm}
                      onChange={(e) => setForgotConfirm(e.target.value)}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                </div>
                {forgotError && (
                  <p style={{ fontSize: 12, color: "var(--red)", margin: "12px 0 0" }}>{forgotError}</p>
                )}
                <button
                  onClick={resetPassword}
                  disabled={forgotLoading}
                  className="btn-primary"
                  style={{ width: "100%", marginTop: 16, fontSize: 13 }}
                >
                  {forgotLoading ? "处理中..." : "重置密码"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
