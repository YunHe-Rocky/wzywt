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
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.securityQuestion) setSecurityQuestion(d.user.securityQuestion);
      });
  }, []);

  return (
    <div
      className="me-page"
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 32,
        animation: "fade-in 0.4s ease-out",
      }}
    >
      <h1
        className="me-title"
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--text)",
          margin: 0,
        }}
      >
        个人空间
      </h1>
      <RolePreferenceEditor />

      {/* Account section */}
      <div
        className="account-section"
        style={{
          animation: "slide-up 0.4s 0.15s ease-out both",
          padding: "20px",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 16,
            paddingBottom: 16,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
              账户安全
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              修改登录密码
            </div>
          </div>
          <button
            onClick={() => setShowChangePassword(true)}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              color: "#1a1408",
              background: "linear-gradient(135deg, #d4b85a, #a08030)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
          >
            修改密码
          </button>
        </div>

        {/* Danger zone */}
        <div
          className="danger-zone"
          style={{
            padding: "16px",
            border: "1px solid var(--red)",
            borderRadius: "var(--radius)",
            background: "rgba(224,80,80,0.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--red)", marginBottom: 4 }}>
                危险区域
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                注销后所有数据将被永久删除，无法恢复
              </div>
            </div>
            <button
              onClick={() => setShowDelete(true)}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                background: "var(--red)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              注销账号
            </button>
          </div>
        </div>
      </div>

      <SecurityQuestionModal
        question={securityQuestion}
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
      <DeleteAccountModal open={showDelete} onClose={() => setShowDelete(false)} />

      <style jsx>{`
        @media (max-width: 480px) {
          .me-page {
            padding: 24px 16px !important;
            gap: 20px !important;
          }
          .me-title {
            font-size: 22px !important;
          }
          .account-section {
            padding: 16px !important;
          }
          .danger-zone {
            padding: 12px !important;
          }
        }
      `}</style>
    </div>
  );
}
