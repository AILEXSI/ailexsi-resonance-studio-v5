import { describe, expect, it } from "vitest";
import { sourceTimeAt } from "../../src/core/models";
import { advancePlayhead, nextShuttleRate, playbackBounds } from "../../src/core/playback";
import { clip, projectWith } from "../helpers";

describe("preview / playback", () => {
  it("maps timeline time to source time", () => {
    const c = clip({
      id: "c",
      assetId: "a",
      trackId: "V1",
      startMs: 1000,
      durationMs: 500,
      sourceInMs: 200,
      sourceOutMs: 700,
    });
    expect(sourceTimeAt(c, 1000)).toBe(200);
    expect(sourceTimeAt(c, 1250)).toBe(450);
    const fast = { ...c, rate: 2, durationMs: 250 };
    expect(sourceTimeAt(fast, 1250)).toBe(700);
  });

  it("loops inside IN/OUT and stops without loop", () => {
    const p = projectWith([
      clip({ id: "c", assetId: "a", trackId: "V1", startMs: 0, durationMs: 5000 }),
    ]);
    p.inPointMs = 1000;
    p.outPointMs = 2000;
    p.playheadMs = 1900;
    p.loop = true;
    expect(advancePlayhead(p, 200).playheadMs).toBe(1000);
    p.loop = false;
    const stopped = advancePlayhead(p, 200);
    expect(stopped.stopped).toBe(true);
    expect(stopped.playheadMs).toBe(2000);
  });

  it("reverse shuttle stops at IN without loop and wraps with loop", () => {
    const p = projectWith([
      clip({ id: "c", assetId: "a", trackId: "V1", startMs: 0, durationMs: 5000 }),
    ]);
    p.inPointMs = 1000;
    p.outPointMs = 2000;
    p.playheadMs = 1100;
    p.loop = false;
    const stopped = advancePlayhead(p, -200);
    expect(stopped.stopped).toBe(true);
    expect(stopped.playheadMs).toBe(1000);
    p.loop = true;
    const wrapped = advancePlayhead(p, -200);
    expect(wrapped.stopped).toBe(false);
    expect(wrapped.playheadMs).toBe(2000);
  });

  it("shuttle rate table is 1 → 2 → 4", () => {
    expect([0, 1, 2, 4].map((r) => nextShuttleRate(r, 1))).toEqual([1, 2, 4, 4]);
    expect([0, -1, -2, -4].map((r) => nextShuttleRate(r, -1))).toEqual([-1, -2, -4, -4]);
  });

  it("uses clip extent when IN/OUT unset", () => {
    const p = projectWith([
      clip({ id: "c", assetId: "a", trackId: "A1", startMs: 0, durationMs: 800 }),
    ]);
    expect(playbackBounds(p).endMs).toBe(800);
  });

  it("Play/loop matches export range: skip disabled tail, keep VIS events (P103)", () => {
    const p = projectWith([
      clip({ id: "on", assetId: "a", trackId: "V1", startMs: 0, durationMs: 800 }),
      clip({ id: "off", assetId: "a", trackId: "V1", startMs: 800, durationMs: 4000, enabled: false }),
    ]);
    p.markers = [{ id: "m", timeMs: 9000, label: "M" }];
    expect(playbackBounds(p).endMs).toBe(800);
    p.playheadMs = 750;
    const stopped = advancePlayhead(p, 200);
    expect(stopped.stopped).toBe(true);
    expect(stopped.playheadMs).toBe(800);

    p.visualizer = {
      ...p.visualizer,
      enabled: true,
      muted: false,
      events: [{ id: "e1", sceneId: "pulse-orb", startMs: 500, durationMs: 1500 }],
    };
    expect(playbackBounds(p).endMs).toBe(2000);
  });
});
