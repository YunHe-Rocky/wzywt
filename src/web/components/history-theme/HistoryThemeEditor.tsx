import type { HistoryThemeCategory, ThemeTone, TriggerKind } from "@/core/history-theme/types";
import {
  HISTORY_THEME_BLOCK_LABELS,
  HISTORY_THEME_CATEGORY_LABELS,
  HISTORY_THEME_TONE_LABELS,
  safeSourceUrl,
  type HistoryThemeBlockType,
  type HistoryThemeBlockView,
  type HistoryThemeSourceView,
} from "@/features/history-theme/presentation";
import {
  buildFutureCalendarDays,
  createEmptyBlock,
  createEmptySource,
  EDITORIAL_NATURE_LABEL,
  TRIGGER_OPTIONS,
  type EditorSection,
  type HistoryThemeStudioState,
} from "./studio-data";

interface HistoryThemeEditorProps {
  section: EditorSection;
  state: HistoryThemeStudioState;
  calendarNow: number | null;
  onChange: (next: HistoryThemeStudioState) => void;
}

const categories = Object.entries(HISTORY_THEME_CATEGORY_LABELS) as Array<[HistoryThemeCategory, string]>;
const tones = Object.entries(HISTORY_THEME_TONE_LABELS) as Array<[ThemeTone, string]>;
const blockKinds = Object.entries(HISTORY_THEME_BLOCK_LABELS) as Array<[HistoryThemeBlockType, string]>;

function normalizeClaimIds(value: string): string[] {
  return value.split(/[,，]/).map(claimId => claimId.trim()).filter(Boolean);
}

export function HistoryThemeEditor({ section, state, calendarNow, onChange }: HistoryThemeEditorProps) {
  const hasEditorialNature = state.trigger.kind === "EDITORIAL_WINDOW";
  const setTheme = (patch: Partial<HistoryThemeStudioState["theme"]>) => onChange({
    ...state,
    theme: { ...state.theme, ...patch },
  });
  const setTrigger = (patch: Partial<HistoryThemeStudioState["trigger"]>) => onChange({
    ...state,
    trigger: { ...state.trigger, ...patch },
  });

  if (section === "基本信息") {
    return <section className="history-theme-editor-panel" aria-labelledby="history-basic-heading">
      <div className="history-theme-section-heading"><h2 id="history-basic-heading">基本信息</h2><p>仅在本次运行中保留；刷新或关闭页面后清除。</p></div>
      <div className="history-theme-form-grid">
        <label><span>主题分类</span><select aria-label="主题分类" value={state.theme.category} onChange={event => setTheme({ category: event.target.value as HistoryThemeCategory })}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>语调</span><select aria-label="语调" value={state.theme.tone} onChange={event => setTheme({ tone: event.target.value as ThemeTone })}>{tones.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="history-theme-field-wide"><span>主题标题</span><input aria-label="主题标题" value={state.theme.title} onChange={event => setTheme({ title: event.target.value })} /></label>
        <label className="history-theme-field-wide"><span>主题摘要</span><textarea aria-label="主题摘要" rows={3} value={state.theme.summary} onChange={event => setTheme({ summary: event.target.value })} /></label>
        <label><span>Slug</span><input value={state.theme.slug} onChange={event => setTheme({ slug: event.target.value })} /></label>
        <label><span>性质标签</span><input aria-label="性质标签" aria-describedby={hasEditorialNature ? "history-editorial-nature-note" : undefined} value={hasEditorialNature ? EDITORIAL_NATURE_LABEL : state.theme.natureLabel} disabled={hasEditorialNature} onChange={event => setTheme({ natureLabel: event.target.value })} />{hasEditorialNature && <small id="history-editorial-nature-note">演武堂历史策划触发类型固定使用此性质标签。</small>}</label>
        <label><span>日期标签</span><input value={state.theme.dateLabel} onChange={event => setTheme({ dateLabel: event.target.value })} /></label>
        <label><span>史实审核日期</span><input aria-label="史实审核日期" value="未核验" readOnly aria-describedby="history-review-date-note" /><small id="history-review-date-note">审核结果只能来自未接入的审核服务。</small></label>
        <label className="history-theme-field-wide"><span>日期说明</span><textarea rows={2} value={state.theme.dateNote} onChange={event => setTheme({ dateNote: event.target.value })} /></label>
      </div>
    </section>;
  }

  if (section === "触发规则") {
    return <section className="history-theme-editor-panel" aria-labelledby="history-trigger-heading">
      <div className="history-theme-section-heading"><h2 id="history-trigger-heading">触发规则</h2><p>此处仅编辑界面数据，未接入触发计算。</p></div>
      <div className="history-theme-form-grid">
        <label className="history-theme-field-wide"><span>触发类型</span><select aria-label="触发类型" value={state.trigger.kind} onChange={event => setTrigger({ kind: event.target.value as TriggerKind })}>{TRIGGER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {state.trigger.kind === "SOLAR_FIXED" && <>
          <label><span>公历月份</span><input type="number" min="1" max="12" value={state.trigger.solarMonth} onChange={event => setTrigger({ solarMonth: event.target.value })} /></label>
          <label><span>公历日期</span><input type="number" min="1" max="31" value={state.trigger.solarDay} onChange={event => setTrigger({ solarDay: event.target.value })} /></label>
        </>}
        {state.trigger.kind === "LUNAR_FIXED" && <>
          <label><span>农历月份</span><input type="number" min="1" max="12" value={state.trigger.lunarMonth} onChange={event => setTrigger({ lunarMonth: event.target.value })} /></label>
          <label><span>农历日期</span><input type="number" min="1" max="30" value={state.trigger.lunarDay} onChange={event => setTrigger({ lunarDay: event.target.value })} /></label>
          <label className="history-theme-field-wide"><span>闰月策略</span><select aria-label="闰月策略" value={state.trigger.leapPolicy} onChange={event => setTrigger({ leapPolicy: event.target.value as HistoryThemeStudioState["trigger"]["leapPolicy"] })}><option value="REGULAR_ONLY">仅常规月</option><option value="LEAP_ONLY">仅闰月</option><option value="BOTH">常规月与闰月</option></select></label>
        </>}
        {state.trigger.kind === "SOLAR_TERM" && <>
          <label><span>清明开始偏移（天）</span><input type="number" value={state.trigger.qingmingStartOffset} onChange={event => setTrigger({ qingmingStartOffset: event.target.value })} /></label>
          <label><span>清明结束偏移（天）</span><input type="number" value={state.trigger.qingmingEndOffset} onChange={event => setTrigger({ qingmingEndOffset: event.target.value })} /></label>
        </>}
        {state.trigger.kind === "EDITORIAL_WINDOW" && <>
          <p className="history-theme-callout history-theme-field-wide">排期类型：<strong>演武堂历史策划</strong></p>
          <label><span>策划开始日期</span><input type="date" value={state.trigger.editorialStartsOn} onChange={event => setTrigger({ editorialStartsOn: event.target.value })} /></label>
          <label><span>策划结束日期</span><input type="date" value={state.trigger.editorialEndsOn} onChange={event => setTrigger({ editorialEndsOn: event.target.value })} /></label>
        </>}
        {state.trigger.kind === "ONE_OFF" && <>
          <label><span>开始时间</span><input type="datetime-local" value={state.trigger.oneOffStartsAt} onChange={event => setTrigger({ oneOffStartsAt: event.target.value })} /></label>
          <label><span>结束时间</span><input type="datetime-local" value={state.trigger.oneOffEndsAt} onChange={event => setTrigger({ oneOffEndsAt: event.target.value })} /></label>
        </>}
      </div>
    </section>;
  }

  if (section === "内容块") {
    const updateBlock = (id: string, patch: Partial<HistoryThemeBlockView>) => setTheme({ blocks: state.theme.blocks.map(block => block.id === id ? { ...block, ...patch } : block) });
    const moveBlock = (index: number, offset: -1 | 1) => {
      const target = index + offset;
      if (target < 0 || target >= state.theme.blocks.length) return;
      const blocks = [...state.theme.blocks];
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      setTheme({ blocks });
    };
    return <section className="history-theme-editor-panel" aria-labelledby="history-blocks-heading">
      <div className="history-theme-section-heading"><h2 id="history-blocks-heading">内容块</h2><button type="button" className="history-theme-secondary-button" onClick={() => setTheme({ blocks: [...state.theme.blocks, createEmptyBlock()] })}>添加内容块</button></div>
      <div className="history-theme-stack">{state.theme.blocks.length === 0 ? <p className="history-theme-empty">暂无内容块。</p> : state.theme.blocks.map((block, index) => <article className="history-theme-editor-item" data-block-kind={block.kind} key={block.id}>
        <div className="history-theme-item-heading"><strong>内容块 {index + 1}</strong><div>
          <button type="button" aria-label={`上移内容块 ${index + 1}`} disabled={index === 0} onClick={() => moveBlock(index, -1)}>上移</button>
          <button type="button" aria-label={`下移内容块 ${index + 1}`} disabled={index === state.theme.blocks.length - 1} onClick={() => moveBlock(index, 1)}>下移</button>
          <button type="button" aria-label={`移除内容块 ${index + 1}`} onClick={() => setTheme({ blocks: state.theme.blocks.filter(item => item.id !== block.id) })}>移除</button>
        </div></div>
        <div className="history-theme-form-grid">
          <label><span>内容块类型</span><select aria-label="内容块类型" value={block.kind} onChange={event => updateBlock(block.id, { kind: event.target.value as HistoryThemeBlockType })}>{blockKinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>内容块标题</span><input value={block.title} onChange={event => updateBlock(block.id, { title: event.target.value })} /></label>
          <label className="history-theme-field-wide"><span>内容块正文</span><textarea rows={6} value={block.body} onChange={event => updateBlock(block.id, { body: event.target.value })} /></label>
        </div>
      </article>)}</div>
    </section>;
  }

  if (section === "来源与素材") {
    const updateSource = (id: string, patch: Partial<HistoryThemeSourceView>) => setTheme({ sources: state.theme.sources.map(source => source.id === id ? { ...source, ...patch } : source) });
    const addSource = () => {
      const source = createEmptySource();
      onChange({
        ...state,
        theme: { ...state.theme, sources: [...state.theme.sources, source] },
        sourceClaimIdInputs: { ...state.sourceClaimIdInputs, [source.id]: "" },
      });
    };
    const removeSource = (id: string) => {
      const sourceClaimIdInputs = { ...state.sourceClaimIdInputs };
      delete sourceClaimIdInputs[id];
      onChange({
        ...state,
        theme: { ...state.theme, sources: state.theme.sources.filter(source => source.id !== id) },
        sourceClaimIdInputs,
      });
    };
    return <section className="history-theme-editor-panel" aria-labelledby="history-sources-heading">
      <div className="history-theme-section-heading"><h2 id="history-sources-heading">来源与素材</h2><button type="button" className="history-theme-secondary-button" onClick={addSource}>添加来源</button></div>
      <div className="history-theme-stack">{state.theme.sources.length === 0 ? <p className="history-theme-empty">暂无来源。</p> : state.theme.sources.map((source, index) => {
        const unsafeUrl = Boolean(source.url.trim() && !safeSourceUrl(source.url));
        return <article className="history-theme-editor-item" key={source.id}>
          <div className="history-theme-item-heading"><strong>来源 {index + 1}</strong><button type="button" aria-label={`移除来源 ${index + 1}`} onClick={() => removeSource(source.id)}>移除来源</button></div>
          <div className="history-theme-form-grid">
            <label><span>来源标题</span><input value={source.title} onChange={event => updateSource(source.id, { title: event.target.value })} /></label>
            <label><span>来源网址</span><input type="url" aria-label="来源网址" aria-invalid={unsafeUrl || undefined} aria-describedby={unsafeUrl ? `${source.id}-url-error` : undefined} value={source.url} onChange={event => updateSource(source.id, { url: event.target.value })} />{unsafeUrl && <small className="history-theme-field-error" id={`${source.id}-url-error`} role="alert">仅支持完整的 HTTP(S) 来源网址。</small>}</label>
            <label><span>发布机构</span><input value={source.publisher} onChange={event => updateSource(source.id, { publisher: event.target.value })} /></label>
            <label><span>来源类型</span><input value={source.sourceType} onChange={event => updateSource(source.id, { sourceType: event.target.value })} /></label>
            <label><span>访问日期</span><input type="date" value={source.accessedAt} onChange={event => updateSource(source.id, { accessedAt: event.target.value })} /></label>
            <label><span>关联论断 ID</span><input aria-label="关联论断 ID" value={state.sourceClaimIdInputs[source.id] ?? source.claimIds.join(", ")} onChange={event => {
              const value = event.target.value;
              onChange({
                ...state,
                theme: { ...state.theme, sources: state.theme.sources.map(item => item.id === source.id ? { ...item, claimIds: normalizeClaimIds(value) } : item) },
                sourceClaimIdInputs: { ...state.sourceClaimIdInputs, [source.id]: value },
              });
            }} /></label>
          </div>
        </article>;
      })}</div>
      <fieldset className="history-theme-material-fields"><legend>素材授权记录（不上传文件）</legend><div className="history-theme-form-grid">
        <label><span>素材署名</span><input value={state.material.attribution} onChange={event => onChange({ ...state, material: { ...state.material, attribution: event.target.value } })} /></label>
        <label><span>授权状态</span><select aria-label="授权状态" value={state.material.licenseStatus} onChange={event => onChange({ ...state, material: { ...state.material, licenseStatus: event.target.value as HistoryThemeStudioState["material"]["licenseStatus"] } })}><option value="UNSET">未记录</option><option value="AUTHORIZED">已确认授权</option><option value="RESTRICTED">限制使用</option></select></label>
        <label className="history-theme-field-wide"><span>复原说明</span><textarea rows={3} value={state.material.reconstructionNote} onChange={event => onChange({ ...state, theme: { ...state.theme, reconstructionNote: event.target.value || null }, material: { ...state.material, reconstructionNote: event.target.value } })} /></label>
      </div></fieldset>
    </section>;
  }

  const days = calendarNow === null ? [] : buildFutureCalendarDays(calendarNow);
  return <section className="history-theme-editor-panel" aria-labelledby="history-schedule-heading">
    <div className="history-theme-section-heading"><h2 id="history-schedule-heading">排期与审核</h2><p>未接入排期服务</p></div>
    <p className="history-theme-callout" role="note">45 天日历仅展示 Asia/Shanghai 日期；所有结果均为“未计算”，不表示任何主题获得排期。</p>
    {calendarNow === null ? <p role="status">正在准备日历预览…</p> : <div className="history-theme-calendar" aria-label="未来 45 天排期预览">{days.map(day => <div key={day.key}><time dateTime={day.key}>{day.label}</time><span>未计算</span></div>)}</div>}
    <div className="history-theme-review-panel">
      <h3>审核记录</h3><p className="history-theme-empty">暂无审核记录。</p>
      <p>近现代纪念主题需至少两名审核人完成史实核对；当前 UI 未接入身份、审核或发布服务，因此下列操作均不可用。</p>
      <div className="history-theme-review-actions"><button type="button" disabled>保存草稿</button><button type="button" disabled>提交审核</button><button type="button" disabled>审核通过</button><button type="button" disabled>发布</button></div>
    </div>
  </section>;
}
