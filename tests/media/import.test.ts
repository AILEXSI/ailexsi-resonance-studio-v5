import { describe, expect, it } from "vitest";
import { createSession, importFiles } from "../../src/app/session";
import { classifyFile, importMediaFile, ImportError } from "../../src/core/media";
import { clipEndMs } from "../../src/core/models";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { createEmptyProject } from "../../src/core/project";
import { lastClipEndMsOnTrack, placeAsset } from "../../src/core/timeline";
import { asset, clip, projectWith } from "../helpers";

function fakeFile(name: string, type: string, size = 128): File {
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type });
}

describe("media import", () => {
  it("rejects non audio/video with a visible error", () => {
    expect(() => classifyFile(fakeFile("notes.txt", "text/plain"))).toThrowError(ImportError);
    try {
      classifyFile(fakeFile("photo.png", "image/png"));
    } catch (e) {
      expect(e).toBeInstanceOf(ImportError);
      expect((e as ImportError).code).toBe("WRONG_TYPE");
      expect((e as ImportError).message).toMatch(/only audio and video/);
    }
  });

  it("classifies audio and video", () => {
    expect(classifyFile(fakeFile("beat.wav", "audio/wav"))).toBe("audio");
    expect(classifyFile(fakeFile("take.mp4", "video/mp4"))).toBe("video");
  });

  it("imports asset then places a clip (integration)", async () => {
    const file = fakeFile("voice.wav", "audio/wav", 256);
    const asset = await importMediaFile(file, async () => ({ durationMs: 1500 }));
    expect(asset.kind).toBe("audio");
    expect(asset.durationMs).toBe(1500);
    expect(asset.blobId.startsWith("blob:")).toBe(false);
    const placed = placeAsset(
      { ...createEmptyProject(), assets: [asset] },
      asset.id,
      "A1",
      0,
    );
    expect(placed.error).toBeUndefined();
    expect(placed.clip?.trackId).toBe("A1");
    expect(placed.clip?.durationMs).toBe(1500);
    expect(placed.project.clips).toHaveLength(1);
  });

  it("places video on V1/V2 and audio on A1/A2 deterministically", async () => {
    const video = await importMediaFile(fakeFile("clip.mp4", "video/mp4"), async () => ({
      durationMs: 2000,
      width: 16,
      height: 16,
    }));
    const audio = await importMediaFile(fakeFile("bed.wav", "audio/wav"), async () => ({
      durationMs: 900,
    }));
    let project = { ...createEmptyProject(), assets: [video, audio] };
    const v1 = placeAsset(project, video.id, "V1", 0);
    expect(v1.error).toBeUndefined();
    expect(v1.clip?.trackId).toBe("V1");
    project = v1.project;
    const v2 = placeAsset(project, video.id, "V2", 100);
    expect(v2.error).toBeUndefined();
    expect(v2.clip?.trackId).toBe("V2");
    project = v2.project;
    const a1 = placeAsset(project, audio.id, "A1", 0);
    expect(a1.error).toBeUndefined();
    expect(a1.clip?.trackId).toBe("A1");
    project = a1.project;
    const a2 = placeAsset(project, audio.id, "A2", 50);
    expect(a2.error).toBeUndefined();
    expect(a2.clip?.trackId).toBe("A2");
    expect(a2.project.clips.map((c) => c.trackId).sort()).toEqual(["A1", "A2", "V1", "V2"]);
  });

  it("refuses placing video on an audio track", async () => {
    const asset = await importMediaFile(fakeFile("v.mp4", "video/mp4"), async () => ({
      durationMs: 800,
      width: 16,
      height: 16,
    }));
    const result = placeAsset({ ...createEmptyProject(), assets: [asset] }, asset.id, "A1");
    expect(result.error).toMatch(/cannot go on A1/);
  });
});

function probeByName(file: File) {
  const m = file.name.match(/(\d+)ms/);
  return Promise.resolve({ durationMs: m ? Number(m[1]) : 1000 });
}

async function importNamed(session: ReturnType<typeof createSession>, names: string[]) {
  const files = names.map((name) =>
    fakeFile(name, name.endsWith(".wav") ? "audio/wav" : "video/mp4", 256),
  );
  return importFiles(session, files, probeByName);
}

describe("import sequential placement", () => {
  it("lastClipEndMsOnTrack is 0 on an empty track and follows the latest end", () => {
    const empty = createEmptyProject();
    expect(lastClipEndMsOnTrack(empty, "V1")).toBe(0);
    const p = projectWith([
      clip({ id: "a", assetId: "x", trackId: "V1", startMs: 0, durationMs: 1000 }),
      clip({ id: "b", assetId: "x", trackId: "V1", startMs: 2500, durationMs: 500 }),
      clip({ id: "c", assetId: "y", trackId: "A1", startMs: 0, durationMs: 9000 }),
    ]);
    expect(lastClipEndMsOnTrack(p, "V1")).toBe(3000);
    expect(lastClipEndMsOnTrack(p, "A1")).toBe(9000);
    expect(lastClipEndMsOnTrack(p, "V2")).toBe(0);
  });

  it("two videos in one import sit end-to-end on V1", async () => {
    const session = await importNamed(createSession(createMemoryBlobStore()), [
      "one-1000ms.mp4",
      "two-2000ms.mp4",
    ]);
    const clips = session.project.clips.filter((c) => c.trackId === "V1");
    expect(clips).toHaveLength(2);
    expect(clips[0]!.startMs).toBe(0);
    expect(clips[0]!.durationMs).toBe(1000);
    expect(clips[1]!.startMs).toBe(1000);
    expect(clips[1]!.durationMs).toBe(2000);
    expect(clipEndMs(clips[0]!)).toBe(clips[1]!.startMs);
    expect(session.project.clips.filter((c) => c.trackId === "V2")).toHaveLength(0);
  });

  it("two audios in one import sit end-to-end on A1", async () => {
    const session = await importNamed(createSession(createMemoryBlobStore()), [
      "a-800ms.wav",
      "b-400ms.wav",
    ]);
    const clips = session.project.clips.filter((c) => c.trackId === "A1");
    expect(clips).toHaveLength(2);
    expect(clips[0]!.startMs).toBe(0);
    expect(clips[1]!.startMs).toBe(800);
    expect(clipEndMs(clips[0]!)).toBe(clips[1]!.startMs);
    expect(session.project.clips.filter((c) => c.trackId === "A2")).toHaveLength(0);
  });

  it("mixed video+audio stay on independent tracks", async () => {
    const session = await importNamed(createSession(createMemoryBlobStore()), [
      "v1-1000ms.mp4",
      "a1-500ms.wav",
      "v2-300ms.mp4",
      "a2-200ms.wav",
    ]);
    const v = session.project.clips.filter((c) => c.trackId === "V1");
    const a = session.project.clips.filter((c) => c.trackId === "A1");
    expect(v.map((c) => [c.startMs, c.durationMs])).toEqual([
      [0, 1000],
      [1000, 300],
    ]);
    expect(a.map((c) => [c.startMs, c.durationMs])).toEqual([
      [0, 500],
      [500, 200],
    ]);
    expect(session.project.clips).toHaveLength(4);
  });

  it("appends after the last existing clip on that track", async () => {
    let session = createSession(createMemoryBlobStore());
    session.project = projectWith(
      [clip({ id: "old", assetId: "kept", trackId: "V1", startMs: 200, durationMs: 800 })],
      [asset({ id: "kept", kind: "video", durationMs: 800, missing: true })],
    );
    const oldStart = session.project.clips[0]!.startMs;
    session = await importNamed(session, ["new-500ms.mp4"]);
    const clips = session.project.clips.filter((c) => c.trackId === "V1");
    expect(clips).toHaveLength(2);
    const kept = clips.find((c) => c.id === "old")!;
    const added = clips.find((c) => c.id !== "old")!;
    expect(kept.startMs).toBe(oldStart);
    expect(added.startMs).toBe(1000);
    expect(clipEndMs(kept)).toBe(added.startMs);
  });

  it("single file on an empty track starts at 0", async () => {
    const session = await importNamed(createSession(createMemoryBlobStore()), ["solo-1500ms.wav"]);
    expect(session.project.clips).toHaveLength(1);
    expect(session.project.clips[0]!.trackId).toBe("A1");
    expect(session.project.clips[0]!.startMs).toBe(0);
    expect(session.project.clips[0]!.durationMs).toBe(1500);
  });
});

