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
