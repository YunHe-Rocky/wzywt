import type { HistoryThemeStudioState } from "./studio-data";

export const HISTORY_THEME_LEAVE_WARNING = "当前临时编辑尚未保存，刷新或关闭页面将丢失这些更改。";

interface RuntimeDraft {
  ownerId: number;
  state: HistoryThemeStudioState;
}

let runtimeDraft: RuntimeDraft | null = null;
let listenersAttached = false;

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!runtimeDraft) return;
  event.preventDefault();
  event.returnValue = HISTORY_THEME_LEAVE_WARNING;
}

function discardOnIdentityChange() {
  clearHistoryThemeRuntimeDraft();
}

function attachListeners() {
  if (typeof window === "undefined" || listenersAttached) return;
  window.addEventListener("beforeunload", warnBeforeUnload);
  window.addEventListener("wzywt:auth-identity-changed", discardOnIdentityChange);
  listenersAttached = true;
}

function detachListeners() {
  if (typeof window === "undefined" || !listenersAttached) return;
  window.removeEventListener("beforeunload", warnBeforeUnload);
  window.removeEventListener("wzywt:auth-identity-changed", discardOnIdentityChange);
  listenersAttached = false;
}

export function readHistoryThemeRuntimeDraft(ownerId: number): HistoryThemeStudioState | null {
  if (typeof window === "undefined" || !runtimeDraft) return null;
  if (runtimeDraft.ownerId !== ownerId) {
    clearHistoryThemeRuntimeDraft();
    return null;
  }
  return runtimeDraft.state;
}

export function writeHistoryThemeRuntimeDraft(ownerId: number, state: HistoryThemeStudioState) {
  if (typeof window === "undefined") return;
  runtimeDraft = { ownerId, state };
  attachListeners();
}

export function clearHistoryThemeRuntimeDraft(ownerId?: number) {
  if (ownerId !== undefined && runtimeDraft?.ownerId !== ownerId) return;
  runtimeDraft = null;
  detachListeners();
}
