import { ActiveThemeCard } from "./ActiveThemeCard";
import { HistoryThemeDetail } from "./HistoryThemeDetail";
import type { HistoryThemeStudioState } from "./studio-data";

export type HistoryThemePreviewContent = "card" | "detail";
export type HistoryThemePreviewDevice = "desktop" | "mobile";
export type HistoryThemePreviewState = "normal" | "loading" | "empty" | "error";

interface HistoryThemePreviewProps {
  state: HistoryThemeStudioState;
  content: HistoryThemePreviewContent;
  device: HistoryThemePreviewDevice;
  previewState: HistoryThemePreviewState;
  onContentChange: (content: HistoryThemePreviewContent) => void;
}

export function HistoryThemePreview({ state, content, device, previewState, onContentChange }: HistoryThemePreviewProps) {
  const previewTheme = {
    ...state.theme,
    sources: state.theme.sources.filter(source => Boolean(
      source.title.trim()
      || source.url.trim()
      || source.publisher.trim()
      || source.sourceType.trim()
      || source.accessedAt
      || source.claimIds.length,
    )),
  };
  const previewCardTheme = {
    ...previewTheme,
    startsAt: "2026-09-19T00:00:00+08:00",
    endsAt: "2026-09-26T00:00:00+08:00",
  };
  const previewNow = Date.parse("2026-09-20T12:00:00+08:00");
  return <section className="history-theme-preview" data-history-theme-preview data-preview-device={device} aria-label="主题预览">
    <div className="history-theme-preview-viewport">
      {content === "detail"
        ? <HistoryThemeDetail theme={previewTheme} onBack={() => onContentChange("card")} onOther={() => onContentChange("card")} />
        : <>
          <ActiveThemeCard
            theme={previewState === "empty" ? null : previewCardTheme}
            loading={previewState === "loading"}
            error={previewState === "error"}
            onOpen={() => onContentChange("detail")}
            now={previewNow}
          />
          {previewState === "normal" && <p className="history-theme-preview-boundary">示例时间窗，仅用于版式预览，不代表实际排期</p>}
          {previewState === "empty" && <p className="history-theme-preview-message" data-preview-empty>无有效主题时，首页不留占位。</p>}
          {previewState === "error" && <p className="history-theme-preview-message" data-preview-error>主题加载错误不阻断首页其他内容。</p>}
        </>}
    </div>
  </section>;
}
