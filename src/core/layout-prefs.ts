/** Session chrome (mixer fold + preview/arrange split). localStorage is enough. */

export const MIXER_COLLAPSED_KEY = "resonance-studio-v5-mixer-collapsed";
export const SPLIT_RATIO_KEY = "resonance-studio-v5-preview-split";

export const PREVIEW_MIN_PX = 120;
export const ARRANGE_MIN_PX = 160;
export const SPLITTER_PX = 10;
export const DEFAULT_SPLIT_RATIO = 0.52;
export const MIXER_EXPANDED_PX = 228;
export const MIXER_COLLAPSED_PX = 56;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function clampSplitRatio(ratio: number, availablePx: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO;
  if (!Number.isFinite(availablePx) || availablePx <= 0) {
    return Math.min(0.85, Math.max(0.15, ratio));
  }
  const minR = PREVIEW_MIN_PX / availablePx;
  const maxR = 1 - ARRANGE_MIN_PX / availablePx;
  if (minR >= maxR) {
    return PREVIEW_MIN_PX / (PREVIEW_MIN_PX + ARRANGE_MIN_PX);
  }
  return Math.min(maxR, Math.max(minR, ratio));
}

export function applySplitPointer(opts: {
  clientY: number;
  stageTop: number;
  stageHeight: number;
  splitterPx?: number;
}): { ratio: number; previewPx: number; arrangePx: number } {
  const splitter = opts.splitterPx ?? SPLITTER_PX;
  const available = Math.max(1, opts.stageHeight - splitter);
  const ratio = clampSplitRatio((opts.clientY - opts.stageTop) / available, available);
  const previewPx = Math.round(ratio * available);
  return { ratio, previewPx, arrangePx: available - previewPx };
}

export function loadMixerCollapsed(storage?: StorageLike | null): boolean {
  try {
    return storage?.getItem(MIXER_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMixerCollapsed(storage: StorageLike | null | undefined, collapsed: boolean): void {
  try {
    storage?.setItem(MIXER_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* quota / private mode */
  }
}

export function loadSplitRatio(storage?: StorageLike | null): number {
  try {
    const raw = storage?.getItem(SPLIT_RATIO_KEY);
    if (raw == null) return DEFAULT_SPLIT_RATIO;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_SPLIT_RATIO;
    return clampSplitRatio(n, PREVIEW_MIN_PX + ARRANGE_MIN_PX + 400);
  } catch {
    return DEFAULT_SPLIT_RATIO;
  }
}

export function saveSplitRatio(storage: StorageLike | null | undefined, ratio: number): void {
  try {
    if (!Number.isFinite(ratio)) return;
    storage?.setItem(SPLIT_RATIO_KEY, String(ratio));
  } catch {
    /* quota / private mode */
  }
}

export function browserLayoutStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}
