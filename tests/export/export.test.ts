import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../../src/core/project";
import { jobFromProject, ExportPlanError } from "../../src/core/exporter/job";
import { exportTimeline, canUseWebCodecs, webCodecsUnavailableMessage } from "../../src/core/exporter";
import { hexHeader, looksLikeWebm, validateMp4Ftyp } from "../../src/core/exporter/ftyp";
import { muxAvcToMp4 } from "../../src/core/exporter/mp4";
import { asset, clip, projectWith } from "../helpers";

function projectReady() {
  return projectWith(
    [clip({ id: "c1", assetId: "a1", trackId: "V1", startMs: 0, durationMs: 1000 })],
    [asset({ id: "a1", kind: "video", durationMs: 1000, objectUrl: "blob:test", missing: false })],
  );
}

describe("export planner + fail path", () => {
  it("fails empty project before encode", () => {
    expect(() => jobFromProject(createEmptyProject())).toThrow(ExportPlanError);
  });

  it("fails when IN >= OUT", () => {
    const p = projectReady();
    p.inPointMs = 800;
    p.outPointMs = 200;
    expect(() => jobFromProject(p)).toThrow(/empty/);
  });

  it("plans IN/OUT range and shifts clip times", () => {
    const p = projectReady();
    p.inPointMs = 200;
    p.outPointMs = 800;
    const job = jobFromProject(p);
    expect(job.durationMs).toBe(600);
    expect(job.tracks.find((t) => t.id === "V1")!.clips[0]!.startMs).toBe(0);
    expect(job.fileName.endsWith(".mp4")).toBe(true);
  });

  it("exportTimeline FAILs without WebCodecs (never WebM success)", async () => {
    const job = jobFromProject(projectReady());
    const result = await exportTimeline(job);
    if (canUseWebCodecs()) {
      expect(result.success === true || result.success === false).toBe(true);
      if (result.success) {
        expect(result.mimeType).toBe("video/mp4");
        expect(result.blob).toBeTruthy();
      }
    } else {
      expect(result.success).toBe(false);
      expect(result.error).toBe(webCodecsUnavailableMessage());
      expect(result.error).toMatch(/WebM is not a fallback/);
    }
  });

  it("rejects WebM bytes as MP4", () => {
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00]);
    expect(looksLikeWebm(webm)).toBe(true);
    const check = validateMp4Ftyp(webm);
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(/WebM/);
  });

  it("validates a muxed ftyp box (synthetic AVC, not a runtime export)", () => {
    const avcC = new Uint8Array([
      1, 0x42, 0x00, 0x1f, 0xff, 0xe1, 0x00, 0x08,
      0x67, 0x42, 0x00, 0x1f, 0xaa, 0xbb, 0xcc, 0xdd,
      0x01, 0x00, 0x05, 0x68, 0xee, 0xff, 0x00, 0x11,
    ]);
    const nal = new Uint8Array([0x00, 0x00, 0x00, 0x08, 0x65, 1, 2, 3, 4, 5, 6, 7]);
    const bytes = muxAvcToMp4({
      width: 16,
      height: 16,
      fps: 30,
      description: avcC,
      samples: [{ data: nal, timestampUs: 0, durationUs: 33333, key: true }],
    });
    const check = validateMp4Ftyp(bytes);
    expect(check.ok).toBe(true);
    expect(check.brands).toContain("isom");
    expect(check.brands).toContain("avc1");
    expect(hexHeader(bytes, 8)).toMatch(/66 74 79 70/);
    expect(String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!)).toBe("ftyp");
  });
});
