import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import {
  activeEditTrackIds,
  applySelectTracks,
  createSession,
  type Session,
} from "../../src/app/session";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { asset, clip, projectWith } from "../helpers";

function stacked(active: "V1" | "V2" | "A1" | "A2" | "vis", extra?: Partial<Session>): Session {
  const va = asset({ id: "va", kind: "video", durationMs: 2000, objectUrl: "blob:v", hasAudio: true });
  const vb = asset({ id: "vb", kind: "video", durationMs: 2000, objectUrl: "blob:v2" });
  const aa = asset({ id: "aa", kind: "audio", durationMs: 2000, objectUrl: "blob:a" });
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
          id: "v2",
          assetId: "vb",
          trackId: "V2",
          startMs: 0,
          durationMs: 2000,
          sourceInMs: 0,
          sourceOutMs: 2000,
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
        clip({
          id: "a2",
          assetId: "aa",
          trackId: "A2",
          startMs: 0,
          durationMs: 2000,
          sourceInMs: 0,
          sourceOutMs: 2000,
        }),
      ],
      [va, vb, aa],
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
      selectedTrackIds: ["V1"],
      ...extra,
    };
  }
  const clipId = active === "V1" ? "v1" : active === "V2" ? "v2" : active === "A1" ? "a1" : "a2";
  return {
    ...base,
    project,
    selectedClipId: clipId,
    selectedClipIds: [clipId],
    targetTrackId: active,
    selectedTrackIds: [active],
    ...extra,
  };
}

describe("active-track split (S)", () => {
  it("S on V1 splits video only and leaves A1 / V2 / A2 whole", () => {
    const next = applyCommand(stacked("V1"), { type: "split" });
    expect(next.error).toBeNull();
    expect(next.project.clips.filter((c) => c.trackId === "V1")).toHaveLength(2);
    expect(next.project.clips.filter((c) => c.trackId === "V2")).toHaveLength(1);
    expect(next.project.clips.filter((c) => c.trackId === "A1")).toHaveLength(1);
    expect(next.project.clips.filter((c) => c.trackId === "A2")).toHaveLength(1);
    expect(next.project.clips.find((c) => c.id === "a1")!.durationMs).toBe(2000);
  });

  it("S on A1 splits audio only and leaves V1 whole (no linked mate cut)", () => {
    const next = applyCommand(stacked("A1"), { type: "split" });
    expect(next.error).toBeNull();
    expect(next.project.clips.filter((c) => c.trackId === "A1")).toHaveLength(2);
    expect(next.project.clips.filter((c) => c.trackId === "V1")).toHaveLength(1);
    expect(next.project.clips.find((c) => c.id === "v1")!.durationMs).toBe(2000);
  });

  it("S with VIS focused does not cut V1–A2 clips", () => {
    const start = stacked("vis");
    const next = applyCommand(start, { type: "split" });
    expect(next.project.clips).toHaveLength(4);
    expect(next.project.clips.every((c) => c.durationMs === 2000)).toBe(true);
    expect(next.error).toBeNull();
  });

  it("S with no clip uses mixer targetTrackId only", () => {
    const start = stacked("V1", {
      selectedClipId: null,
      selectedClipIds: [],
      targetTrackId: "A2",
      selectedTrackIds: ["A2"],
    });
    const next = applyCommand(start, { type: "split" });
    expect(next.project.clips.filter((c) => c.trackId === "A2")).toHaveLength(2);
    expect(next.project.clips.filter((c) => c.trackId === "V1")).toHaveLength(1);
    expect(next.project.clips.filter((c) => c.trackId === "A1")).toHaveLength(1);
  });

  it("S with multi-selected tracks cuts only those at the playhead", () => {
    const start = applySelectTracks(
      applySelectTracks(stacked("vis", { selectedVis: false, selectedVisEventId: null }), "V1"),
      "A2",
      { toggle: true },
    );
    expect(activeEditTrackIds(start).sort()).toEqual(["A2", "V1"]);
    const next = applyCommand(start, { type: "split" });
    expect(next.project.clips.filter((c) => c.trackId === "V1")).toHaveLength(2);
    expect(next.project.clips.filter((c) => c.trackId === "A2")).toHaveLength(2);
    expect(next.project.clips.filter((c) => c.trackId === "V2")).toHaveLength(1);
    expect(next.project.clips.filter((c) => c.trackId === "A1")).toHaveLength(1);
  });

  it("S with clips selected on V1 and A2 cuts those tracks only", () => {
    const start = stacked("V1", { selectedClipId: "v1", selectedClipIds: ["v1", "a2"] });
    expect(activeEditTrackIds(start).sort()).toEqual(["A2", "V1"]);
    const next = applyCommand(start, { type: "split" });
    expect(next.project.clips.filter((c) => c.trackId === "V1")).toHaveLength(2);
    expect(next.project.clips.filter((c) => c.trackId === "A2")).toHaveLength(2);
    expect(next.project.clips.filter((c) => c.trackId === "V2")).toHaveLength(1);
    expect(next.project.clips.filter((c) => c.trackId === "A1")).toHaveLength(1);
  });
});
