import { createId } from "./ids";
import { livingLinkedMate } from "./link";
import {
  TRACK_IDS,
  clipById,
  clipEndMs,
  kindOfTrack,
  type Clip,
  type FrontVideoTrackId,
  type Project,
  type TrackId,
} from "./models";

export const TRANSITION_TYPES = ["cut", "crossfade", "fadeBlack", "fadeWhite"] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];

export const TRANSITION_AUDIO_MODES = ["cut", "crossfade", "keepA", "keepB"] as const;
export type TransitionAudioMode = (typeof TRANSITION_AUDIO_MODES)[number];

export interface Transition {
  id: string;
  type: TransitionType;
  startMs: number;
  durationMs: number;
  sourceAClipId: string;
  sourceBClipId: string;
  audioMode: TransitionAudioMode;
  audioDurationMs: number;
}

export interface EditPair {
  sourceA: Clip;
  sourceB: Clip;
  overlapStartMs: number;
  overlapDurationMs: number;
}

export interface CompositeLayer {
  clipId: string;
  alpha: number;
}

export interface VideoComposite {
  layers: CompositeLayer[];
  plate?: { color: "#000000" | "#ffffff"; alpha: number };
}

export interface CompositeClip {
  id: string;
  trackId: TrackId;
  startMs: number;
  endMs: number;
}

export interface CompositeContext {
  clips: CompositeClip[];
  transitions: Transition[];
  /** Which video track covers on overlap / cut. Default V2. */
  frontVideoTrackId?: FrontVideoTrackId;
}

export function isTransitionType(value: unknown): value is TransitionType {
  return typeof value === "string" && (TRANSITION_TYPES as readonly string[]).includes(value);
}

export function isTransitionAudioMode(value: unknown): value is TransitionAudioMode {
  return typeof value === "string" && (TRANSITION_AUDIO_MODES as readonly string[]).includes(value);
}

export function clipsOverlapMs(a: { startMs: number; durationMs?: number; endMs?: number }, b: {
  startMs: number;
  durationMs?: number;
  endMs?: number;
}): { startMs: number; durationMs: number } | undefined {
  const aEnd = a.endMs ?? a.startMs + (a.durationMs ?? 0);
  const bEnd = b.endMs ?? b.startMs + (b.durationMs ?? 0);
  const start = Math.max(a.startMs, b.startMs);
  const end = Math.min(aEnd, bEnd);
  if (end <= start) return undefined;
  return { startMs: start, durationMs: end - start };
}

/** Outgoing A ends first; tie uses lower→higher TRACK_IDS order. Any two video tracks. */
export function orderOutgoingIncoming(x: Clip, y: Clip): { sourceA: Clip; sourceB: Clip } {
  const endX = clipEndMs(x);
  const endY = clipEndMs(y);
  if (endX < endY) return { sourceA: x, sourceB: y };
  if (endY < endX) return { sourceA: y, sourceB: x };
  const ix = TRACK_IDS.indexOf(x.trackId);
  const iy = TRACK_IDS.indexOf(y.trackId);
  return ix <= iy ? { sourceA: x, sourceB: y } : { sourceA: y, sourceB: x };
}

/**
 * Selected clip(s) → overlapping pair on two video tracks.
 * One selected video clip looks for an overlapping video clip on another track.
 * V1→V2 and V2↑V1 both resolve to the same outgoing/incoming order.
 */
export function resolveEditPair(
  project: Project,
  selectedIds: readonly string[],
): EditPair | undefined {
  const selected = selectedIds
    .map((id) => clipById(project, id))
    .filter((c): c is Clip => c != null)
    .filter((c) => kindOfTrack(c.trackId) === "video");

  const tryPair = (x: Clip, y: Clip): EditPair | undefined => {
    if (x.trackId === y.trackId) return undefined;
    if (kindOfTrack(y.trackId) !== "video") return undefined;
    const overlap = clipsOverlapMs(x, y);
    if (!overlap) return undefined;
    const ordered = orderOutgoingIncoming(x, y);
    return { ...ordered, overlapStartMs: overlap.startMs, overlapDurationMs: overlap.durationMs };
  };

  if (selected.length >= 2) {
    for (let i = 0; i < selected.length; i++) {
      for (let j = i + 1; j < selected.length; j++) {
        const pair = tryPair(selected[i]!, selected[j]!);
        if (pair) return pair;
      }
    }
    return undefined;
  }

  if (selected.length === 1) {
    const one = selected[0]!;
    for (const other of project.clips) {
      if (other.id === one.id) continue;
      if (kindOfTrack(other.trackId) !== "video") continue;
      const pair = tryPair(one, other);
      if (pair) return pair;
    }
  }
  return undefined;
}

export interface StackedOverlapMark {
  sourceA: Clip;
  sourceB: Clip;
  overlapStartMs: number;
  overlapDurationMs: number;
  type: TransitionType;
  durationMs: number;
}

/** Every stacked video overlap (any two video tracks). Implicit = cut. */
export function listStackedEditPairs(project: Project): StackedOverlapMark[] {
  const videos = project.clips.filter((c) => kindOfTrack(c.trackId) === "video");
  const out: StackedOverlapMark[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < videos.length; i++) {
    for (let j = i + 1; j < videos.length; j++) {
      const x = videos[i]!;
      const y = videos[j]!;
      if (x.trackId === y.trackId) continue;
      const overlap = clipsOverlapMs(x, y);
      if (!overlap) continue;
      const { sourceA, sourceB } = orderOutgoingIncoming(x, y);
      const key = `${sourceA.id}\0${sourceB.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const stored = findTransitionForPair(project.transitions ?? [], sourceA.id, sourceB.id);
      out.push({
        sourceA,
        sourceB,
        overlapStartMs: overlap.startMs,
        overlapDurationMs: overlap.durationMs,
        type: stored?.type ?? "cut",
        durationMs: stored?.durationMs ?? Math.max(1, overlap.durationMs),
      });
    }
  }
  return out;
}

export function findTransitionForPair(
  transitions: readonly Transition[],
  sourceAClipId: string,
  sourceBClipId: string,
): Transition | undefined {
  return transitions.find(
    (t) => t.sourceAClipId === sourceAClipId && t.sourceBClipId === sourceBClipId,
  );
}

export function transitionCovers(t: Transition, timeMs: number): boolean {
  return timeMs >= t.startMs && timeMs < t.startMs + Math.max(0, t.durationMs);
}

export function transitionAt(transitions: readonly Transition[], timeMs: number): Transition | undefined {
  return transitions.find((t) => transitionCovers(t, timeMs));
}

export function topVideoClipId(
  clips: readonly CompositeClip[],
  timeMs: number,
  front: FrontVideoTrackId = "V2",
): string | undefined {
  const hits = clips.filter(
    (c) =>
      kindOfTrack(c.trackId) === "video" &&
      timeMs >= c.startMs &&
      timeMs < c.endMs,
  );
  if (hits.length === 0) return undefined;
  const preferred = hits.find((c) => c.trackId === front);
  if (preferred) return preferred.id;
  hits.sort((a, b) => TRACK_IDS.indexOf(b.trackId) - TRACK_IDS.indexOf(a.trackId));
  return hits[0]!.id;
}

/**
 * Shared preview/export compositor. Transition types at t in the window;
 * outside the window, existing stack order (later video track on top).
 */
export function compositeVideoAt(ctx: CompositeContext, timeMs: number): VideoComposite {
  const front = ctx.frontVideoTrackId === "V1" ? "V1" : "V2";
  const t = transitionAt(ctx.transitions, timeMs);
  if (!t || t.durationMs <= 0) {
    const id = topVideoClipId(ctx.clips, timeMs, front);
    return id ? { layers: [{ clipId: id, alpha: 1 }] } : { layers: [] };
  }
  const u = Math.max(0, Math.min(1, (timeMs - t.startMs) / t.durationMs));
  if (t.type === "cut") {
    const covering = topVideoClipId(ctx.clips, timeMs, front) ?? t.sourceBClipId;
    return { layers: [{ clipId: covering, alpha: 1 }] };
  }
  if (t.type === "crossfade") {
    return {
      layers: [
        { clipId: t.sourceAClipId, alpha: 1 - u },
        { clipId: t.sourceBClipId, alpha: u },
      ],
    };
  }
  const plateColor = t.type === "fadeWhite" ? "#ffffff" : "#000000";
  if (u < 0.5) {
    const p = u * 2;
    return {
      layers: [{ clipId: t.sourceAClipId, alpha: 1 - p }],
      plate: { color: plateColor, alpha: p },
    };
  }
  const p = (u - 0.5) * 2;
  return {
    layers: [{ clipId: t.sourceBClipId, alpha: p }],
    plate: { color: plateColor, alpha: 1 - p },
  };
}

export function contextFromProject(project: Project): CompositeContext {
  return {
    clips: project.clips.map((c) => ({
      id: c.id,
      trackId: c.trackId,
      startMs: c.startMs,
      endMs: clipEndMs(c),
    })),
    transitions: project.transitions ?? [],
    frontVideoTrackId: project.frontVideoTrackId === "V1" ? "V1" : "V2",
  };
}

export function contextFromExportClips(
  clips: readonly { id: string; trackId: TrackId; startMs: number; endMs: number }[],
  transitions: readonly Transition[] = [],
  frontVideoTrackId: FrontVideoTrackId = "V2",
): CompositeContext {
  return {
    clips: clips.map((c) => ({ ...c })),
    transitions: [...transitions],
    frontVideoTrackId: frontVideoTrackId === "V1" ? "V1" : "V2",
  };
}

export function primaryLayer(composite: VideoComposite): CompositeLayer | undefined {
  if (composite.layers.length === 0) return undefined;
  return [...composite.layers].sort((a, b) => b.alpha - a.alpha)[0];
}

export function layerAlpha(composite: VideoComposite, clipId: string): number {
  return composite.layers.find((l) => l.clipId === clipId)?.alpha ?? 0;
}

/** Extra mix multiplier over a clip span. Does not write clip fades. */
export function scheduleTransitionAudioGain(
  param: {
    setValueAtTime(value: number, time: number): unknown;
    linearRampToValueAtTime(value: number, time: number): unknown;
  },
  transitions: readonly Transition[],
  clipId: string,
  clipStartMs: number,
  clipEndMs: number,
  project?: Project,
  peers?: readonly TransitionPeer[],
): void {
  if (transitions.length === 0) {
    param.setValueAtTime(1, Math.max(0, clipStartMs) / 1000);
    return;
  }
  const times = new Set<number>([clipStartMs, clipEndMs]);
  for (const t of transitions) {
    times.add(t.startMs);
    times.add(t.startMs + Math.max(0, t.durationMs));
    times.add(t.startMs + Math.max(1, t.audioDurationMs));
    const audioDur = Math.max(1, t.audioDurationMs);
    for (let step = 1; step < 4; step++) {
      times.add(t.startMs + (audioDur * step) / 4);
    }
  }
  const sorted = [...times]
    .filter((t) => t >= clipStartMs && t <= clipEndMs)
    .sort((a, b) => a - b);
  sorted.forEach((tMs, i) => {
    const g = transitionAudioGain(transitions, clipId, tMs, project, peers);
    const t = tMs / 1000;
    if (i === 0) param.setValueAtTime(g, t);
    else param.linearRampToValueAtTime(g, t);
  });
}

/** Equal-power A→B (same law as pan). u=0 → A=1 B=0; u=1 → A=0 B=1. */
export function equalPowerCrossfade(u: number): { a: number; b: number } {
  const t = Math.max(0, Math.min(1, u));
  return { a: Math.cos((t * Math.PI) / 2), b: Math.sin((t * Math.PI) / 2) };
}

export interface TransitionPeer {
  id: string;
  linkId?: string;
}

function clipIdsForSource(
  clipId: string,
  project?: Project,
  peers?: readonly TransitionPeer[],
): Set<string> {
  const ids = new Set<string>([clipId]);
  if (project) {
    const mate = livingLinkedMate(project, clipId);
    if (mate) ids.add(mate.id);
  }
  if (peers) {
    const self = peers.find((c) => c.id === clipId);
    if (self?.linkId) {
      for (const p of peers) {
        if (p.linkId === self.linkId) ids.add(p.id);
      }
    }
  }
  return ids;
}

/**
 * Extra mix multiplier. Does not write clip.gain / fadeInMs / fadeOutMs.
 * cut = existing overlap mix (1). keepA/keepB mute the other source in the
 * video window. crossfade uses audioDurationMs from transition.startMs.
 */
export function transitionAudioGain(
  transitions: readonly Transition[],
  clipId: string,
  timeMs: number,
  project?: Project,
  peers?: readonly TransitionPeer[],
): number {
  let gain = 1;
  for (const t of transitions) {
    const aIds = clipIdsForSource(t.sourceAClipId, project, peers);
    const bIds = clipIdsForSource(t.sourceBClipId, project, peers);
    const inA = aIds.has(clipId);
    const inB = bIds.has(clipId);
    if (!inA && !inB) continue;
    if (t.audioMode === "cut") continue;
    if (t.audioMode === "keepA" || t.audioMode === "keepB") {
      if (!transitionCovers(t, timeMs)) continue;
      if (t.audioMode === "keepA" && inB) gain *= 0;
      if (t.audioMode === "keepB" && inA) gain *= 0;
      continue;
    }
    const audioDur = Math.max(1, t.audioDurationMs);
    if (timeMs < t.startMs || timeMs >= t.startMs + audioDur) continue;
    const u = (timeMs - t.startMs) / audioDur;
    const xf = equalPowerCrossfade(u);
    if (inA) gain *= xf.a;
    if (inB) gain *= xf.b;
  }
  return gain;
}

export function upsertTransition(
  project: Project,
  pair: EditPair,
  patch: Partial<Pick<Transition, "type" | "durationMs" | "audioMode" | "audioDurationMs" | "startMs">>,
): { project: Project; transition: Transition } {
  const existing = findTransitionForPair(
    project.transitions ?? [],
    pair.sourceA.id,
    pair.sourceB.id,
  );
  const durationMs = Math.max(
    1,
    patch.durationMs ?? existing?.durationMs ?? Math.max(1, Math.min(1000, pair.overlapDurationMs)),
  );
  const next: Transition = {
    id: existing?.id ?? createId("tr"),
    type: patch.type ?? existing?.type ?? "cut",
    startMs: patch.startMs ?? existing?.startMs ?? pair.overlapStartMs,
    durationMs,
    sourceAClipId: pair.sourceA.id,
    sourceBClipId: pair.sourceB.id,
    audioMode: patch.audioMode ?? existing?.audioMode ?? "cut",
    audioDurationMs: Math.max(1, patch.audioDurationMs ?? existing?.audioDurationMs ?? durationMs),
  };
  const rest = (project.transitions ?? []).filter((t) => t.id !== next.id);
  return {
    project: {
      ...project,
      transitions: [...rest, next],
      updatedAt: new Date().toISOString(),
    },
    transition: next,
  };
}

export function sanitizeTransitions(raw: unknown): Transition[] {
  if (!Array.isArray(raw)) return [];
  const out: Transition[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) continue;
    if (typeof r.sourceAClipId !== "string" || typeof r.sourceBClipId !== "string") continue;
    if (!isTransitionType(r.type) || !isTransitionAudioMode(r.audioMode)) continue;
    const durationMs = Math.max(1, Number(r.durationMs) || 1);
    const audioDurationMs = Math.max(1, Number(r.audioDurationMs) || durationMs);
    out.push({
      id: r.id,
      type: r.type,
      startMs: Math.max(0, Number(r.startMs) || 0),
      durationMs,
      sourceAClipId: r.sourceAClipId,
      sourceBClipId: r.sourceBClipId,
      audioMode: r.audioMode,
      audioDurationMs,
    });
  }
  return out;
}
