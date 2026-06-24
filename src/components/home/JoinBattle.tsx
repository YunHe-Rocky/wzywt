"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function JoinBattle() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!code.trim()) {
      setError("请输入房间号");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/tournaments/join-by-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "加入失败");
      return;
    }
    router.push(`/tournaments/${data.tournamentId}`);
  }

  return (
    <div style={{ width: "100%", maxWidth: 420 }}>
      <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            placeholder="输入 6 位房间号"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            style={{
              flex: 1,
              fontSize: 18,
              fontWeight: 600,
              textAlign: "center",
              letterSpacing: "0.25em",
              fontFamily: "monospace",
              padding: "14px 16px",
            }}
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ padding: "14px 32px", fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" }}
          >
            {loading ? "加入中..." : "加入战场"}
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(224, 80, 80, 0.08)",
              border: "1px solid rgba(224, 80, 80, 0.2)",
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--red)", textAlign: "center" }}>
              {error}
              {error === "请先登录" && (
                <>
                  {" — "}
                  <Link href="/login" style={{ color: "var(--gold)", textDecoration: "underline", textUnderlineOffset: 2 }}>
                    去登录
                  </Link>
                </>
              )}
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
