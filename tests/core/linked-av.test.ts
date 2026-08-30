import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import { createSession, type Session } from "../../src/app/session";
import { audioClipsForMix, jobFromProject } from "../../src/core/exporter/job";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { deserializeProject, serializeProject } from "../../src/core/project";
import { moveClip, splitClipAt, splitAtPlayhead } from "../../src/core/timeline";
import { asset, clip, projectWith } from "../helpers";

function linkedPair(): Session {
  const va = asset({
    id: "va",
    kind: "video",
    durationMs: 2000,
    objectUrl: "blob:v",
    hasAudio: true,
  });
  return {
    ...createSession(createMemoryBlobStore()),
    project: {
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
    },
    selectedClipId: "v1",
    selectedClipIds: ["v1"],
  };
}

describe("linked A/V", () => {
  it("mix skips V audio when a living linked A clip exists; unlinked V stays in the mix", () => {
    const start = linkedPair();
    const mixed = audioClipsForMix(jobFromProject(start.project));
    expect(mixed.map((c) => c.id).sort()).toEqual(["a1"]);

    const unlinked = applyCommand(start, { type: "unlinkClips", clipId: "v1" });
    const after = audioClipsForMix(jobFromProject(unlinked.project));
    expect(after.map((c) => c.id).sort()).toEqual(["a1", "v1"]);
  });

  it("split at the same time cuts both and keeps each half-pair linked", () => {
    const start = linkedPair();
    const split = splitClipAt(start.project, "v1", 1000);
    expect(split.error).toBeUndefined();
    const clips = split.project.clips;
    expect(clips).toHaveLength(4);
    const vL = clips.find((c) => c.id === "v1")!;
    const vR = clips.find((c) => c.trackId === "V1" && c.id !== "v1")!;
    const aL = clips.find((c) => c.id === "a1")!;
    const aR = clips.find((c) => c.trackId === "A1" && c.id !== "a1")!;
    expect(vL.durationMs).toBe(1000);
    expect(aL.durationMs).toBe(1000);
    expect(vR.startMs).toBe(1000);
    expect(aR.startMs).toBe(1000);
    expect(vL.linkId).toBe(aL.linkId);
    expect(vR.linkId).toBe(aR.linkId);
    expect(vL.linkId).toBe("lnk1");
    expect(vR.linkId).toBeTruthy();
    expect(vR.linkId).not.toBe(vL.linkId);
  });

  it("split at playhead through applyCommand cuts the pair", () => {
    const start = linkedPair();
    const next = applyCommand(start, { type: "split" });
    expect(next.project.clips).toHaveLength(4);
    expect(next.project.clips.filter((c) => c.trackId === "V1")).toHaveLength(2);
    expect(next.project.clips.filter((c) => c.trackId === "A1")).toHaveLength(2);
    expect(splitAtPlayhead(start.project).error).toBeUndefined();
  });

  it("move of one linked clip moves the mate by the same delta", () => {
    const start = linkedPair();
    const moved = moveClip(start.project, "v1", 400);
    expect(moved.error).toBeUndefined();
    expect(moved.project.clips.find((c) => c.id === "v1")!.startMs).toBe(400);
    expect(moved.project.clips.find((c) => c.id === "a1")!.startMs).toBe(400);
    expect(moved.project.clips.find((c) => c.id === "a1")!.trackId).toBe("A1");
  });

  it("unlink then move one leaves the other", () => {
    const start = linkedPair();
    const unlinked = applyCommand(start, { type: "unlinkClips", clipId: "v1" });
    expect(unlinked.project.clips.every((c) => !c.linkId)).toBe(true);
    const moved = applyCommand(unlinked, {
      type: "moveClips",
      clipIds: ["v1"],
      deltaMs: 300,
    });
    expect(moved.project.clips.find((c) => c.id === "v1")!.startMs).toBe(300);
    expect(moved.project.clips.find((c) => c.id === "a1")!.startMs).toBe(0);
  });

  it("legacy JSON without linkId stays valid and unlinked", () => {
    const raw = JSON.parse(serializeProject(linkedPair().project)) as {
      clips: Array<Record<string, unknown>>;
    };
    delete raw.clips[0]!.linkId;
    delete raw.clips[1]!.linkId;
    const loaded = deserializeProject(JSON.stringify(raw));
    expect(loaded.clips[0]!.linkId).toBeUndefined();
    expect(loaded.clips[1]!.linkId).toBeUndefined();
  });

  it("lift-delete of one linked clip lifts the mate", () => {
    const start = linkedPair();
    const gone = applyCommand(start, { type: "liftDelete" });
    expect(gone.project.clips).toHaveLength(0);
  });
});
