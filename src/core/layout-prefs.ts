/** Session chrome (mixer fold + preview/arrange split). localStorage is enough. */

export const MIXER_COLLAPSED_KEY = "resonance-studio-v5-mixer-collapsed";
export const SPLIT_RATIO_KEY = "resonance-studio-v5-preview-split";
export const H_SPLIT_RATIO_KEY = "resonance-studio-v5-preview-h-split";
export const LANE_LABEL_PX_KEY = "resonance-studio-v5-lane-label-px";
export const LANE_HEIGHTS_KEY = "resonance-studio-v5-lane-heights";

export const DEFAULT_LANE_LABEL_PX = 96;
export const LANE_LABEL_MIN_PX = 72;
export const LANE_LABEL_MAX_PX = 160;
export const DEFAULT_LANE_HEIGHT_PX = 52;
export const LANE_HEIGHT_MIN_PX = 36;
export const LANE_HEIGHT_MAX_PX = 120;

export type LaneHeightGroup = "vis" | "video" | "audio";
export interface LaneHeights {
  vis: number;
  video: number;
  audio: number;
}

export const PREVIEW_MIN_PX = 120;
export const ARRANGE_MIN_PX = 200;
export const SPLITTER_PX = 18;
export const DEFAULT_SPLIT_RATIO = 0.52;
export const PREVIEW_H_MIN_PX = 200;
export const INSPECTOR_MIN_PX = 180;
export const H_SPLITTER_PX = 14;
export const DEFAULT_H_SPLIT_RATIO = 0.74;
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

export function clampHSplitRatio(ratio: number, availablePx: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_H_SPLIT_RATIO;
  if (!Number.isFinite(availablePx) || availablePx <= 0) {
    return Math.min(0.9, Math.max(0.35, ratio));
  }
  const minR = PREVIEW_H_MIN_PX / availablePx;
  const maxR = 1 - INSPECTOR_MIN_PX / availablePx;
  if (minR >= maxR) {
    return PREVIEW_H_MIN_PX / (PREVIEW_H_MIN_PX + INSPECTOR_MIN_PX);
  }
  return Math.min(maxR, Math.max(minR, ratio));
}

export function applyHSplitPointer(opts: {
  clientX: number;
  workspaceLeft: number;
  workspaceWidth: number;
  splitterPx?: number;
}): { ratio: number; previewPx: number; inspectorPx: number } {
  const splitter = opts.splitterPx ?? H_SPLITTER_PX;
  const available = Math.max(1, opts.workspaceWidth - splitter);
  const ratio = clampHSplitRatio((opts.clientX - opts.workspaceLeft) / available, available);
  const previewPx = Math.round(ratio * available);
  return { ratio, previewPx, inspectorPx: available - previewPx };
}

export function loadHSplitRatio(storage?: StorageLike | null): number {
  try {
    const raw = storage?.getItem(H_SPLIT_RATIO_KEY);
    if (raw == null) return DEFAULT_H_SPLIT_RATIO;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_H_SPLIT_RATIO;
    return clampHSplitRatio(n, PREVIEW_H_MIN_PX + INSPECTOR_MIN_PX + 600);
  } catch {
    return DEFAULT_H_SPLIT_RATIO;
  }
}

export function saveHSplitRatio(storage: StorageLike | null | undefined, ratio: number): void {
  try {
    if (!Number.isFinite(ratio)) return;
    storage?.setItem(H_SPLIT_RATIO_KEY, String(ratio));
  } catch {
    /* quota / private mode */
  }
}

export function clampLaneLabelPx(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_LANE_LABEL_PX;
  return Math.round(Math.min(LANE_LABEL_MAX_PX, Math.max(LANE_LABEL_MIN_PX, px)));
}

export function loadLaneLabelPx(storage?: StorageLike | null): number {
  try {
    const raw = storage?.getItem(LANE_LABEL_PX_KEY);
    if (raw == null) return DEFAULT_LANE_LABEL_PX;
    return clampLaneLabelPx(Number(raw));
  } catch {
    return DEFAULT_LANE_LABEL_PX;
  }
}

export function saveLaneLabelPx(storage: StorageLike | null | undefined, px: number): void {
  try {
    storage?.setItem(LANE_LABEL_PX_KEY, String(clampLaneLabelPx(px)));
  } catch {
    /* quota / private mode */
  }
}

export function clampLaneHeightPx(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_LANE_HEIGHT_PX;
  return Math.round(Math.min(LANE_HEIGHT_MAX_PX, Math.max(LANE_HEIGHT_MIN_PX, px)));
}

export function defaultLaneHeights(): LaneHeights {
  return {
    vis: DEFAULT_LANE_HEIGHT_PX,
    video: DEFAULT_LANE_HEIGHT_PX,
    audio: DEFAULT_LANE_HEIGHT_PX,
  };
}

export function clampLaneHeights(raw: Partial<LaneHeights> | null | undefined): LaneHeights {
  const base = defaultLaneHeights();
  return {
    vis: clampLaneHeightPx(raw?.vis ?? base.vis),
    video: clampLaneHeightPx(raw?.video ?? base.video),
    audio: clampLaneHeightPx(raw?.audio ?? base.audio),
  };
}

export function loadLaneHeights(storage?: StorageLike | null): LaneHeights {
  try {
    const raw = storage?.getItem(LANE_HEIGHTS_KEY);
    if (raw == null) return defaultLaneHeights();
    const parsed = JSON.parse(raw) as Partial<LaneHeights>;
    return clampLaneHeights(parsed);
  } catch {
    return defaultLaneHeights();
  }
}

export function saveLaneHeights(storage: StorageLike | null | undefined, heights: LaneHeights): void {
  try {
    storage?.setItem(LANE_HEIGHTS_KEY, JSON.stringify(clampLaneHeights(heights)));
  } catch {
    /* quota / private mode */
  }
}

export function heightGroupOfLane(id: "VIS" | "V1" | "V2" | "A1" | "A2"): LaneHeightGroup {
  if (id === "VIS") return "vis";
  if (id === "V1" || id === "V2") return "video";
  return "audio";
}

export function browserLayoutStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}
