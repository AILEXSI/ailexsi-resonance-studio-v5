import { afterEach, describe, expect, it } from "vitest";
import {
  getDecoder,
  getFrameSourceBackend,
  resetFrameSourceBackend,
  setFrameSourceBackend,
  sourceTimeSec,
} from "../../src/core/exporter/frame-source";
import type { ExportClip } from "../../src/core/exporter/types";

function clip(partial: Partial<ExportClip> = {}): ExportClip {
  return {
    id: "c1",
    trackId: "V1",
    kind: "video",
    startMs: 0,
    endMs: 2000,
    sourceUrl: "https://127.0.0.1/mbr.mp4",
    sourceInMs: 0,
    sourceOutMs: 2000,
    gain: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    rate: 1,
    missing: false,
    label: "mbr",
    ...partial,
  };
}

afterEach(() => {
  resetFrameSourceBackend();
});

describe("MBR frame-source backend switch", () => {
  it("defaults to mediabunny so production export stays recoverable", () => {
    expect(getFrameSourceBackend()).toBe("mediabunny");
  });

  it("htmlvideo backend makes getDecoder return null without opening Mediabunny", async () => {
    setFrameSourceBackend("htmlvideo");
    expect(getFrameSourceBackend()).toBe("htmlvideo");
    await expect(getDecoder("https://127.0.0.1/does-not-need-to-exist.mp4")).resolves.toBeNull();
  });

  it("reset restores the Mediabunny production path", () => {
    setFrameSourceBackend("htmlvideo");
    resetFrameSourceBackend();
    expect(getFrameSourceBackend()).toBe("mediabunny");
  });

  it("rejects unknown backend ids by staying on mediabunny", () => {
    setFrameSourceBackend("htmlvideo");
    setFrameSourceBackend("not-a-backend" as "mediabunny");
    expect(getFrameSourceBackend()).toBe("mediabunny");
  });

  it("sourceTimeSec is backend-independent (center-of-frame + Source In/Out + rate)", () => {
    const c = clip({ sourceInMs: 1000, sourceOutMs: 5000, rate: 2, startMs: 0, endMs: 1000 });
    const a = sourceTimeSec(c, 250, 30);
    setFrameSourceBackend("htmlvideo");
    const b = sourceTimeSec(c, 250, 30);
    expect(b).toBe(a);
    expect(a).toBeCloseTo((1000 + 250 * 2 + 500 / 30) / 1000, 6);
  });
});
