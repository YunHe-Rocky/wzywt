"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

const PRESET_QUESTIONS = [
  "你的出生城市是？", "你母亲的名字是？", "你父亲的名字是？",
  "你第一只宠物的名字是？", "你最喜欢的电影角色是？",
  "你的小学名称是？", "你最好的朋友的名字是？", "你的座右铭是？",
];

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx={12} cy={12} r={3} />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1={1} y1={1} x2={23} y2={23} />
      </>
    )}
  </svg>
);

const inputClass = "w-full px-3.5 py-2.5 rounded-md border border-gold/10 bg-white/[0.02] text-text text-[13px] placeholder:text-text-muted focus:border-gold/20 focus:outline-none transition-colors box-border";
const labelClass = "block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5";
const btnGold = "w-full py-3.5 rounded-md text-[15px] font-bold tracking-wider bg-gradient-to-b from-gold-light via-gold to-gold-dim text-root hover:brightness-105 transition-all disabled:opacity-50 border border-gold/10 cursor-pointer";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success } = useToast();
  const redirect = searchParams.get("redirect") || "/";

  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Register
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Forgot password
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotQuestion, setForgotQuestion] = useState("");
  const [forgotAnswer, setForgotAnswer] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotConfirm, setForgotConfirm] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showForgotPw, setShowForgotPw] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.user) router.replace(redirect); else setChecking(false);
    });
  }, [router, redirect]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    const body: Record<string, string> = { username, password };
    if (mode === "register") {
      body.securityQuestion = securityQuestion;
      if (securityQuestion === "__custom__") body.customQuestion = customQuestion;
      body.securityAnswer = securityAnswer;
      body.confirmPassword = confirmPassword;
    }
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json(); setLoading(false);
    if (!res.ok) { setError(data.error || "操作失败"); return; }
    if (mode === "register") success("欢迎加入王者演武堂！");
    router.push(redirect); router.refresh();
  }

  async function lookupQuestion() {
    if (!forgotUsername) { setForgotError("请输入用户名"); return; }
    setForgotLoading(true); setForgotError("");
    const res = await fetch(`/api/auth/security-question?username=${encodeURIComponent(forgotUsername)}`);
    const data = await res.json(); setForgotLoading(false);
    if (!res.ok) { setForgotError(data.error || "查询失败"); return; }
    setForgotQuestion(data.question); setForgotStep(2);
  }

  async function verifyAndReset() {
    if (!forgotAnswer) { setForgotError("请输入安全答案"); return; }
    if (forgotPassword.length < 11) { setForgotError("密码至少11位"); return; }
    if (forgotPassword !== forgotConfirm) { setForgotError("两次密码不一致"); return; }
    setForgotLoading(true); setForgotError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: forgotUsername, answer: forgotAnswer, newPassword: forgotPassword, confirmPassword: forgotConfirm }),
    });
    const data = await res.json(); setForgotLoading(false);
    if (!res.ok) { setForgotError(data.error || "重置失败"); return; }
    success("密码已重置，请登录");
    setShowForgot(false); setForgotStep(1); setForgotUsername(""); setForgotQuestion("");
    setForgotAnswer(""); setForgotPassword(""); setForgotConfirm(""); setForgotError("");
  }

  const title = mode === "login" ? "登录" : "注册";
  const subtitle = mode === "login" ? "重返演武战场" : "新召唤师报到";
  const switchText = mode === "login" ? "没有账号？前往注册" : "已有账号？返回登录";
  const switchHref = mode === "login" ? "/register" : "/login";

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-56px)] px-4 sm:px-6">
      {checking ? (
        <div className="skeleton rounded-lg w-[420px] h-[400px]" />
      ) : (
        <div className="w-full max-w-[420px] px-9 py-10 rounded-xl relative overflow-hidden animate-slide-up"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 4px 24px rgba(0,0,0,0.25)" }}>
          {/* Top glow */}
          <div className="absolute -top-15 left-1/2 -translate-x-1/2 w-[200px] h-20 pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(184,152,96,0.08), transparent)" }} />

          <h1 className="text-[28px] font-extrabold text-center m-0 mb-1.5 tracking-wider text-gold-light">{title}</h1>
          <p className="text-[13px] text-center text-text-muted mb-7">{subtitle}</p>

          {/* Divider */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-gold/20" />
            <div className="w-1.5 h-1.5 bg-gold-dim rounded-sm rotate-45" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-gold/20" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>召唤师名称</label>
              <input type="text" placeholder="请输入召唤师名称" value={username}
                onChange={e => setUsername(e.target.value)} required minLength={2} className={inputClass} />
            </div>

            {mode === "register" && (
              <>
                <div>
                  <label className={labelClass}>安全问题</label>
                  <select value={securityQuestion} onChange={e => setSecurityQuestion(e.target.value)} required className={`${inputClass} cursor-pointer`}>
                    <option value="">请选择安全问题</option>
                    {PRESET_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                    <option value="__custom__">自定义问题...</option>
                  </select>
                </div>
                {securityQuestion === "__custom__" && (
                  <div>
                    <label className={labelClass}>自定义问题</label>
                    <input placeholder="请输入你的安全问题" value={customQuestion}
                      onChange={e => setCustomQuestion(e.target.value)} className={inputClass} style={{ borderColor: "rgba(184,152,96,0.3)" }} />
                  </div>
                )}
                <div>
                  <label className={labelClass}>安全答案</label>
                  <input placeholder="请输入答案" value={securityAnswer}
                    onChange={e => setSecurityAnswer(e.target.value)} required className={inputClass} />
                  <span className="block text-[10px] text-text-muted/60 mt-1">用于找回密码和注销账号验证</span>
                </div>
              </>
            )}

            {/* Password */}
            <div>
              <label className={labelClass}>密码</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} placeholder={mode === "register" ? "至少 11 位" : "请输入密码"}
                  value={password} onChange={e => setPassword(e.target.value)} required minLength={11} className={`${inputClass} pr-10`} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center bg-transparent border-none cursor-pointer ${showPassword ? "text-gold" : "text-text-muted"}`}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}>
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {mode === "register" && (
              <div>
                <label className={labelClass}>确认密码</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} placeholder="再次输入密码" value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)} required minLength={11} className={`${inputClass} pr-10`} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className={`absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center bg-transparent border-none cursor-pointer ${showPassword ? "text-gold" : "text-text-muted"}`}>
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="px-3.5 py-3 rounded-md bg-red/5 border border-red/15 animate-slide-up">
                <p className="m-0 text-[13px] font-medium text-red text-center">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading} className={`${btnGold} mt-1.5`}>
              {loading ? "请稍候..." : title}
            </button>
          </form>

          <div className="flex justify-between items-center mt-7 text-sm">
            {mode === "login" ? (
              <>
                <button type="button" onClick={() => { setShowForgot(true); setForgotStep(1); setForgotUsername(""); setForgotQuestion(""); setForgotAnswer(""); setForgotPassword(""); setForgotConfirm(""); setForgotError(""); }}
                  className="bg-transparent border-none text-gold-dim font-semibold cursor-pointer text-sm p-0">忘记密码？</button>
                <Link href={switchHref} className="text-gold-dim font-semibold no-underline">{switchText}</Link>
              </>
            ) : (
              <Link href={switchHref} className="text-gold-dim font-semibold no-underline mx-auto">{switchText}</Link>
            )}
          </div>
        </div>
      )}

      {/* ── Forgot Password Modal ── */}
      {showForgot && (
        <>
          <div onClick={() => setShowForgot(false)} className="fixed inset-0 bg-black/60 z-[1000]" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1001] p-8 rounded-xl w-[380px] max-w-[90vw]"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 4px 24px rgba(0,0,0,0.25)" }}>
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-15 pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(184,152,96,0.1), transparent)" }} />

            {forgotStep === 1 ? (
              <>
                <h3 className="text-lg font-bold text-text text-center mb-1.5">找回密码</h3>
                <p className="text-[11px] text-text-muted text-center mb-[18px]">输入用户名以验证身份</p>
                <div className="mb-3.5">
                  <label className={labelClass}>召唤师名称</label>
                  <input placeholder="请输入召唤师名称" value={forgotUsername} onChange={e => setForgotUsername(e.target.value)} className={inputClass} />
                </div>
                {forgotError && <p className="text-xs text-red text-center mb-3">{forgotError}</p>}
                <div className="flex gap-2.5">
                  <button onClick={() => setShowForgot(false)} className="flex-1 py-2.5 rounded-md border border-white/10 text-[13px] text-text-muted bg-transparent cursor-pointer">取消</button>
                  <button onClick={lookupQuestion} disabled={forgotLoading}
                    className="flex-1 py-2.5 rounded-md text-[13px] font-bold bg-gradient-to-b from-amber-200 via-gold to-gold-dim text-root disabled:opacity-60 cursor-pointer">下一步</button>
                </div>
              </>
            ) : forgotStep === 2 ? (
              <>
                <h3 className="text-lg font-bold text-text text-center mb-1.5">验证安全问题</h3>
                <p className="text-[11px] text-text-muted text-center mb-3.5">账号：<span className="text-gold">{forgotUsername}</span></p>
                <div className="bg-gold/5 border border-gold/15 rounded-lg p-3 mb-3.5">
                  <span className="block text-[10px] font-semibold text-gold-dim mb-1">安全问题</span>
                  <span className="text-[13px] text-text font-medium">{forgotQuestion}</span>
                </div>
                <div className="mb-3.5">
                  <label className={labelClass}>安全答案</label>
                  <input placeholder="请输入答案" value={forgotAnswer} onChange={e => setForgotAnswer(e.target.value)} className={inputClass} />
                </div>
                {forgotError && <p className="text-xs text-red text-center mb-3">{forgotError}</p>}
                <button onClick={() => { setForgotStep(3); setForgotError(""); }}
                  className={`${btnGold} text-[13px] py-2.5 mb-2.5`}>继续设置新密码</button>
                <div className="text-center">
                  <button onClick={() => setShowForgot(false)} className="bg-transparent border-none text-text-muted text-[11px] cursor-pointer">取消</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-text text-center mb-1.5">重置密码</h3>
                <p className="text-[11px] text-text-muted text-center mb-[18px]">为 <span className="text-gold">{forgotUsername}</span> 设置新密码</p>
                <div className="flex flex-col gap-3 mb-[18px]">
                  <div>
                    <label className={labelClass}>新密码</label>
                    <div className="relative">
                      <input type={showForgotPw ? "text" : "password"} placeholder="至少 11 位" value={forgotPassword}
                        onChange={e => setForgotPassword(e.target.value)} className={`${inputClass} pr-10`} />
                      <button type="button" onClick={() => setShowForgotPw(!showForgotPw)}
                        className={`absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center bg-transparent border-none cursor-pointer ${showForgotPw ? "text-gold" : "text-text-muted"}`}>
                        <EyeIcon open={showForgotPw} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>确认新密码</label>
                    <div className="relative">
                      <input type={showForgotPw ? "text" : "password"} placeholder="再次输入" value={forgotConfirm}
                        onChange={e => setForgotConfirm(e.target.value)} className={`${inputClass} pr-10`} />
                      <button type="button" onClick={() => setShowForgotPw(!showForgotPw)}
                        className={`absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center bg-transparent border-none cursor-pointer ${showForgotPw ? "text-gold" : "text-text-muted"}`}>
                        <EyeIcon open={showForgotPw} />
                      </button>
                    </div>
                  </div>
                </div>
                {forgotError && <p className="text-xs text-red text-center mb-3">{forgotError}</p>}
                <button onClick={verifyAndReset} disabled={forgotLoading}
                  className={`${btnGold} text-[13px] py-2.5`}>确认重置</button>
                <div className="text-center mt-3.5">
                  <button onClick={() => setShowForgot(false)} className="bg-transparent border-none text-text-muted text-[11px] cursor-pointer">取消</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
