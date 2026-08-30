import { describe, expect, it } from "vitest";
import {
  ARRANGE_MIN_PX,
  DEFAULT_SPLIT_RATIO,
  MIXER_COLLAPSED_KEY,
  PREVIEW_MIN_PX,
  SPLIT_RATIO_KEY,
  applySplitPointer,
  clampSplitRatio,
  loadMixerCollapsed,
  loadSplitRatio,
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
    const available = 600;
    expect(clampSplitRatio(0, available) * available).toBeCloseTo(PREVIEW_MIN_PX, 5);
    expect((1 - clampSplitRatio(1, available)) * available).toBeCloseTo(ARRANGE_MIN_PX, 5);
    expect(clampSplitRatio(0.5, available)).toBeCloseTo(0.5, 5);
  });

  it("pointer drag maps to a clamped ratio", () => {
    const tall = applySplitPointer({ clientY: 80, stageTop: 0, stageHeight: 608 });
    expect(tall.previewPx).toBeGreaterThanOrEqual(PREVIEW_MIN_PX);
    expect(tall.arrangePx).toBeGreaterThanOrEqual(ARRANGE_MIN_PX);

    const low = applySplitPointer({ clientY: 20, stageTop: 0, stageHeight: 608 });
    expect(low.previewPx).toBe(PREVIEW_MIN_PX);

    const high = applySplitPointer({ clientY: 590, stageTop: 0, stageHeight: 608 });
    expect(high.arrangePx).toBe(ARRANGE_MIN_PX);
    expect(high.previewPx).toBe(600 - ARRANGE_MIN_PX);
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
});
