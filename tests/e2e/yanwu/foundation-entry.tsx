import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/web/themes/ThemeProvider";
import { ToastProvider } from "@/web/components/ui/Toast";
import { ThemeLayout } from "@/web/components/layout/ThemeLayout";
import { replayArenaIntro } from "@/web/components/arena/ArenaIntro";

function FixtureContent() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const sync = () => rerender(value => value + 1);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const scenario = new URLSearchParams(location.search).get("scenario");
  return <>
    {scenario === "modal" ? <div role="dialog" aria-modal="true" aria-label="已打开的对话框"><button>关闭对话框</button></div> : null}
    <section className="page-shell page-shell--narrow" aria-label="基础内容">
      <p data-body-copy>演武雅集</p>
      <div className="card" data-contrast-surface>
        <h1>纸墨演武</h1>
        <p id="foundation-copy" className="text-text-muted">以武会友，以文知古。</p>
        <label htmlFor="foundation-input">房间号</label>
        <input id="foundation-input" defaultValue="260919" />
        <button type="button" className="btn-primary">进入赛事大厅</button>
      </div>
      <button type="button" onClick={replayArenaIntro}>手动重播开场</button>
    </section>
  </>;
}

function App() {
  return <ThemeProvider><ToastProvider><ThemeLayout><FixtureContent /></ThemeLayout></ToastProvider></ThemeProvider>;
}

createRoot(document.getElementById("root")!).render(<App />);
