import { describe, expect, it } from "vitest";
import {
  audioClipsAt,
  clipEndMs,
  defaultTracks,
  formatTimecode,
  isTrackAudible,
  isTrackId,
  kindOfTrack,
  projectDurationMs,
  TRACK_IDS,
  topVideoClipAt,
} from "../../src/core/models";
import { createEmptyProject } from "../../src/core/project";
import { clip, projectWith } from "../helpers";

describe("foundation models", () => {
  it("creates V1 V2 A1 A2 only", () => {
    const p = createEmptyProject();
    expect(p.schemaVersion).toBe(5);
    expect(p.tracks.map((t) => t.id)).toEqual(["V1", "V2", "A1", "A2"]);
    expect(defaultTracks().every((t) => t.kind === kindOfTrack(t.id))).toBe(true);
    expect(defaultTracks().every((t) => t.volume === 1)).toBe(true);
    expect(defaultTracks().every((t) => t.pan === 0)).toBe(true);
    expect(defaultTracks().every((t) => t.solo === false)).toBe(true);
    expect(p.masterVolume).toBe(1);
    expect(p.clips).toEqual([]);
    expect(p.inPointMs).toBeNull();
    expect(p.outPointMs).toBeNull();
    expect(TRACK_IDS).toEqual(["V1", "V2", "A1", "A2"]);
    expect(isTrackId("VIS")).toBe(false);
    expect(p.tracks.some((t) => t.id === ("VIS" as never))).toBe(false);
  });

  it("computes duration from clips and out point", () => {
    const p = projectWith([clip({ id: "c1", assetId: "a", trackId: "V1", startMs: 200, durationMs: 800 })]);
    expect(clipEndMs(p.clips[0]!)).toBe(1000);
    expect(projectDurationMs(p)).toBe(1000);
    expect(projectDurationMs({ ...p, outPointMs: 2500 })).toBe(2500);
  });

  it("picks V2 over V1 under playhead", () => {
    const p = projectWith([
      clip({ id: "v1", assetId: "a", trackId: "V1", startMs: 0, durationMs: 2000 }),
      clip({ id: "v2", assetId: "b", trackId: "V2", startMs: 500, durationMs: 500 }),
    ]);
    expect(topVideoClipAt(p, 600)?.id).toBe("v2");
    expect(topVideoClipAt(p, 100)?.id).toBe("v1");
    expect(topVideoClipAt(p, 3000)).toBeUndefined();
  });

  it("finds up to two audio clips", () => {
    const p = projectWith([
      clip({ id: "a1", assetId: "a", trackId: "A1", startMs: 0, durationMs: 1000 }),
      clip({ id: "a2", assetId: "b", trackId: "A2", startMs: 0, durationMs: 1000 }),
    ]);
    expect(audioClipsAt(p, 100).map((c) => c.id).sort()).toEqual(["a1", "a2"]);
  });

  it("empty project has zero duration", () => {
    expect(projectDurationMs(createEmptyProject())).toBe(0);
  });
});

describe("mute skip", () => {
  it("skips muted video tracks and still prefers V2 over V1", () => {
    const p = projectWith([
      clip({ id: "v1", assetId: "a", trackId: "V1", startMs: 0, durationMs: 2000 }),
      clip({ id: "v2", assetId: "b", trackId: "V2", startMs: 0, durationMs: 2000 }),
    ]);
    expect(topVideoClipAt(p, 100)?.id).toBe("v2");
    p.tracks = p.tracks.map((t) => (t.id === "V2" ? { ...t, muted: true } : t));
    expect(topVideoClipAt(p, 100)?.id).toBe("v1");
    p.tracks = p.tracks.map((t) => (t.id === "V1" || t.id === "V2" ? { ...t, muted: true } : t));
    expect(topVideoClipAt(p, 100)).toBeUndefined();
  });

  it("skips non-soloed video when another video is soloed", () => {
    const p = projectWith([
      clip({ id: "v1", assetId: "a", trackId: "V1", startMs: 0, durationMs: 2000 }),
      clip({ id: "v2", assetId: "b", trackId: "V2", startMs: 0, durationMs: 2000 }),
    ]);
    p.tracks = p.tracks.map((t) => (t.id === "V1" ? { ...t, solo: true } : t));
    expect(topVideoClipAt(p, 100)?.id).toBe("v1");
  });

  it("skips muted A1/A2", () => {
    const p = projectWith([
      clip({ id: "a1", assetId: "a", trackId: "A1", startMs: 0, durationMs: 1000 }),
      clip({ id: "a2", assetId: "b", trackId: "A2", startMs: 0, durationMs: 1000 }),
    ]);
    expect(audioClipsAt(p, 100)).toHaveLength(2);
    p.tracks = p.tracks.map((t) => (t.id === "A1" ? { ...t, muted: true } : t));
    expect(audioClipsAt(p, 100).map((c) => c.id)).toEqual(["a2"]);
  });

  it("solo A1 silences A2; mute still wins on a soloed track", () => {
    const p = projectWith([
      clip({ id: "a1", assetId: "a", trackId: "A1", startMs: 0, durationMs: 1000 }),
      clip({ id: "a2", assetId: "b", trackId: "A2", startMs: 0, durationMs: 1000 }),
    ]);
    expect(isTrackAudible(p, "A1")).toBe(true);
    expect(isTrackAudible(p, "A2")).toBe(true);
    p.tracks = p.tracks.map((t) => (t.id === "A1" ? { ...t, solo: true } : t));
    expect(isTrackAudible(p, "A1")).toBe(true);
    expect(isTrackAudible(p, "A2")).toBe(false);
    expect(audioClipsAt(p, 100).map((c) => c.id)).toEqual(["a1"]);
    p.tracks = p.tracks.map((t) => (t.id === "A1" ? { ...t, muted: true } : t));
    expect(isTrackAudible(p, "A1")).toBe(false);
    expect(audioClipsAt(p, 100)).toHaveLength(0);
    p.tracks = p.tracks.map((t) =>
      t.id === "A1" ? { ...t, muted: false, solo: false } : t,
    );
    expect(isTrackAudible(p, "A1")).toBe(true);
    expect(isTrackAudible(p, "A2")).toBe(true);
  });

  it("formats mm:ss.cc", () => {
    expect(formatTimecode(0)).toBe("00:00.00");
    expect(formatTimecode(1500)).toBe("00:01.50");
    expect(formatTimecode(61_230)).toBe("01:01.23");
  });
});
