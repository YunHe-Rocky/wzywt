"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    router.push("/tournaments");
    router.refresh();
  }

  const title = mode === "login" ? "登录" : "注册";
  const switchText = mode === "login" ? "没有账号？去注册" : "已有账号？去登录";
  const switchHref = mode === "login" ? "/register" : "/login";

  return (
    <div className="max-w-sm mx-auto mt-24 p-6 bg-gray-900 rounded-lg">
      <h1 className="text-2xl font-bold text-center mb-6">{title}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text" placeholder="用户名" value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 outline-none"
          required minLength={2}
        />
        <input
          type="password" placeholder="密码" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 outline-none"
          required minLength={4}
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit" disabled={loading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded font-medium disabled:opacity-50"
        >
          {loading ? "请稍候..." : title}
        </button>
      </form>
      <p className="text-center mt-4 text-sm text-gray-400">
        <a href={switchHref} className="text-blue-400 hover:underline">{switchText}</a>
      </p>
    </div>
  );
}
