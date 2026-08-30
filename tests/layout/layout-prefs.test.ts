import { describe, expect, it } from "vitest";
import {
  ARRANGE_MIN_PX,
  DEFAULT_H_SPLIT_RATIO,
  DEFAULT_SPLIT_RATIO,
  H_SPLIT_RATIO_KEY,
  INSPECTOR_MIN_PX,
  MIXER_COLLAPSED_KEY,
  PREVIEW_H_MIN_PX,
  PREVIEW_MIN_PX,
  SPLITTER_PX,
  SPLIT_RATIO_KEY,
  applyHSplitPointer,
  applySplitPointer,
  clampHSplitRatio,
  clampSplitRatio,
  loadHSplitRatio,
  loadMixerCollapsed,
  loadSplitRatio,
  saveHSplitRatio,
  saveMixerCollapsed,
  saveSplitRatio,
} from "../../src/core/layout-prefs";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    map,
  };
}

describe("layout prefs", () => {
  it("clamps the preview/arrange split to the min heights", () => {
    expect(PREVIEW_MIN_PX).toBe(120);
    expect(ARRANGE_MIN_PX).toBe(200);
    const available = 600;
    expect(clampSplitRatio(0, available) * available).toBeCloseTo(PREVIEW_MIN_PX, 5);
    expect((1 - clampSplitRatio(1, available)) * available).toBeCloseTo(ARRANGE_MIN_PX, 5);
    expect(clampSplitRatio(0.5, available)).toBeCloseTo(0.5, 5);
  });

  it("pointer drag maps to a clamped ratio", () => {
    const stage = PREVIEW_MIN_PX + ARRANGE_MIN_PX + 400 + SPLITTER_PX;
    const available = stage - SPLITTER_PX;
    const tall = applySplitPointer({ clientY: 80, stageTop: 0, stageHeight: stage });
    expect(tall.previewPx).toBeGreaterThanOrEqual(PREVIEW_MIN_PX);
    expect(tall.arrangePx).toBeGreaterThanOrEqual(ARRANGE_MIN_PX);

    const low = applySplitPointer({ clientY: 20, stageTop: 0, stageHeight: stage });
    expect(low.previewPx).toBe(PREVIEW_MIN_PX);

    const high = applySplitPointer({ clientY: stage - 10, stageTop: 0, stageHeight: stage });
    expect(high.arrangePx).toBe(ARRANGE_MIN_PX);
    expect(high.previewPx).toBe(available - ARRANGE_MIN_PX);
  });

  it("round-trips mixer collapsed and split ratio", () => {
    const store = memoryStorage();
    expect(loadMixerCollapsed(store)).toBe(false);
    saveMixerCollapsed(store, true);
    expect(store.map.get(MIXER_COLLAPSED_KEY)).toBe("1");
    expect(loadMixerCollapsed(store)).toBe(true);
    saveMixerCollapsed(store, false);
    expect(loadMixerCollapsed(store)).toBe(false);

    saveSplitRatio(store, 0.7);
    expect(store.map.get(SPLIT_RATIO_KEY)).toBe("0.7");
    expect(loadSplitRatio(store)).toBeCloseTo(0.7, 5);
    expect(loadSplitRatio(memoryStorage())).toBe(DEFAULT_SPLIT_RATIO);
    expect(loadSplitRatio(memoryStorage({ [SPLIT_RATIO_KEY]: "nope" }))).toBe(DEFAULT_SPLIT_RATIO);
  });

  it("horizontal preview/inspector split persists and clamps", () => {
    const available = 800;
    expect(clampHSplitRatio(0, available) * available).toBeCloseTo(PREVIEW_H_MIN_PX, 5);
    expect((1 - clampHSplitRatio(1, available)) * available).toBeCloseTo(INSPECTOR_MIN_PX, 5);

    const wide = applyHSplitPointer({ clientX: 20, workspaceLeft: 0, workspaceWidth: 808 });
    expect(wide.previewPx).toBe(PREVIEW_H_MIN_PX);
    const right = applyHSplitPointer({ clientX: 800, workspaceLeft: 0, workspaceWidth: 808 });
    expect(right.inspectorPx).toBe(INSPECTOR_MIN_PX);

    const store = memoryStorage();
    saveHSplitRatio(store, 0.62);
    expect(store.map.get(H_SPLIT_RATIO_KEY)).toBe("0.62");
    expect(loadHSplitRatio(store)).toBeCloseTo(0.62, 5);
    expect(loadHSplitRatio(memoryStorage())).toBe(DEFAULT_H_SPLIT_RATIO);
  });
});
