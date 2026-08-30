import { createId } from "./ids";
import {
  topVideoClipAt,
  VISUALIZER_SCENE_IDS,
  type Project,
  type VisualizerEvent,
  type VisualizerSceneId,
  type VisualizerState,
} from "./models";
import { getRegisteredScene } from "./visualz";
import type { AudioFeatures } from "./visualz";

export const DEFAULT_VIS_EVENT_MS = 4000;

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

/** durationMs <= 0 means the overlay covers the whole timeline (legacy). */
export function visWindowCovers(
  vis: { startMs?: number; durationMs?: number },
  timeMs: number,
): boolean {
  const dur = vis.durationMs ?? 0;
  if (dur <= 0) return true;
  const start = vis.startMs ?? 0;
  return timeMs >= start && timeMs < start + dur;
}

export function visualizerEventsOf(vis: VisualizerState | Project): VisualizerEvent[] {
  const state = "visualizer" in vis ? vis.visualizer : vis;
  return state.events ?? [];
}

export function visualizerEventCovers(event: VisualizerEvent, timeMs: number): boolean {
  return timeMs >= event.startMs && timeMs < event.startMs + Math.max(0, event.durationMs);
}

export function visualizerEventAt(
  vis: VisualizerState | Project,
  timeMs: number,
): VisualizerEvent | undefined {
  return visualizerEventsOf(vis).find((event) => visualizerEventCovers(event, timeMs));
}

/** Event scene at t, else fallback sceneId when events are empty and the window covers. */
export function visualizerSceneAt(
  vis: VisualizerState | Project,
  timeMs: number,
): VisualizerSceneId | undefined {
  const state = "visualizer" in vis ? vis.visualizer : vis;
  const covering = visualizerEventAt(state, timeMs);
  if (covering) return covering.sceneId;
  if (visualizerEventsOf(state).length > 0) return undefined;
  if (!visWindowCovers(state, timeMs)) return undefined;
  return state.sceneId;
}

/**
 * VIS overlay: an event covering t shows even when video exists.
 * Empty events keep the legacy gap-fill (window + no unmuted V1/V2).
 */
export function shouldShowVisualizer(project: Project, timeMs: number): boolean {
  if (!project.visualizer.enabled || project.visualizer.muted) return false;
  if (visualizerEventAt(project, timeMs)) return true;
  if (visualizerEventsOf(project).length > 0) return false;
  if (!visWindowCovers(project.visualizer, timeMs)) return false;
  if (topVideoClipAt(project, timeMs)) return false;
  return true;
}

export function setVisualizer(
  project: Project,
  patch: Partial<Pick<VisualizerState, "sceneId" | "startMs" | "durationMs" | "enabled" | "muted">>,
): Project {
  const startMs = Math.max(0, patch.startMs ?? project.visualizer.startMs ?? 0);
  const durationMs = Math.max(0, patch.durationMs ?? project.visualizer.durationMs ?? 0);
  return {
    ...project,
    visualizer: {
      ...project.visualizer,
      ...patch,
      startMs,
      durationMs,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function toggleVisualizerMute(project: Project): Project {
  return {
    ...project,
    visualizer: { ...project.visualizer, muted: !project.visualizer.muted },
    updatedAt: new Date().toISOString(),
  };
}

export function cycleVisualizerScene(project: Project, eventId?: string | null): Project {
  if (eventId) {
    const event = visualizerEventsOf(project).find((e) => e.id === eventId);
    if (event) {
      return updateVisualizerEvent(project, eventId, { sceneId: nextSceneId(event.sceneId) });
    }
  }
  return {
    ...project,
    visualizer: {
      ...project.visualizer,
      sceneId: nextSceneId(project.visualizer.sceneId),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function insertVisualizerEvent(project: Project, timeMs: number): {
  project: Project;
  event: VisualizerEvent;
} {
  const t = Math.max(0, timeMs);
  const existing = [...visualizerEventsOf(project)].sort((a, b) => a.startMs - b.startMs);
  const next = existing.find((e) => e.startMs > t);
  const durationMs = next ? Math.max(1, next.startMs - t) : DEFAULT_VIS_EVENT_MS;
  const event: VisualizerEvent = {
    id: createId("ve"),
    sceneId: project.visualizer.sceneId,
    startMs: t,
    durationMs,
  };
  return {
    project: {
      ...project,
      visualizer: {
        ...project.visualizer,
        events: [...existing, event],
      },
      updatedAt: new Date().toISOString(),
    },
    event,
  };
}

export function updateVisualizerEvent(
  project: Project,
  eventId: string,
  patch: Partial<Pick<VisualizerEvent, "sceneId" | "startMs" | "durationMs">>,
): Project {
  const events = visualizerEventsOf(project);
  const index = events.findIndex((e) => e.id === eventId);
  if (index < 0) return project;
  const current = events[index]!;
  const next: VisualizerEvent = {
    ...current,
    sceneId: patch.sceneId ?? current.sceneId,
    startMs: Math.max(0, patch.startMs ?? current.startMs),
    durationMs: Math.max(0, patch.durationMs ?? current.durationMs),
  };
  const copy = [...events];
  copy[index] = next;
  return {
    ...project,
    visualizer: { ...project.visualizer, events: copy },
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
