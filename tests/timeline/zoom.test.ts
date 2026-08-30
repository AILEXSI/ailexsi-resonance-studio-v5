import { describe, expect, it } from "vitest";
import { applyFit, applyZoom, createSession, type Session } from "../../src/app/session";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { playheadInView, usableLanePx } from "../../src/core/zoom";
import { asset, clip, projectWith } from "../helpers";

function longWavSession(zoomPxPerSec = 10, playheadMs = 0): Session {
  const a = asset({ id: "wav", kind: "audio", durationMs: 300_000, name: "long.wav" });
  const c = clip({ id: "c1", assetId: "wav", trackId: "A1", startMs: 0, durationMs: 300_000 });
  return {
    ...createSession(createMemoryBlobStore()),
    project: { ...projectWith([c], [a]), zoomPxPerSec, scrollMs: 4000, playheadMs },
  };
}

const LANE = 1000;
const HEAD = 27_000;

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

  it("zoom-in from a fitted view keeps a ~27s playhead on a ~300s clip", () => {
    let s = applyFit(longWavSession(80, HEAD), LANE);
    expect(s.project.scrollMs).toBe(0);
    expect(playheadInView(HEAD, s.project.scrollMs, s.project.zoomPxPerSec, LANE)).toBe(true);

    s = applyZoom(s, s.project.zoomPxPerSec * 1.2, LANE);
    expect(playheadInView(HEAD, s.project.scrollMs, s.project.zoomPxPerSec, LANE)).toBe(true);

    s = applyZoom(s, 80, LANE);
    expect(s.project.zoomPxPerSec).toBe(80);
    expect(playheadInView(HEAD, s.project.scrollMs, s.project.zoomPxPerSec, LANE)).toBe(true);
    expect(s.project.scrollMs).toBeGreaterThan(0);
    expect(s.project.scrollMs).toBeLessThan(HEAD);
  });

  it("further zoom-in still keeps the playhead in view", () => {
    let s = applyFit(longWavSession(80, HEAD), LANE);
    s = applyZoom(s, 80, LANE);
    const afterFirst = s.project.scrollMs;
    s = applyZoom(s, 160, LANE);
    expect(s.project.zoomPxPerSec).toBe(160);
    expect(playheadInView(HEAD, s.project.scrollMs, s.project.zoomPxPerSec, LANE)).toBe(true);
    expect(s.project.scrollMs).toBeGreaterThan(afterFirst);
  });

  it("Fit after playhead-zoom still shows the full duration at scroll 0", () => {
    let s = applyFit(longWavSession(80, HEAD), LANE);
    s = applyZoom(s, 80, LANE);
    const fitted = applyFit(s, LANE);
    expect(fitted.project.scrollMs).toBe(0);
    const usable = usableLanePx(LANE);
    expect(300 * fitted.project.zoomPxPerSec).toBeLessThanOrEqual(usable + 0.001);
    expect(playheadInView(HEAD, 0, fitted.project.zoomPxPerSec, LANE)).toBe(true);
  });

  it("zoom-in with playhead off-screen first brings it into view", () => {
    let s = longWavSession(80, HEAD);
    s.project = { ...s.project, scrollMs: 0 };
    expect(playheadInView(HEAD, 0, 80, LANE)).toBe(false);
    s = applyZoom(s, 96, LANE);
    expect(playheadInView(HEAD, s.project.scrollMs, s.project.zoomPxPerSec, LANE)).toBe(true);
  });

  it("zoom-out that is not Fit keeps the playhead on screen", () => {
    let s = applyFit(longWavSession(80, HEAD), LANE);
    s = applyZoom(s, 80, LANE);
    s = applyZoom(s, s.project.zoomPxPerSec / 1.2, LANE);
    expect(playheadInView(HEAD, s.project.scrollMs, s.project.zoomPxPerSec, LANE)).toBe(true);
    expect(s.project.scrollMs).not.toBe(0);
  });
});
