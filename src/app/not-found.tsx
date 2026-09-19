import Link from "next/link";

export default function NotFound() {
  return <div className="page-shell page-shell--narrow yanwu-status-page"><span className="arena-eyebrow">演武堂 · 404</span><h1>此页未入卷</h1><p>页面不存在，回到首页再找找。</p><Link href="/" className="btn-primary">返回首页</Link></div>;
}
