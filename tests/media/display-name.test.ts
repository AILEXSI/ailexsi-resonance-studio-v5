import { describe, expect, it } from "vitest";
import { displayMediaName } from "../../src/core/media-display";

describe("MEDIA display names", () => {
  it("shortens UUID-looking filenames and keeps the extension", () => {
    const raw = "a1b2c3d4-e5f6-7890-abcd-ef1234567890.mp4";
    expect(displayMediaName(raw)).toBe("a1b2c3….mp4");
    expect(displayMediaName(raw)).not.toBe(raw);
  });

  it("leaves short human names alone", () => {
    expect(displayMediaName("kick.wav")).toBe("kick.wav");
  });

  it("does not rewrite the original string used as a tooltip", () => {
    const disk = "asset_9c3e2b10-1111-2222-3333-444455556666.mp4";
    const shown = displayMediaName(disk);
    expect(shown.length).toBeLessThan(disk.length);
    expect(disk.endsWith(".mp4")).toBe(true);
    expect(shown.endsWith(".mp4")).toBe(true);
  });
});
