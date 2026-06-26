// Next.js 路由级 loading — 页面切换时自动显示
// 不导出为客户端组件，让它在服务端也能渲染骨架

export default function Loading() {
  return (
    <div className="main-content" style={{ padding: "40px 24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Header skeleton */}
        <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 32 }} />
        <div className="skeleton" style={{ height: 14, width: 160, marginBottom: 20 }} />

        {/* Card skeletons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="card" style={{ padding: "20px 24px" }}>
              <div className="skeleton" style={{ height: 12, width: i === 1 ? "60%" : i === 2 ? "45%" : "55%", marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 10, width: i === 1 ? "80%" : i === 2 ? "70%" : "75%" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
