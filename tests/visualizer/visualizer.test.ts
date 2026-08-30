import { describe, expect, it } from "vitest";
import {
  DEFAULT_VISUALIZER_SCENE_ID,
  VISUALIZER_SCENE_IDS,
  isVisualizerSceneId,
  type VisualizerSceneId,
} from "../../src/core/models";
import { createEmptyProject, deserializeProject, serializeProject } from "../../src/core/project";
import {
  beatGrid,
  energyAt,
  featuresAt,
  nextSceneId,
  renderVisualizerScene,
  shouldShowVisualizer,
} from "../../src/core/visualizer";
import { builtinScenes, createVisualEngine, getRegisteredScene } from "../../src/core/visualz";
import { preferLiveFeatures } from "../../src/core/visualz/playback-tap";
import type { AudioFeatures } from "../../src/core/visualz";
import { clip, projectWith } from "../helpers";
import { createPixelCanvas } from "../helpers/pixel-canvas";

function stubCtx(): CanvasRenderingContext2D {
  const noop = () => undefined;
  const gradient = { addColorStop: noop };
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    quadraticCurveTo: noop,
    fillText: noop,
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
  } as unknown as CanvasRenderingContext2D;
}

function stubCanvas(): HTMLCanvasElement {
  const ctx = stubCtx();
  return {
    width: 320,
    height: 180,
    getContext: (id: string) => (id === "2d" ? ctx : null),
    toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(["x"], { type: "image/png" })),
  } as unknown as HTMLCanvasElement;
}

const QUIET: AudioFeatures = {
  timeMs: 0,
  rms: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  spectrum: new Float32Array(8),
  onset: false,
  beatPulse: 0,
};

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

  it("featuresAt is a synthetic 120 BPM AudioFeatures fallback (not file FFT)", () => {
    const onBeat = featuresAt(0, 10_000);
    expect(onBeat.energy).toBeCloseTo(1, 5);
    expect(onBeat.rms).toBeCloseTo(1, 5);
    expect(onBeat.bass).toBeCloseTo(1, 5);
    expect(onBeat.treble).toBe(onBeat.high);
    expect(onBeat.timeMs).toBe(0);
    expect(onBeat.spectrum).toHaveLength(64);
    expect(onBeat.onset).toBe(true);
    expect(onBeat.beatPulse).toBeCloseTo(1, 5);
    const offBeat = featuresAt(250, 10_000);
    expect(offBeat.energy).toBeCloseTo(0, 5);
    expect(offBeat.bass).toBeCloseTo(0, 5);
    expect(offBeat.onset).toBe(false);
    // 250ms is a 240 BPM hat: treble/mid still feed the fake spectrum so bars move.
    expect(offBeat.treble).toBeGreaterThan(0);
    expect(offBeat.spectrum.some((v) => v > 0)).toBe(true);
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

  it("VIS from-to window hides the overlay outside the span", () => {
    const p = createEmptyProject("Window");
    p.visualizer = { ...p.visualizer, startMs: 1000, durationMs: 500 };
    expect(shouldShowVisualizer(p, 999)).toBe(false);
    expect(shouldShowVisualizer(p, 1000)).toBe(true);
    expect(shouldShowVisualizer(p, 1499)).toBe(true);
    expect(shouldShowVisualizer(p, 1500)).toBe(false);
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
      sceneId: DEFAULT_VISUALIZER_SCENE_ID,
      startMs: 0,
      durationMs: 0,
      events: [],
    });
    expect(loaded.visualizer.sceneId).toBe("resonance-wave");
  });

  it("round-trips visualizer scene and mute", () => {
    const p = createEmptyProject("Viz");
    p.visualizer = { enabled: true, muted: true, sceneId: "pulse-orb" };
    const loaded = deserializeProject(serializeProject(p));
    expect(loaded.visualizer).toEqual({
      enabled: true,
      muted: true,
      sceneId: "pulse-orb",
      startMs: 0,
      durationMs: 0,
      events: [],
    });
  });

  it("round-trips every Visualz scene id", () => {
    for (const sceneId of VISUALIZER_SCENE_IDS) {
      const p = createEmptyProject("Viz");
      p.visualizer = { enabled: true, muted: false, sceneId };
      expect(deserializeProject(serializeProject(p)).visualizer.sceneId).toBe(sceneId);
    }
  });
});

describe("Visualz scene registry", () => {
  it("registers all 6 Visualz ids and isVisualizerSceneId accepts each", () => {
    expect(VISUALIZER_SCENE_IDS).toEqual([
      "pulse-orb",
      "spectrum-bars",
      "particle-field",
      "resonance-wave",
      "tunnel-spiral",
      "lita-bloom",
    ]);
    expect(new Set(VISUALIZER_SCENE_IDS).size).toBe(6);
    expect(builtinScenes.map((s) => s.id)).toEqual([...VISUALIZER_SCENE_IDS]);
    for (const id of VISUALIZER_SCENE_IDS) {
      expect(isVisualizerSceneId(id)).toBe(true);
      expect(getRegisteredScene(id)?.id).toBe(id);
    }
    expect(isVisualizerSceneId("milkdrop")).toBe(false);
    expect(isVisualizerSceneId("")).toBe(false);
  });

  it("nextSceneId cycles all 6 without repeats until wrap", () => {
    const seen: string[] = [];
    let current: VisualizerSceneId = VISUALIZER_SCENE_IDS[0]!;
    for (let i = 0; i < VISUALIZER_SCENE_IDS.length; i++) {
      expect(seen).not.toContain(current);
      seen.push(current);
      current = nextSceneId(current);
    }
    expect(seen).toEqual([...VISUALIZER_SCENE_IDS]);
    expect(current).toBe(VISUALIZER_SCENE_IDS[0]);
    expect(nextSceneId("lita-bloom")).toBe("pulse-orb");
  });

  it("each Visualz scene paints non-empty pixels and the six frames differ", () => {
    const features = featuresAt(0, 10_000);
    const prints = new Map<string, string>();
    for (const id of VISUALIZER_SCENE_IDS) {
      const buf = createPixelCanvas(96, 54);
      renderVisualizerScene(buf.ctx, 96, 54, id, features, 1 / 30);
      const painted = buf.nonemptyCount();
      expect(painted, `${id} painted ${painted} pixels`).toBeGreaterThan(20);
      prints.set(id, buf.fingerprint());
    }
    const unique = new Set(prints.values());
    expect(unique.size, `fingerprints ${JSON.stringify(Object.fromEntries(prints))}`).toBe(6);
  });

  it("each scene render function can be called without throwing", () => {
    const ctx = stubCtx();
    const features = featuresAt(0, 10_000);
    for (const scene of builtinScenes) {
      expect(() => {
        scene.onEnter?.({ width: 320, height: 180, ctx }, scene.defaultParams);
        scene.render({ width: 320, height: 180, ctx }, features, scene.defaultParams, 1 / 30);
        scene.onExit?.();
      }).not.toThrow();
      expect(() => {
        renderVisualizerScene(ctx, 320, 180, scene.id as (typeof VISUALIZER_SCENE_IDS)[number], features, 1 / 30);
      }).not.toThrow();
    }
  });

  it("createVisualEngine lists the 6 builtins and setScene switches", () => {
    const engine = createVisualEngine({ canvas: stubCanvas(), initialSceneId: "resonance-wave" });
    const ids = engine.listScenes().map((s) => s.id);
    expect(ids).toEqual([...VISUALIZER_SCENE_IDS]);
    expect(engine.getState().currentSceneId).toBe("resonance-wave");
    engine.setScene("tunnel-spiral");
    expect(engine.getState().currentSceneId).toBe("tunnel-spiral");
    engine.setFeatures(featuresAt(0, 1000));
    engine.destroy();
  });
});

describe("live vs synthetic feature prefer", () => {
  it("keeps the synthetic fallback when the analyser is quiet", () => {
    const fallback = featuresAt(0, 10_000);
    expect(preferLiveFeatures(null, fallback)).toBe(fallback);
    expect(preferLiveFeatures(QUIET, fallback)).toBe(fallback);
  });

  it("uses live analyser features when they have energy", () => {
    const fallback = featuresAt(250, 10_000);
    const live: AudioFeatures = { ...QUIET, rms: 0.4, bass: 0.3 };
    expect(preferLiveFeatures(live, fallback)).toBe(live);
  });
});
