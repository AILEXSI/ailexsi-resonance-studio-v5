import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import { createSession, type Session } from "../../src/app/session";
import { audioClipsForMix, jobFromProject } from "../../src/core/exporter/job";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { deserializeProject, serializeProject } from "../../src/core/project";
import { moveClip, setClipRate, slipClip, slipClips, splitClipAt, splitAtPlayhead } from "../../src/core/timeline";
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

  it("slip of one linked clip applies the same source delta to the mate", () => {
    const start = linkedPair();
    start.project.assets = [
      asset({
        id: "va",
        kind: "video",
        durationMs: 4000,
        objectUrl: "blob:v",
        hasAudio: true,
      }),
    ];
    const slipped = slipClip(start.project, "v1", 200);
    expect(slipped.error).toBeUndefined();
    const v = slipped.project.clips.find((c) => c.id === "v1")!;
    const a = slipped.project.clips.find((c) => c.id === "a1")!;
    expect(v.startMs).toBe(0);
    expect(v.durationMs).toBe(2000);
    expect(v.sourceInMs).toBe(200);
    expect(v.sourceOutMs).toBe(2200);
    expect(a.startMs).toBe(0);
    expect(a.durationMs).toBe(2000);
    expect(a.sourceInMs).toBe(200);
    expect(a.sourceOutMs).toBe(2200);
  });

  it("slip blocked by mate source bounds moves neither clip", () => {
    const start = linkedPair();
    start.project.assets = [
      asset({ id: "va", kind: "video", durationMs: 4000, objectUrl: "blob:v", hasAudio: true }),
      asset({ id: "aa", kind: "audio", durationMs: 2000, objectUrl: "blob:a" }),
    ];
    start.project.clips = start.project.clips.map((c) =>
      c.id === "a1" ? { ...c, assetId: "aa" } : c,
    );
    const blocked = slipClip(start.project, "v1", 200);
    expect(blocked.project).toBe(start.project);
    expect(blocked.error).toMatch(/slip/i);
    expect(blocked.project.clips.find((c) => c.id === "v1")!.sourceInMs).toBe(0);
    expect(blocked.project.clips.find((c) => c.id === "a1")!.sourceInMs).toBe(0);
  });

  it("setClipRate on a linked clip sets the same rate and resizes both durations", () => {
    const start = linkedPair();
    const next = setClipRate(start.project, "v1", 2);
    expect(next.error).toBeUndefined();
    const v = next.project.clips.find((c) => c.id === "v1")!;
    const a = next.project.clips.find((c) => c.id === "a1")!;
    expect(v.rate).toBe(2);
    expect(a.rate).toBe(2);
    expect(v.durationMs).toBe(1000);
    expect(a.durationMs).toBe(1000);
    expect(v.sourceInMs).toBe(0);
    expect(v.sourceOutMs).toBe(2000);
    expect(a.sourceInMs).toBe(0);
    expect(a.sourceOutMs).toBe(2000);
    expect(v.startMs).toBe(0);
    expect(a.startMs).toBe(0);
  });

  it("setClipRate no-ops both when the mate would overlap the next clip", () => {
    const start = linkedPair();
    start.project.clips = [
      ...start.project.clips,
      clip({ id: "a2", assetId: "va", trackId: "A1", startMs: 2000, durationMs: 500 }),
    ];
    const rejected = setClipRate(start.project, "v1", 0.5);
    expect(rejected.project).toBe(start.project);
    expect(rejected.error).toMatch(/overlap/i);
    expect(rejected.project.clips.find((c) => c.id === "v1")!.rate).toBe(1);
    expect(rejected.project.clips.find((c) => c.id === "a1")!.rate).toBe(1);
    expect(rejected.project.clips.find((c) => c.id === "v1")!.durationMs).toBe(2000);
  });

  it("group slip follows a living mate of a member, or no-ops all", () => {
    const va = asset({
      id: "va",
      kind: "video",
      durationMs: 4000,
      objectUrl: "blob:v",
      hasAudio: true,
    });
    const start = {
      ...projectWith(
        [
          clip({
            id: "v1",
            assetId: "va",
            trackId: "V1",
            startMs: 0,
            durationMs: 1000,
            sourceInMs: 0,
            sourceOutMs: 1000,
            linkId: "lnk1",
          }),
          clip({
            id: "v2",
            assetId: "va",
            trackId: "V1",
            startMs: 1000,
            durationMs: 1000,
            sourceInMs: 200,
            sourceOutMs: 1200,
          }),
          clip({
            id: "a1",
            assetId: "va",
            trackId: "A1",
            startMs: 0,
            durationMs: 1000,
            sourceInMs: 0,
            sourceOutMs: 1000,
            linkId: "lnk1",
          }),
        ],
        [va],
      ),
      snap: false,
    };
    const slipped = slipClips(start, ["v1", "v2"], 200);
    expect(slipped.error).toBeUndefined();
    expect(slipped.project.clips.find((c) => c.id === "v1")!.sourceInMs).toBe(200);
    expect(slipped.project.clips.find((c) => c.id === "v2")!.sourceInMs).toBe(400);
    expect(slipped.project.clips.find((c) => c.id === "a1")!.sourceInMs).toBe(200);
    expect(slipped.project.clips.find((c) => c.id === "v1")!.startMs).toBe(0);
    expect(slipped.project.clips.find((c) => c.id === "v2")!.startMs).toBe(1000);
    expect(slipped.project.clips.find((c) => c.id === "a1")!.startMs).toBe(0);

    const tight = {
      ...start,
      assets: [
        va,
        asset({ id: "aa", kind: "audio", durationMs: 1000, objectUrl: "blob:a" }),
      ],
      clips: start.clips.map((c) => (c.id === "a1" ? { ...c, assetId: "aa" } : c)),
    };
    const blocked = slipClips(tight, ["v1", "v2"], 200);
    expect(blocked.project).toBe(tight);
    expect(blocked.error).toMatch(/slip/i);
    expect(blocked.project.clips.find((c) => c.id === "v1")!.sourceInMs).toBe(0);
    expect(blocked.project.clips.find((c) => c.id === "v2")!.sourceInMs).toBe(200);
    expect(blocked.project.clips.find((c) => c.id === "a1")!.sourceInMs).toBe(0);
  });

  it("unlink then slip one leaves the other", () => {
    const start = linkedPair();
    start.project.assets = [
      asset({
        id: "va",
        kind: "video",
        durationMs: 4000,
        objectUrl: "blob:v",
        hasAudio: true,
      }),
    ];
    const unlinked = applyCommand(start, { type: "unlinkClips", clipId: "v1" });
    const slipped = applyCommand(unlinked, { type: "slip", clipId: "v1", deltaMs: 200 });
    expect(slipped.project.clips.find((c) => c.id === "v1")!.sourceInMs).toBe(200);
    expect(slipped.project.clips.find((c) => c.id === "a1")!.sourceInMs).toBe(0);
    expect(slipped.project.clips.find((c) => c.id === "a1")!.sourceOutMs).toBe(2000);
  });
});
