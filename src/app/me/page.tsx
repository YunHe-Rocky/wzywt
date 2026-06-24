"use client";

import { useEffect, useState } from "react";
import { RolePreferenceEditor } from "@/components/me/RolePreferenceEditor";
import { DeleteAccountModal } from "@/components/auth/DeleteAccountModal";
import { SecurityQuestionModal } from "@/components/auth/SecurityQuestionModal";

export default function MePage() {
  const [showDelete, setShowDelete] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.user?.securityQuestion) setSecurityQuestion(d.user.securityQuestion);
    });
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-8 animate-fade-in">
      <h1 className="text-2xl sm:text-[28px] font-bold text-text m-0">个人空间</h1>

      <RolePreferenceEditor />

      {/* Account section */}
      <div className="card animate-slide-up" style={{ animationDelay: "0.15s", animationFillMode: "both" }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4 pb-4 border-b border-border">
          <div>
            <div className="text-sm font-semibold text-text mb-1">账户安全</div>
            <div className="text-[11px] text-text-muted">修改登录密码</div>
          </div>
          <button onClick={() => setShowChangePassword(true)}
            className="px-5 py-2 text-[13px] font-semibold rounded-md bg-gradient-to-b from-amber-200 via-gold to-gold-dim text-root hover:brightness-110 transition-all">
            修改密码
          </button>
        </div>

        {/* Danger zone */}
        <div className="p-4 border border-red rounded-lg bg-red/5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm font-semibold text-red mb-1">危险区域</div>
              <div className="text-[11px] text-text-muted">注销后所有数据将被永久删除，无法恢复</div>
            </div>
            <button onClick={() => setShowDelete(true)}
              className="px-5 py-2 text-[13px] font-semibold text-white bg-red rounded-md hover:brightness-110 transition-all">
              注销账号
            </button>
          </div>
        </div>
      </div>

      <SecurityQuestionModal question={securityQuestion} open={showChangePassword} onClose={() => setShowChangePassword(false)} />
      <DeleteAccountModal open={showDelete} onClose={() => setShowDelete(false)} />
    </div>
  );
}
