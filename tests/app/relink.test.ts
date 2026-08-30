import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import { createSession, ingestRelinkFile, type Session } from "../../src/app/session";
import { relinkSelectionForAsset } from "../../src/core/relink";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { asset, clip, projectWith } from "../helpers";

function fakeFile(name: string, type: string, size = 128): File {
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type });
}

function probeMs(file: File) {
  const m = file.name.match(/(\d+)ms/);
  return Promise.resolve({ durationMs: m ? Number(m[1]) : 4000 });
}

function relinkSession(): Session {
  const va = asset({ id: "va", kind: "video", durationMs: 4000, missing: true });
  const vb = asset({ id: "vb", kind: "video", durationMs: 4000 });
  return {
    ...createSession(createMemoryBlobStore()),
    project: projectWith(
      [
        clip({
          id: "c1",
          assetId: "va",
          trackId: "V1",
          startMs: 250,
          durationMs: 2000,
          sourceInMs: 0,
          sourceOutMs: 2000,
        }),
        clip({
          id: "c2",
          assetId: "va",
          trackId: "V2",
          startMs: 800,
          durationMs: 1500,
          sourceInMs: 100,
          sourceOutMs: 1600,
        }),
        clip({
          id: "c3",
          assetId: "vb",
          trackId: "V1",
          startMs: 0,
          durationMs: 400,
          sourceInMs: 0,
          sourceOutMs: 400,
        }),
      ],
      [va, vb],
    ),
    selectedClipId: "c1",
    selectedClipIds: ["c1"],
  };
}

describe("relinkSelectionForAsset (P59)", () => {
  it("returns every clip that shares the missing asset", () => {
    const start = relinkSession();
    const sel = relinkSelectionForAsset(start.project, "va");
    expect(sel?.kind).toBe("video");
    expect(sel?.assetId).toBe("va");
    expect(sel?.clipIds.sort()).toEqual(["c1", "c2"]);
    expect(relinkSelectionForAsset(start.project, "vb")?.clipIds).toEqual(["c3"]);
    expect(relinkSelectionForAsset(start.project, "nope")).toBeNull();
    const unused = {
      ...start.project,
      assets: [...start.project.assets, asset({ id: "ghost", kind: "video", missing: true })],
    };
    expect(relinkSelectionForAsset(unused, "ghost")).toBeNull();
  });
});

describe("relinkClips", () => {
  it("relinks one clip: assetId changes, startMs unchanged, missing false", async () => {
    const start = relinkSession();
    const ingested = await ingestRelinkFile(start, fakeFile("new-3000ms.mp4", "video/mp4"), "video", probeMs);
    expect("assetId" in ingested).toBe(true);
    if (!("assetId" in ingested)) return;
    const next = applyCommand(ingested.session, {
      type: "relinkClips",
      clipIds: ["c1"],
      assetId: ingested.assetId,
    });
    const clip1 = next.project.clips.find((c) => c.id === "c1")!;
    const asset = next.project.assets.find((a) => a.id === ingested.assetId)!;
    expect(clip1.assetId).toBe(ingested.assetId);
    expect(clip1.assetId).not.toBe("va");
    expect(clip1.startMs).toBe(250);
    expect(clip1.durationMs).toBe(2000);
    expect(clip1.sourceOutMs).toBe(2000);
    expect(asset.missing).toBe(false);
    expect(next.project.assets.some((a) => a.id === "va")).toBe(true);
    expect(next.status).toBe("Relinked clip");
  });

  it("updates two clips that share an assetId and leaves a third alone", async () => {
    const start = { ...relinkSession(), selectedClipIds: ["c1", "c2"], selectedClipId: "c1" };
    const ingested = await ingestRelinkFile(start, fakeFile("pair-3000ms.mp4", "video/mp4"), "video", probeMs);
    if (!("assetId" in ingested)) throw new Error("ingest failed");
    const next = applyCommand(ingested.session, {
      type: "relinkClips",
      clipIds: ["c1", "c2"],
      assetId: ingested.assetId,
    });
    expect(next.project.clips.find((c) => c.id === "c1")!.assetId).toBe(ingested.assetId);
    expect(next.project.clips.find((c) => c.id === "c2")!.assetId).toBe(ingested.assetId);
    expect(next.project.clips.find((c) => c.id === "c3")!.assetId).toBe("vb");
    expect(next.project.clips.find((c) => c.id === "c1")!.startMs).toBe(250);
    expect(next.project.clips.find((c) => c.id === "c2")!.startMs).toBe(800);
    expect(next.status).toBe("Relinked clips");
  });

  it("mixed selection is a no-op", () => {
    const start = relinkSession();
    const past = start.history.past.length;
    const next = applyCommand(start, { type: "relinkClips", clipIds: ["c1", "c3"], assetId: "vb" });
    expect(next).toBe(start);
    expect(next.history.past.length).toBe(past);
    expect(next.project.clips.find((c) => c.id === "c1")!.assetId).toBe("va");
  });

  it("clamps sourceOut and duration when the new file is shorter, startMs unchanged", async () => {
    const start = relinkSession();
    const ingested = await ingestRelinkFile(start, fakeFile("short-800ms.mp4", "video/mp4"), "video", probeMs);
    if (!("assetId" in ingested)) throw new Error("ingest failed");
    const next = applyCommand(ingested.session, {
      type: "relinkClips",
      clipIds: ["c1"],
      assetId: ingested.assetId,
    });
    const clip1 = next.project.clips.find((c) => c.id === "c1")!;
    expect(clip1.startMs).toBe(250);
    expect(clip1.sourceOutMs).toBe(800);
    expect(clip1.sourceInMs).toBe(0);
    expect(clip1.durationMs).toBe(800);
  });

  it("rejects the wrong kind in the ingest helper and does not call the command", async () => {
    const start = relinkSession();
    const rejected = await ingestRelinkFile(start, fakeFile("nope.wav", "audio/wav"), "video", probeMs);
    expect(rejected).toEqual({ error: "Relink rejected: expected video, got audio" });
    expect(start.project.assets).toHaveLength(2);
    expect(start.project.clips.find((c) => c.id === "c1")!.assetId).toBe("va");
  });

  it("undo restores previous assetId and source window", async () => {
    const start = relinkSession();
    const ingested = await ingestRelinkFile(start, fakeFile("short-800ms.mp4", "video/mp4"), "video", probeMs);
    if (!("assetId" in ingested)) throw new Error("ingest failed");
    const relinked = applyCommand(ingested.session, {
      type: "relinkClips",
      clipIds: ["c1"],
      assetId: ingested.assetId,
    });
    expect(relinked.project.clips.find((c) => c.id === "c1")!.sourceOutMs).toBe(800);
    const undone = applyCommand(relinked, { type: "undo" });
    const clip1 = undone.project.clips.find((c) => c.id === "c1")!;
    expect(clip1.assetId).toBe("va");
    expect(clip1.sourceOutMs).toBe(2000);
    expect(clip1.durationMs).toBe(2000);
    expect(clip1.startMs).toBe(250);
  });
});
