import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "40px 24px",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontSize: 72,
          fontWeight: 900,
          color: "var(--gold)",
          margin: "0 0 8px",
          lineHeight: 1,
          opacity: 0.6,
        }}
      >
        404
      </h1>
      <p style={{ fontSize: 16, color: "var(--text-secondary)", margin: "0 0 32px" }}>
        页面不存在
      </p>
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 24px",
          borderRadius: 8,
          background: "linear-gradient(135deg, var(--gold-light), var(--gold-dim))",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        返回首页
      </Link>
    </div>
  );
}
