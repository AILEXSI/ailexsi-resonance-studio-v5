import { describe, expect, it } from "vitest";
import { sourceTimeAt } from "../../src/core/models";
import { advancePlayhead, playbackBounds } from "../../src/core/playback";
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

  it("uses clip extent when IN/OUT unset", () => {
    const p = projectWith([
      clip({ id: "c", assetId: "a", trackId: "A1", startMs: 0, durationMs: 800 }),
    ]);
    expect(playbackBounds(p).endMs).toBe(800);
  });
});
