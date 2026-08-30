import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import { applyCopy, createSession, type Session } from "../../src/app/session";
import { clipEndMs } from "../../src/core/models";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { asset, clip, projectWith } from "../helpers";

function sessionOf(
  clips: Parameters<typeof projectWith>[0],
  assets: Parameters<typeof projectWith>[1] = [asset({ id: "va", kind: "video", durationMs: 8000 })],
  extra: Partial<Session["project"]> = {},
): Session {
  return {
    ...createSession(createMemoryBlobStore()),
    project: { ...projectWith(clips, assets), ...extra },
    selectedClipId: clips[0]!.id,
    selectedClipIds: [clips[0]!.id],
  };
}

describe("overwrite3Point", () => {
  it("IN/OUT dest punches that range on the source track and leaves later clips", () => {
    const start = sessionOf(
      [
        clip({
          id: "src",
          assetId: "va",
          trackId: "V1",
          startMs: 0,
          durationMs: 2000,
          fadeInMs: 80,
          gain: 0.8,
        }),
        clip({ id: "later", assetId: "va", trackId: "V1", startMs: 4000, durationMs: 500 }),
        clip({ id: "a1", assetId: "aa", trackId: "A1", startMs: 0, durationMs: 2000 }),
      ],
      [
        asset({ id: "va", kind: "video", durationMs: 8000 }),
        asset({ id: "aa", kind: "audio", durationMs: 8000 }),
      ],
      { inPointMs: 1000, outPointMs: 1500, playheadMs: 0 },
    );
    const copied = applyCopy(start);
    const next = applyCommand(copied, { type: "overwrite3Point" });
    expect(next.clipboard).toEqual(copied.clipboard);
    expect(next.status).toBe("Overwrite IN/OUT");
    expect(next.history.past.length).toBe(copied.history.past.length + 1);
    const onV1 = next.project.clips.filter((c) => c.trackId === "V1").sort((a, b) => a.startMs - b.startMs);
    expect(onV1).toHaveLength(4);
    expect(onV1[0]!.id).toBe("src");
    expect(onV1[0]!.startMs).toBe(0);
    expect(onV1[0]!.durationMs).toBe(1000);
    const punched = onV1[1]!;
    expect(punched.id).not.toBe("src");
    expect(punched.startMs).toBe(1000);
    expect(punched.durationMs).toBe(500);
    expect(punched.assetId).toBe("va");
    expect(punched.sourceInMs).toBe(0);
    expect(punched.sourceOutMs).toBe(500);
    expect(punched.gain).toBe(0.8);
    expect(punched.rate).toBe(1);
    expect(onV1[2]!.startMs).toBe(1500);
    expect(onV1[2]!.durationMs).toBe(500);
    expect(onV1[3]!.id).toBe("later");
    expect(onV1[3]!.startMs).toBe(4000);
    expect(next.project.clips.find((c) => c.id === "a1")!.startMs).toBe(0);
    expect(next.selectedClipId).toBe(punched.id);
    expect(next.selectedClipIds).toEqual([punched.id]);
  });

  it("playhead dest covers [playhead, playhead + source.durationMs]", () => {
    const start = sessionOf(
      [clip({ id: "src", assetId: "va", trackId: "V1", startMs: 0, durationMs: 1000 })],
      [asset({ id: "va", kind: "video", durationMs: 8000 })],
      { playheadMs: 2500, inPointMs: null, outPointMs: null },
    );
    const next = applyCommand(start, { type: "overwrite3Point" });
    expect(next.status).toBe("Overwrite at playhead");
    const src = next.project.clips.find((c) => c.id === "src")!;
    expect(src.startMs).toBe(0);
    expect(src.durationMs).toBe(1000);
    const punched = next.project.clips.find((c) => c.id !== "src")!;
    expect(punched.startMs).toBe(2500);
    expect(punched.durationMs).toBe(1000);
    expect(punched.sourceInMs).toBe(0);
    expect(punched.sourceOutMs).toBe(1000);
    expect(punched.trackId).toBe("V1");
    expect(next.project.clips).toHaveLength(2);
  });

  it("overlap with the source clip leaves one covering clip in dest and a left remnant", () => {
    const start = sessionOf(
      [clip({ id: "src", assetId: "va", trackId: "V1", startMs: 0, durationMs: 2000 })],
      [asset({ id: "va", kind: "video", durationMs: 8000 })],
      { playheadMs: 500, inPointMs: null, outPointMs: null },
    );
    const next = applyCommand(start, { type: "overwrite3Point" });
    const clips = [...next.project.clips].sort((a, b) => a.startMs - b.startMs);
    expect(clips).toHaveLength(2);
    expect(clips[0]!.id).toBe("src");
    expect(clips[0]!.startMs).toBe(0);
    expect(clips[0]!.durationMs).toBe(500);
    expect(clips[1]!.startMs).toBe(500);
    expect(clips[1]!.durationMs).toBe(2000);
    expect(clipEndMs(clips[1]!)).toBe(2500);
    const covering = clips.filter((c) => c.startMs < 1500 && clipEndMs(c) > 1500);
    expect(covering).toHaveLength(1);
    expect(covering[0]!.id).toBe(clips[1]!.id);
  });

  it("overlap with a neighbor trims the neighbor; later clips do not ripple", () => {
    const start = sessionOf(
      [
        clip({ id: "src", assetId: "va", trackId: "V1", startMs: 0, durationMs: 1000 }),
        clip({ id: "nbr", assetId: "va", trackId: "V1", startMs: 1500, durationMs: 1000 }),
        clip({ id: "tail", assetId: "va", trackId: "V1", startMs: 4000, durationMs: 400 }),
      ],
      [asset({ id: "va", kind: "video", durationMs: 8000 })],
      { inPointMs: 800, outPointMs: 1800 },
    );
    const next = applyCommand(start, { type: "overwrite3Point" });
    const onV1 = next.project.clips.filter((c) => c.trackId === "V1").sort((a, b) => a.startMs - b.startMs);
    expect(onV1.map((c) => [c.startMs, c.durationMs])).toEqual([
      [0, 800],
      [800, 1000],
      [1800, 700],
      [4000, 400],
    ]);
    expect(onV1[0]!.id).toBe("src");
    expect(onV1.find((c) => c.id === "nbr")).toBeUndefined();
    expect(onV1.find((c) => c.id === "tail")!.startMs).toBe(4000);
    const destHits = onV1.filter((c) => c.startMs < 1800 && clipEndMs(c) > 800);
    expect(destHits).toHaveLength(1);
    expect(destHits[0]!.startMs).toBe(800);
    expect(destHits[0]!.durationMs).toBe(1000);
  });

  it("writes on a muted dest track and no-ops without a selection", () => {
    const start = sessionOf(
      [clip({ id: "src", assetId: "va", trackId: "V1", startMs: 0, durationMs: 800 })],
      [asset({ id: "va", kind: "video", durationMs: 8000 })],
      { playheadMs: 2000 },
    );
    start.project.tracks = start.project.tracks.map((t) =>
      t.id === "V1" ? { ...t, muted: true } : t,
    );
    const muted = applyCommand(start, { type: "overwrite3Point" });
    expect(muted.project.clips).toHaveLength(2);
    expect(muted.project.clips.some((c) => c.startMs === 2000 && c.durationMs === 800)).toBe(true);
    const empty = createSession(createMemoryBlobStore());
    expect(applyCommand(empty, { type: "overwrite3Point" })).toBe(empty);
  });
});
