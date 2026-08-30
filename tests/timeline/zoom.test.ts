import { describe, expect, it } from "vitest";
import { applyFit, applyZoom, createSession, type Session } from "../../src/app/session";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { usableLanePx } from "../../src/core/zoom";
import { asset, clip, projectWith } from "../helpers";

function longWavSession(zoomPxPerSec = 10): Session {
  const a = asset({ id: "wav", kind: "audio", durationMs: 300_000, name: "long.wav" });
  const c = clip({ id: "c1", assetId: "wav", trackId: "A1", startMs: 0, durationMs: 300_000 });
  return {
    ...createSession(createMemoryBlobStore()),
    project: { ...projectWith([c], [a]), zoomPxPerSec, scrollMs: 4000 },
  };
}

describe("timeline zoom fit", () => {
  it("fits a ~300s clip into a ~1000px lane below 10 px/s", () => {
    const fitted = applyFit(longWavSession(80), 1000);
    const usable = usableLanePx(1000);
    expect(fitted.project.zoomPxPerSec).toBeLessThan(10);
    expect(fitted.project.zoomPxPerSec).toBeGreaterThan(1);
    expect(300 * fitted.project.zoomPxPerSec).toBeLessThanOrEqual(usable + 0.001);
    expect(fitted.project.scrollMs).toBe(0);
  });

  it("zoom-out from 10 still decreases", () => {
    const next = applyZoom(longWavSession(10), 10 / 1.2, 1000);
    expect(next.project.zoomPxPerSec).toBeLessThan(10);
  });

  it("fit does not clamp at 10", () => {
    const fitted = applyFit(longWavSession(10), 1000);
    expect(fitted.project.zoomPxPerSec).not.toBe(10);
    expect(fitted.project.zoomPxPerSec).toBeLessThan(10);
  });
});
