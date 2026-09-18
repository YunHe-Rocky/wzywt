"use client";

import { useEffect, useState } from "react";
import { useAdminIdentity } from "@/web/components/admin/AdminIdentityContext";
import { HistoryThemeEditor } from "./HistoryThemeEditor";
import {
  HistoryThemePreview,
  type HistoryThemePreviewContent,
  type HistoryThemePreviewDevice,
  type HistoryThemePreviewState,
} from "./HistoryThemePreview";
import {
  createInitialStudioState,
  EDITOR_SECTIONS,
  type EditorSection,
  type HistoryThemeStudioState,
} from "./studio-data";
import {
  clearHistoryThemeRuntimeDraft,
  readHistoryThemeRuntimeDraft,
  writeHistoryThemeRuntimeDraft,
} from "./runtime-draft";

export function HistoryThemeStudio() {
  const ownerId = useAdminIdentity();
  return <HistoryThemeStudioForOwner key={ownerId ?? "missing-owner"} ownerId={ownerId} />;
}

function HistoryThemeStudioForOwner({ ownerId }: { ownerId: number | null }) {
  const [state, setState] = useState<HistoryThemeStudioState>(() => createInitialStudioState());
  const [section, setSection] = useState<EditorSection>("基本信息");
  const [previewContent, setPreviewContent] = useState<HistoryThemePreviewContent>("card");
  const [previewDevice, setPreviewDevice] = useState<HistoryThemePreviewDevice>("desktop");
  const [previewState, setPreviewState] = useState<HistoryThemePreviewState>("normal");
  const [dirty, setDirty] = useState(false);
  const [calendarNow, setCalendarNow] = useState<number | null>(null);

  useEffect(() => setCalendarNow(Date.now()), []);

  useEffect(() => {
    if (ownerId === null) return;
    const retained = readHistoryThemeRuntimeDraft(ownerId);
    setState(retained ?? createInitialStudioState());
    setDirty(retained !== null);
  }, [ownerId]);

  useEffect(() => {
    const discardLocalDraft = () => {
      setState(createInitialStudioState());
      setSection("基本信息");
      setPreviewContent("card");
      setPreviewState("normal");
      setDirty(false);
    };
    window.addEventListener("wzywt:auth-identity-changed", discardLocalDraft);
    return () => window.removeEventListener("wzywt:auth-identity-changed", discardLocalDraft);
  }, []);

  const updateState = (next: HistoryThemeStudioState) => {
    setState(next);
    setDirty(true);
    if (ownerId !== null) writeHistoryThemeRuntimeDraft(ownerId, next);
  };

  const reset = () => {
    if (!window.confirm("确定放弃所有临时修改吗？")) return;
    if (ownerId !== null) clearHistoryThemeRuntimeDraft(ownerId);
    setState(createInitialStudioState());
    setSection("基本信息");
    setPreviewContent("card");
    setPreviewState("normal");
    setDirty(false);
  };

  return <main className="history-theme-studio admin-page" data-history-theme-studio>
    <header className="history-theme-studio-heading">
      <div><p className="history-theme-eyebrow">HISTORY THEME / UI ONLY</p><h1>历史主题工作室</h1><p>编辑、版式与状态预览；客户端切换页面会临时保留，刷新或关闭会清除。</p></div>
      <div className="history-theme-studio-status"><span data-history-theme-unsaved aria-live="polite">{dirty ? "临时修改已在本次运行中保留 · 刷新或关闭会清除" : "临时编辑 · 尚未修改"}</span><button type="button" onClick={reset}>重置临时编辑</button></div>
    </header>

    <div className="history-theme-studio-layout">
      <section className="history-theme-workbench" aria-label="历史主题编辑器">
        <nav className="history-theme-editor-nav" aria-label="编辑区域">{EDITOR_SECTIONS.map(item => <button type="button" key={item} data-editor-section={item} aria-current={section === item ? "page" : undefined} onClick={() => setSection(item)}>{item}</button>)}</nav>
        <HistoryThemeEditor section={section} state={state} calendarNow={calendarNow} onChange={updateState} />
      </section>

      <aside className="history-theme-preview-column" aria-label="预览设置">
        <div className="history-theme-preview-controls">
          <fieldset><legend>预览内容</legend><label><input type="radio" name="history-preview-content" value="card" checked={previewContent === "card"} onChange={() => setPreviewContent("card")} />首页卡片</label><label><input type="radio" name="history-preview-content" value="detail" checked={previewContent === "detail"} onChange={() => setPreviewContent("detail")} />主题详情</label></fieldset>
          <fieldset><legend>预览设备</legend><label><input type="radio" name="history-preview-device" value="desktop" checked={previewDevice === "desktop"} onChange={() => setPreviewDevice("desktop")} />桌面</label><label><input type="radio" name="history-preview-device" value="mobile" checked={previewDevice === "mobile"} onChange={() => setPreviewDevice("mobile")} />手机</label></fieldset>
          <label className="history-theme-preview-state"><span>预览状态</span><select aria-label="预览状态" value={previewState} onChange={event => setPreviewState(event.target.value as HistoryThemePreviewState)}><option value="normal">正常</option><option value="loading">加载中</option><option value="empty">空状态</option><option value="error">错误</option></select></label>
        </div>
        <HistoryThemePreview state={state} content={previewContent} device={previewDevice} previewState={previewState} onContentChange={setPreviewContent} />
      </aside>
    </div>
  </main>;
}
