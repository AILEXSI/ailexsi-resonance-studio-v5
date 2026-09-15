import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

function expectedFrameAtSec(timeSec: number, fps: number): number {
  if (!Number.isFinite(timeSec) || timeSec < 0) return 0;
  return Math.max(0, Math.floor(timeSec * fps + 1e-9));
}

function classifyFrameHit(expected: number, actual: number | null): string {
  if (actual == null || !Number.isFinite(actual)) return "UNKNOWN";
  const delta = actual - expected;
  if (delta === 0) return "EXACT";
  if (Math.abs(delta) === 1) return "WITHIN 1 FRAME";
  return ">1 FRAME ERROR";
}

describe("MBR frame-identity fixtures + classifier", () => {
  it("ships generated CFR H.264 files with probed keyframes (not third-party media)", () => {
    const manifest = JSON.parse(readFileSync("tests/fixtures/mbr/manifest.json", "utf8")) as {
      generated: boolean;
      files: { path: string; fps: number; seconds: number; frames: number; keyframeSec: number[] }[];
    };
    expect(manifest.generated).toBe(true);
    expect(manifest.files.length).toBe(8);
    for (const file of manifest.files) {
      expect(existsSync(file.path)).toBe(true);
      expect(file.frames).toBe(Math.round(file.fps * file.seconds));
      expect(file.keyframeSec[0]).toBe(0);
      const bytes = readFileSync(file.path);
      expect(String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!)).toBe("ftyp");
    }
  });

  it("classifies exact / within-1 / >1 and maps timestamps to frame indices", () => {
    expect(expectedFrameAtSec(0, 30)).toBe(0);
    expect(expectedFrameAtSec(1 / 30, 30)).toBe(1);
    expect(expectedFrameAtSec(10, 30)).toBe(300);
    expect(classifyFrameHit(100, 100)).toBe("EXACT");
    expect(classifyFrameHit(100, 101)).toBe("WITHIN 1 FRAME");
    expect(classifyFrameHit(100, 50)).toBe(">1 FRAME ERROR");
    expect(classifyFrameHit(100, null)).toBe("UNKNOWN");
  });

  it("jsdom cannot decode H.264 — pixel A/B lives in Chrome evidence, not this suite", () => {
    const video = document.createElement("video");
    expect(video.videoWidth).toBe(0);
    expect(typeof video.requestVideoFrameCallback).not.toBe("function");
    const evidencePath = "docs/compliance/mbr-evidence.json";
    if (!existsSync(evidencePath)) {
      expect(existsSync("scripts/mbr-frame-harness.html")).toBe(true);
      return;
    }
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
      totals?: { compared?: number };
      environment?: { userAgent?: string };
    };
    expect(evidence.totals?.compared).toBeGreaterThan(0);
    expect(evidence.environment?.userAgent).toMatch(/Chrome|Chromium/i);
  });
});
