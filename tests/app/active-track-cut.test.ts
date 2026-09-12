import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import { createSession, type Session } from "../../src/app/session";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { asset, clip, projectWith } from "../helpers";

function linkedAv(active: "V1" | "A1" | "vis"): Session {
  const va = asset({
    id: "va",
    kind: "video",
    durationMs: 2000,
    objectUrl: "blob:v",
    hasAudio: true,
  });
  const base = createSession(createMemoryBlobStore());
  const project = {
    ...projectWith(
      [
        clip({
          id: "v1",
          assetId: "va",
          trackId: "V1",
          startMs: 0,
          durationMs: 2000,
          sourceInMs: 0,
          sourceOutMs: 2000,
          linkId: "lnk1",
        }),
        clip({
          id: "a1",
          assetId: "va",
          trackId: "A1",
          startMs: 0,
          durationMs: 2000,
          sourceInMs: 0,
          sourceOutMs: 2000,
          linkId: "lnk1",
        }),
      ],
      [va],
    ),
    snap: false,
    playheadMs: 1000,
  };
  if (active === "vis") {
    return {
      ...base,
      project,
      selectedClipId: null,
      selectedClipIds: [],
      selectedVis: true,
      selectedVisEventId: "ve1",
      targetTrackId: "V1",
    };
  }
  const clipId = active === "V1" ? "v1" : "a1";
  return {
    ...base,
    project,
    selectedClipId: clipId,
    selectedClipIds: [clipId],
    targetTrackId: active,
  };
}

describe("active-track cut / split", () => {
  it("S on V1 splits video only and leaves A1 whole", () => {
    const next = applyCommand(linkedAv("V1"), { type: "split" });
    expect(next.error).toBeNull();
    expect(next.project.clips.filter((c) => c.trackId === "V1")).toHaveLength(2);
    expect(next.project.clips.filter((c) => c.trackId === "A1")).toHaveLength(1);
    expect(next.project.clips.find((c) => c.id === "a1")!.durationMs).toBe(2000);
  });

  it("S on A1 splits audio only and leaves V1 whole", () => {
    const next = applyCommand(linkedAv("A1"), { type: "split" });
    expect(next.error).toBeNull();
    expect(next.project.clips.filter((c) => c.trackId === "A1")).toHaveLength(2);
    expect(next.project.clips.filter((c) => c.trackId === "V1")).toHaveLength(1);
    expect(next.project.clips.find((c) => c.id === "v1")!.durationMs).toBe(2000);
  });

  it("X on V1 cuts video only and does not lift the linked A1 mate", () => {
    const next = applyCommand(linkedAv("V1"), { type: "cut" });
    expect(next.project.clips.map((c) => c.id)).toEqual(["a1"]);
    expect(next.clipboard.map((c) => c.id)).toEqual(["v1"]);
    expect(next.project.clips[0]!.linkId).toBeUndefined();
  });

  it("X with VIS focused does not cut A/V clips", () => {
    const start = linkedAv("vis");
    const next = applyCommand(start, { type: "cut" });
    expect(next.project.clips).toHaveLength(2);
    expect(next.error).toBe("No clip selected to cut");
  });
});
