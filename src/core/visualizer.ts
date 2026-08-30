import {
  topVideoClipAt,
  VISUALIZER_SCENE_IDS,
  type Project,
  type VisualizerSceneId,
} from "./models";
import { getRegisteredScene } from "./visualz";
import type { AudioFeatures } from "./visualz";

export const BEAT_WINDOW_MS = 90;
export const DEFAULT_VISUALIZER_BPM = 120;

/**
 * Host feature packet. Extends Visualz AudioFeatures.
 * `energy` / `high` stay as aliases so existing V5 tests keep reading the 120 BPM grid.
 */
export interface VisualizerFeatures extends AudioFeatures {
  energy: number;
  high: number;
}

const SCENE_SHORT: Record<VisualizerSceneId, string> = {
  "pulse-orb": "Orb",
  "spectrum-bars": "Bars",
  "particle-field": "Field",
  "resonance-wave": "Wave",
  "tunnel-spiral": "Tunnel",
  "lita-bloom": "Bloom",
};

/** 120 BPM grid (or `bpm`) from 0 inclusive to duration exclusive. */
export function beatGrid(durationMs: number, bpm = DEFAULT_VISUALIZER_BPM): number[] {
  if (durationMs <= 0 || bpm <= 0) return [];
  const interval = 60_000 / bpm;
  const beats: number[] = [];
  for (let t = 0; t < durationMs; t += interval) beats.push(t);
  return beats;
}

/** 0..1 pulse: 1 on a beat, 0 when the nearest beat is >= 90ms away. */
export function energyAt(timeMs: number, beatsMs: number[]): number {
  if (beatsMs.length === 0) return 0;
  let nearest = Infinity;
  for (const beat of beatsMs) {
    const dist = Math.abs(timeMs - beat);
    if (dist < nearest) nearest = dist;
  }
  if (nearest >= BEAT_WINDOW_MS) return 0;
  return 1 - nearest / BEAT_WINDOW_MS;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * SYNTHETIC fallback AudioFeatures from a 120 BPM beat grid (and its 2× hats).
 * This is not an FFT of A1/A2. Preview prefers a live AnalyserNode tap when
 * playback audio is present; export and tests always use this grid so scenes
 * still animate without Web Audio.
 */
export function featuresAt(timeMs: number, durationMs: number): VisualizerFeatures {
  const span = Math.max(0, durationMs);
  const beats = beatGrid(span);
  const energy = energyAt(timeMs, beats);
  const eighths = beatGrid(span, DEFAULT_VISUALIZER_BPM * 2);
  const hats = energyAt(timeMs, eighths);
  const bass = energy;
  const mid = clamp01(energy * 0.55 + hats * 0.45);
  const high = clamp01(hats * (0.35 + 0.65 * (1 - energy)));
  const spectrum = syntheticSpectrum(bass, mid, high, timeMs, energy);
  const onset = energy > 0.92;
  return {
    timeMs,
    energy,
    rms: energy,
    bass,
    mid,
    high,
    treble: high,
    spectrum,
    onset,
    beatPulse: energy,
    tempoBpm: DEFAULT_VISUALIZER_BPM,
  };
}

/** Fake 64-bin spectrum so Visualz scenes that read `spectrum` still move. */
function syntheticSpectrum(
  bass: number,
  mid: number,
  high: number,
  timeMs: number,
  energy: number,
): Float32Array {
  const bins = 64;
  const spec = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    const t = i / (bins - 1);
    const band = t < 1 / 3 ? bass : t < 2 / 3 ? mid : high;
    const wobble = 0.12 * Math.abs(Math.sin(timeMs / 130 + i * 0.45));
    spec[i] = clamp01(band * 0.88 + wobble * energy);
  }
  return spec;
}

export function nextSceneId(current: VisualizerSceneId): VisualizerSceneId {
  const i = VISUALIZER_SCENE_IDS.indexOf(current);
  const idx = i < 0 ? 0 : (i + 1) % VISUALIZER_SCENE_IDS.length;
  return VISUALIZER_SCENE_IDS[idx]!;
}

export function sceneShortName(sceneId: VisualizerSceneId): string {
  return SCENE_SHORT[sceneId] ?? sceneId;
}

/** Main Output fallback: visualizer only when no unmuted V1/V2 clip is under the playhead. */
export function shouldShowVisualizer(project: Project, timeMs: number): boolean {
  if (!project.visualizer.enabled || project.visualizer.muted) return false;
  if (topVideoClipAt(project, timeMs)) return false;
  return true;
}

export function toggleVisualizerMute(project: Project): Project {
  return {
    ...project,
    visualizer: { ...project.visualizer, muted: !project.visualizer.muted },
    updatedAt: new Date().toISOString(),
  };
}

export function cycleVisualizerScene(project: Project): Project {
  return {
    ...project,
    visualizer: {
      ...project.visualizer,
      sceneId: nextSceneId(project.visualizer.sceneId),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function renderVisualizerScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sceneId: VisualizerSceneId,
  features: AudioFeatures,
  dt: number,
): void {
  if (w <= 0 || h <= 0) return;
  const scene = getRegisteredScene(sceneId);
  if (!scene) return;
  const params = scene.defaultParams;
  ctx.fillStyle = (params.colorSecondary as string) || "#0a0a12";
  ctx.fillRect(0, 0, w, h);
  scene.render({ width: w, height: h, ctx }, features, params, dt);
}
