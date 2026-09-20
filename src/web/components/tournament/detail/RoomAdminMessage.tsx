export function RoomAdminMessage({ adminMsg }: { adminMsg: string }) {

  return (
        <div style={{
          marginBottom: 20,
          padding: "14px 18px",
          borderRadius: "var(--radius)",
          fontSize: 13,
          fontWeight: 500,
          background: adminMsg.includes("成功") || adminMsg.includes("延长") || adminMsg.includes("恭喜")
            ? "rgba(80, 176, 80, 0.06)"
            : "rgba(224, 80, 80, 0.06)",
          border: `1px solid ${
            adminMsg.includes("成功") || adminMsg.includes("延长") || adminMsg.includes("恭喜")
              ? "rgba(80, 176, 80, 0.2)"
              : "rgba(224, 80, 80, 0.2)"
          }`,
          color: adminMsg.includes("成功") || adminMsg.includes("延长") || adminMsg.includes("恭喜")
            ? "var(--green)"
            : "var(--red)",
        }}>
          {adminMsg}
        </div>

  );
}
