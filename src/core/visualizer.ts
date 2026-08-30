import { createId } from "./ids";
import {
  FRAME_MS,
  VISUALIZER_SCENE_IDS,
  projectDurationMs,
  type Project,
  type VisualizerCue,
  type VisualizerEvent,
  type VisualizerSceneId,
  type VisualizerState,
} from "./models";
import { contextFromProject, resolvePictureSource } from "./transition";
import { getRegisteredScene } from "./visualz";
import type { AudioFeatures } from "./visualz";
import { preferLiveFeatures } from "./visualz/playback-tap";

export const DEFAULT_VIS_EVENT_MS = 4000;

export type VisEventClipboard = {
  sceneId: VisualizerSceneId;
  durationMs: number;
};

export function roundVisMs(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.round(ms);
}

export function minVisEventDurationMs(): number {
  return Math.max(1, Math.round(FRAME_MS));
}

export function visEventEndMs(event: VisualizerEvent): number {
  return event.startMs + event.durationMs;
}

export function formatVisEventLabel(event: Pick<VisualizerEvent, "sceneId" | "startMs" | "durationMs">): string {
  const start = roundVisMs(event.startMs);
  const end = roundVisMs(event.startMs + event.durationMs);
  return `${sceneShortName(event.sceneId)} ${start}–${end}ms`;
}

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
  "spectrum-bars": "Bars",
  "pulse-orb": "Orb",
  "aurora-veil": "Aurora",
  "star-bloom": "Stars",
  "liquid-gold": "Gold",
  "kaleido-hex": "Kaleido",
  "sun-core": "Sun",
  "ember-rain": "Ember",
  "particle-field": "Field",
  "resonance-wave": "Wave",
  "tunnel-spiral": "Tunnel",
  "lita-bloom": "Bloom",
  "void-lattice": "Lattice",
  "nebula-helix": "Helix",
  "accretion-disk": "Disk",
  "crystal-storm": "Crystal",
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

export type MixPcm = Pick<AudioBuffer, "sampleRate" | "length" | "numberOfChannels" | "getChannelData">;

/**
 * Feature packet from mixed export PCM (same fields preview reads from the tap).
 * Not a live AnalyserNode. Quiet / empty windows stay near 0 so the caller
 * can fall back to `featuresAt`.
 */
export function featuresFromMix(buf: MixPcm, timeMs: number): VisualizerFeatures {
  const sr = buf.sampleRate > 0 ? buf.sampleRate : 44100;
  const chans = Math.max(1, buf.numberOfChannels);
  const win = Math.min(buf.length, Math.max(64, Math.round(sr * 0.023)));
  const center = Math.round((Math.max(0, timeMs) / 1000) * sr);
  const start = Math.max(0, Math.min(Math.max(0, buf.length - win), center - Math.floor(win / 2)));
  const channels = Array.from({ length: chans }, (_, i) => buf.getChannelData(i));
  let sumSq = 0;
  let lowSq = 0;
  let highSq = 0;
  let prev = 0;
  let lp = 0;
  for (let i = 0; i < win; i++) {
    let s = 0;
    for (const ch of channels) s += ch[start + i] ?? 0;
    s /= chans;
    sumSq += s * s;
    lp = lp * 0.9 + s * 0.1;
    lowSq += lp * lp;
    const d = s - prev;
    highSq += d * d;
    prev = s;
  }
  const n = Math.max(1, win);
  const rms = clamp01(Math.sqrt(sumSq / n) * 2);
  const bass = clamp01(Math.sqrt(lowSq / n) * 2.4);
  const treble = clamp01(Math.sqrt(highSq / n) * 2);
  const mid = clamp01(rms * 0.55 + treble * 0.45);
  const energy = clamp01(rms * 0.5 + bass * 0.5);
  const onset = energy > 0.35 && bass > mid * 0.8;
  return {
    timeMs,
    energy,
    rms,
    bass,
    mid,
    high: treble,
    treble,
    spectrum: syntheticSpectrum(bass, mid, treble, timeMs, energy),
    onset,
    beatPulse: energy,
    tempoBpm: null,
  };
}

/** Preview=export: prefer mix energy, else the 120 BPM grid. */
export function visFeaturesForExport(
  timeMs: number,
  durationMs: number,
  mix?: MixPcm | null,
  opts?: { timelineOriginMs?: number },
): VisualizerFeatures {
  const origin = opts?.timelineOriginMs ?? 0;
  const fallback = featuresAt(origin + timeMs, origin + durationMs);
  if (!mix || mix.length < 8) return fallback;
  return preferLiveFeatures(featuresFromMix(mix, timeMs), fallback) as VisualizerFeatures;
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

export function cuesOf(vis: VisualizerState | Project): VisualizerCue[] {
  const state = "visualizer" in vis ? vis.visualizer : vis;
  return [...(state.cues ?? [])].sort((a, b) => a.startMs - b.startMs);
}

function lastCueAt(vis: VisualizerState | Project, timeMs: number): VisualizerCue | undefined {
  let hit: VisualizerCue | undefined;
  for (const cue of cuesOf(vis)) {
    if (cue.startMs <= timeMs) hit = cue;
    else break;
  }
  return hit;
}

function upsertCueList(cues: VisualizerCue[], startMs: number, sceneId: VisualizerSceneId): VisualizerCue[] {
  const t = Math.max(0, roundVisMs(startMs));
  const next = cues.filter((c) => c.startMs !== t);
  next.push({ startMs: t, sceneId });
  next.sort((a, b) => a.startMs - b.startMs);
  return next;
}

function visCueSpanMs(project: Project, cues: VisualizerCue[]): number {
  const lastCue = cues[cues.length - 1];
  const lastEventEnd = Math.max(
    0,
    ...visualizerEventsOf(project).map((e) => e.startMs + Math.max(0, e.durationMs)),
  );
  const windowEnd =
    (project.visualizer.durationMs ?? 0) > 0
      ? (project.visualizer.startMs ?? 0) + (project.visualizer.durationMs ?? 0)
      : 0;
  return Math.max(
    DEFAULT_VIS_EVENT_MS,
    10_000,
    projectDurationMs(project),
    windowEnd,
    lastEventEnd,
    lastCue ? lastCue.startMs + DEFAULT_VIS_EVENT_MS : 0,
  );
}

/** Rematerialize abutting VIS events from cues so export's existing event hook paints. */
export function rematerializeEventsFromCues(project: Project, cues: VisualizerCue[]): VisualizerEvent[] {
  const unique: VisualizerCue[] = [];
  for (const cue of [...cues].sort((a, b) => a.startMs - b.startMs)) {
    const last = unique[unique.length - 1];
    if (last && last.startMs === cue.startMs) unique[unique.length - 1] = cue;
    else unique.push(cue);
  }
  if (unique.length === 0) return visualizerEventsOf(project);
  const span = visCueSpanMs(project, unique);
  const existing = visualizerEventsOf(project);
  return unique.map((cue, i) => {
    const next = unique[i + 1];
    const end = next ? next.startMs : span;
    const durationMs = Math.max(1, roundVisMs(end - cue.startMs));
    const reuse = existing.find((e) => e.startMs === cue.startMs && e.sceneId === cue.sceneId);
    return {
      id: reuse?.id ?? createId("ve"),
      sceneId: cue.sceneId,
      startMs: cue.startMs,
      durationMs,
    };
  });
}

/**
 * Covering event, else last cue with startMs <= t, else sceneId when the window covers.
 * Preview and tests use this; export reads rematerialized events[] via the same compositor.
 */
export function sceneAt(
  vis: VisualizerState | Project,
  timeMs: number,
): VisualizerSceneId | undefined {
  const state = "visualizer" in vis ? vis.visualizer : vis;
  const covering = visualizerEventAt(state, timeMs);
  if (covering) return covering.sceneId;
  const cue = lastCueAt(state, timeMs);
  if (cue) {
    if (visualizerEventsOf(state).length > 0) return undefined;
    if (!visWindowCovers(state, timeMs)) return undefined;
    return cue.sceneId;
  }
  if (visualizerEventsOf(state).length > 0) return undefined;
  if (!visWindowCovers(state, timeMs)) return undefined;
  return state.sceneId;
}

export const sceneIdAt = sceneAt;

/** Event / cue / window scene at t. */
export function visualizerSceneAt(
  vis: VisualizerState | Project,
  timeMs: number,
): VisualizerSceneId | undefined {
  return sceneAt(vis, timeMs);
}

export function insertCueAtPlayhead(
  project: Project,
  timeMs: number,
): { project: Project; event?: VisualizerEvent } {
  const t = Math.max(0, roundVisMs(timeMs));
  const hadCues = cuesOf(project).length > 0;
  const hadEvents = visualizerEventsOf(project).length > 0;
  const stamp = new Date().toISOString();

  if (t === 0) {
    const nextId = nextSceneId(project.visualizer.sceneId);
    const nextCues = upsertCueList(cuesOf(project), 0, nextId);
    const shouldRemat = !hadEvents || hadCues;
    const events = shouldRemat ? rematerializeEventsFromCues(project, nextCues) : visualizerEventsOf(project);
    const nextProject: Project = {
      ...project,
      visualizer: {
        ...project.visualizer,
        sceneId: nextId,
        cues: nextCues,
        events,
      },
      updatedAt: stamp,
    };
    return {
      project: nextProject,
      event: shouldRemat ? events.find((e) => e.startMs === 0) : undefined,
    };
  }

  let nextCues = cuesOf(project);
  if (!nextCues.some((c) => c.startMs === 0)) {
    nextCues = [{ startMs: 0, sceneId: project.visualizer.sceneId }, ...nextCues];
  }
  const left = sceneAt({ ...project.visualizer, cues: nextCues }, Math.max(0, t - 1)) ?? project.visualizer.sceneId;
  const right = nextSceneId(left);
  nextCues = upsertCueList(nextCues, t, right);
  const events = rematerializeEventsFromCues({ ...project, visualizer: { ...project.visualizer, cues: nextCues } }, nextCues);
  const nextProject: Project = {
    ...project,
    visualizer: {
      ...project.visualizer,
      sceneId: right,
      cues: nextCues,
      events,
    },
    updatedAt: stamp,
  };
  return {
    project: nextProject,
    event: events.find((e) => e.startMs === t),
  };
}

/**
 * VIS overlay: an event covering t shows even when video exists.
 * Empty events keep the legacy gap-fill (window + no unmuted V1/V2).
 */
export function shouldShowVisualizer(project: Project, timeMs: number): boolean {
  return resolvePictureSource(contextFromProject(project), timeMs).kind === "vis";
}

export function setVisualizer(
  project: Project,
  patch: Partial<Pick<VisualizerState, "sceneId" | "startMs" | "durationMs" | "enabled" | "muted">>,
): Project {
  const startMs = Math.max(0, roundVisMs(patch.startMs ?? project.visualizer.startMs ?? 0));
  const durationMs = Math.max(0, roundVisMs(patch.durationMs ?? project.visualizer.durationMs ?? 0));
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
  inserted: boolean;
} {
  const t = Math.max(0, roundVisMs(timeMs));
  const covering = visualizerEventAt(project, t);
  if (covering) return { project, event: covering, inserted: false };
  const existing = [...visualizerEventsOf(project)].sort((a, b) => a.startMs - b.startMs);
  const next = existing.find((e) => e.startMs > t);
  const rawDur = next ? next.startMs - t : DEFAULT_VIS_EVENT_MS;
  const durationMs = Math.max(1, roundVisMs(rawDur));
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
    inserted: true,
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
    startMs: Math.max(0, roundVisMs(patch.startMs ?? current.startMs)),
    durationMs: Math.max(1, roundVisMs(patch.durationMs ?? current.durationMs)),
  };
  if (
    next.sceneId === current.sceneId &&
    next.startMs === current.startMs &&
    next.durationMs === current.durationMs
  ) {
    return project;
  }
  const copy = [...events];
  copy[index] = next;
  return {
    ...project,
    visualizer: { ...project.visualizer, events: copy },
    updatedAt: new Date().toISOString(),
  };
}

export function moveVisualizerEvent(project: Project, eventId: string, startMs: number): Project {
  const event = visualizerEventsOf(project).find((e) => e.id === eventId);
  if (!event) return project;
  return updateVisualizerEvent(project, eventId, {
    startMs,
    durationMs: event.durationMs,
  });
}

export function stretchVisualizerEvent(
  project: Project,
  eventId: string,
  edge: "in" | "out",
  nextEdgeMs: number,
): Project {
  const event = visualizerEventsOf(project).find((e) => e.id === eventId);
  if (!event) return project;
  const min = minVisEventDurationMs();
  const end = visEventEndMs(event);
  if (edge === "in") {
    let start = Math.max(0, roundVisMs(nextEdgeMs));
    if (end - start < min) start = Math.max(0, roundVisMs(end - min));
    return updateVisualizerEvent(project, eventId, {
      startMs: start,
      durationMs: Math.max(min, end - start),
    });
  }
  let out = Math.max(0, roundVisMs(nextEdgeMs));
  const start = Math.max(0, roundVisMs(event.startMs));
  if (out - start < min) out = start + min;
  return updateVisualizerEvent(project, eventId, { startMs: start, durationMs: Math.max(min, out - start) });
}

export function deleteVisualizerEvent(project: Project, eventId: string): Project {
  const events = visualizerEventsOf(project);
  if (!events.some((e) => e.id === eventId)) return project;
  return {
    ...project,
    visualizer: {
      ...project.visualizer,
      events: events.filter((e) => e.id !== eventId),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function visEventClipboardOf(event: VisualizerEvent): VisEventClipboard {
  return { sceneId: event.sceneId, durationMs: Math.max(1, roundVisMs(event.durationMs)) };
}

export function pasteVisualizerEvent(
  project: Project,
  snap: VisEventClipboard,
  timeMs: number,
): { project: Project; event: VisualizerEvent } {
  const event: VisualizerEvent = {
    id: createId("ve"),
    sceneId: snap.sceneId,
    startMs: Math.max(0, roundVisMs(timeMs)),
    durationMs: Math.max(minVisEventDurationMs(), roundVisMs(snap.durationMs)),
  };
  return {
    project: {
      ...project,
      visualizer: {
        ...project.visualizer,
        events: [...visualizerEventsOf(project), event],
      },
      updatedAt: new Date().toISOString(),
    },
    event,
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
