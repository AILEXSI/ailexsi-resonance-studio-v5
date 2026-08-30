import { describe, expect, it } from "vitest";
import { classifyFile, importMediaFile, ImportError } from "../../src/core/media";
import { placeAsset } from "../../src/core/timeline";
import { createEmptyProject } from "../../src/core/project";

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
