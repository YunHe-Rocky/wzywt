export function RoomSkeleton() {

  return (
    <div className="page-shell page-shell--medium">
      {/* Title skeleton */}
      <div className="skeleton" style={{ height: 40, width: 240, marginBottom: 12, borderRadius: "var(--radius-sm)" }} />
      <div className="skeleton" style={{ height: 16, width: "min(320px, 100%)", marginBottom: 36, borderRadius: "var(--radius-sm)" }} />

      {/* Card skeleton */}
      <div className="yanwu-room-block" style={{ padding: "24px", marginBottom: 20 }}>
        <div className="skeleton" style={{ height: 14, width: 80, marginBottom: 16, borderRadius: 4 }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 34, width: 110, borderRadius: "var(--radius-sm)" }} />
          ))}
        </div>
      </div>

      {/* Action skeleton */}
      <div style={{ display: "flex", gap: 12 }}>
        <div className="skeleton" style={{ height: 44, width: 140, borderRadius: "var(--radius-sm)" }} />
        <div className="skeleton" style={{ height: 44, width: 120, borderRadius: "var(--radius-sm)" }} />
      </div>
    </div>

  );
}
