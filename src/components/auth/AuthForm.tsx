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
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
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
        {/* Title */}
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

        {/* Subtitle */}
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
              placeholder="请输入密码（至少 4 位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
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

        {/* Switch link */}
        <p
          style={{
            textAlign: "center",
            marginTop: 28,
            marginBottom: 0,
            fontSize: 14,
            color: "var(--text-muted)",
          }}
        >
          <Link
            href={switchHref}
            style={{
              color: "var(--text-muted)",
              fontWeight: 600,
              textDecoration: "none",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.color = "var(--gold)";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.color = "var(--text-muted)";
            }}
          >
            {switchText}
          </Link>
        </p>
      </div>
      )}
    </div>
  );
}
