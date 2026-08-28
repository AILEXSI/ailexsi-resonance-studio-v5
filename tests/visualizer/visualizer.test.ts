import { describe, expect, it } from "vitest";
import { createEmptyProject, deserializeProject, serializeProject } from "../../src/core/project";
import {
  beatGrid,
  energyAt,
  featuresAt,
  nextSceneId,
  shouldShowVisualizer,
} from "../../src/core/visualizer";
import { clip, projectWith } from "../helpers";

describe("visualizer energy", () => {
  it("beatGrid 10s @120bpm has expected count", () => {
    const beats = beatGrid(10_000, 120);
    expect(beats).toHaveLength(20);
    expect(beats[0]).toBe(0);
    expect(beats[1]).toBe(500);
    expect(beats[19]).toBe(9500);
  });

  it("energyAt on a beat is ~1 and far from a beat is ~0", () => {
    const beats = beatGrid(10_000, 120);
    expect(energyAt(0, beats)).toBeCloseTo(1, 5);
    expect(energyAt(500, beats)).toBeCloseTo(1, 5);
    expect(energyAt(250, beats)).toBeCloseTo(0, 5);
    expect(energyAt(45, beats)).toBeCloseTo(0.5, 5);
  });

  it("featuresAt is synthetic from the grid", () => {
    const onBeat = featuresAt(0, 10_000);
    expect(onBeat.energy).toBeCloseTo(1, 5);
    expect(onBeat.bass).toBeCloseTo(1, 5);
    expect(onBeat.timeMs).toBe(0);
    const offBeat = featuresAt(250, 10_000);
    expect(offBeat.energy).toBeCloseTo(0, 5);
    expect(offBeat.bass).toBeCloseTo(0, 5);
  });
});

describe("visualizer fallback rules", () => {
  it("muted or disabled → shouldShowVisualizer is false", () => {
    const p = createEmptyProject("Viz");
    expect(shouldShowVisualizer(p, 0)).toBe(true);
    expect(shouldShowVisualizer({ ...p, visualizer: { ...p.visualizer, muted: true } }, 0)).toBe(false);
    expect(shouldShowVisualizer({ ...p, visualizer: { ...p.visualizer, enabled: false } }, 0)).toBe(false);
  });

  it("unmuted video under playhead → shouldShowVisualizer is false", () => {
    const p = projectWith([
      clip({ id: "v1", assetId: "a", trackId: "V1", startMs: 0, durationMs: 2000 }),
    ]);
    expect(shouldShowVisualizer(p, 100)).toBe(false);
    expect(shouldShowVisualizer(p, 3000)).toBe(true);
  });

  it("no video + enabled → shouldShowVisualizer is true", () => {
    const p = createEmptyProject("Empty");
    expect(p.visualizer.enabled).toBe(true);
    expect(p.visualizer.muted).toBe(false);
    expect(shouldShowVisualizer(p, 0)).toBe(true);
  });

  it("muted V1/V2 does not count as user video", () => {
    const p = projectWith([
      clip({ id: "v1", assetId: "a", trackId: "V1", startMs: 0, durationMs: 2000 }),
    ]);
    p.tracks = p.tracks.map((t) => (t.id === "V1" ? { ...t, muted: true } : t));
    expect(shouldShowVisualizer(p, 100)).toBe(true);
  });
});

describe("visualizer project persist", () => {
  it("loads old projects missing visualizer as the default", () => {
    const p = createEmptyProject("Legacy");
    const raw = JSON.parse(serializeProject(p)) as Record<string, unknown>;
    delete raw.visualizer;
    const loaded = deserializeProject(JSON.stringify(raw));
    expect(loaded.visualizer).toEqual({
      enabled: true,
      muted: false,
      sceneId: "spectrum-bars",
    });
  });

  it("round-trips visualizer scene and mute", () => {
    const p = createEmptyProject("Viz");
    p.visualizer = { enabled: true, muted: true, sceneId: "pulse-orb" };
    const loaded = deserializeProject(serializeProject(p));
    expect(loaded.visualizer).toEqual({
      enabled: true,
      muted: true,
      sceneId: "pulse-orb",
    });
  });

  it("nextSceneId cycles the two V5 scenes", () => {
    expect(nextSceneId("spectrum-bars")).toBe("pulse-orb");
    expect(nextSceneId("pulse-orb")).toBe("spectrum-bars");
  });
});
