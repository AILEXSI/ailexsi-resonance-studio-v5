import { createId } from "./ids";
import {
  SPLIT_EDGE_GUARD_MS,
  SNAP_THRESHOLD_MS,
  clipById,
  clipEndMs,
  kindOfTrack,
  type Clip,
  type Marker,
  type Project,
  type TrackId,
} from "./models";

export interface HistoryStack {
  past: Project[];
  future: Project[];
}

export function createHistory(): HistoryStack {
  return { past: [], future: [] };
}

export function pushHistory(history: HistoryStack, project: Project): HistoryStack {
  return {
    past: [...history.past, structuredClone(project)],
    future: [],
  };
}

export function undo(history: HistoryStack, current: Project): {
  history: HistoryStack;
  project: Project;
} | null {
  if (history.past.length === 0) return null;
  const past = history.past.slice();
  const previous = past.pop()!;
  return {
    project: previous,
    history: { past, future: [structuredClone(current), ...history.future] },
  };
}

export function redo(history: HistoryStack, current: Project): {
  history: HistoryStack;
  project: Project;
} | null {
  if (history.future.length === 0) return null;
  const [next, ...rest] = history.future;
  return {
    project: next,
    history: { past: [...history.past, structuredClone(current)], future: rest },
  };
}

export function clampStartMs(startMs: number): number {
  return Math.max(0, startMs);
}

export function moveClip(
  project: Project,
  clipId: string,
  nextStartMs: number,
  nextTrackId?: TrackId,
): { project: Project; error?: string } {
  const clip = clipById(project, clipId);
  if (!clip) return { project, error: "Clip not found" };

  const trackId = nextTrackId ?? clip.trackId;
  if (kindOfTrack(trackId) !== kindOfTrack(clip.trackId)) {
    return { project, error: "Cannot move clip to a different kind of track" };
  }

  const startMs = clampStartMs(nextStartMs);
  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      clips: project.clips.map((c) =>
        c.id === clipId ? { ...c, startMs, trackId } : c,
      ),
    },
  };
}

export function trimClip(
  project: Project,
  clipId: string,
  edge: "in" | "out",
  nextEdgeMs: number,
): { project: Project; error?: string } {
  const clip = clipById(project, clipId);
  if (!clip) return { project, error: "Clip not found" };

  const asset = project.assets.find((a) => a.id === clip.assetId);
  let edgeMs = Math.max(0, nextEdgeMs);
  if (project.snap) {
    edgeMs = snapTime(edgeMs, collectSnapTargets(project, clipId)).timeMs;
    edgeMs = Math.max(0, edgeMs);
  }

  let next: Clip;
  if (edge === "in") {
    const newStart = edgeMs;
    const newSourceIn = clip.sourceInMs + (newStart - clip.startMs);
    const newDuration = clipEndMs(clip) - newStart;
    if (newSourceIn < 0) {
      return { project, error: "sourceIn cannot go below 0" };
    }
    if (newDuration < SPLIT_EDGE_GUARD_MS) {
      return { project, error: "Trim would leave less than 50ms" };
    }
    if (newSourceIn > clip.sourceOutMs - SPLIT_EDGE_GUARD_MS) {
      return { project, error: "sourceIn cannot exceed sourceOut - 50ms" };
    }
    next = {
      ...clip,
      startMs: newStart,
      sourceInMs: newSourceIn,
      durationMs: newDuration,
    };
  } else {
    const newDuration = edgeMs - clip.startMs;
    const newSourceOut = clip.sourceInMs + newDuration;
    if (newDuration < SPLIT_EDGE_GUARD_MS) {
      return { project, error: "Trim would leave less than 50ms" };
    }
    if (asset && newSourceOut > asset.durationMs) {
      return { project, error: "sourceOut cannot exceed asset duration" };
    }
    next = {
      ...clip,
      durationMs: newDuration,
      sourceOutMs: newSourceOut,
    };
  }

  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      clips: project.clips.map((c) => (c.id === clipId ? next : c)),
    },
  };
}

export function splitClipAt(
  project: Project,
  clipId: string,
  timeMs: number,
  edgeGuardMs = SPLIT_EDGE_GUARD_MS,
): { project: Project; leftId?: string; rightId?: string; error?: string } {
  const clip = clipById(project, clipId);
  if (!clip) return { project, error: "Clip not found" };
  const offset = timeMs - clip.startMs;
  if (offset < edgeGuardMs || clip.durationMs - offset < edgeGuardMs) {
    return { project, error: "Split too close to clip edge" };
  }

  const left: Clip = {
    ...clip,
    durationMs: offset,
    sourceOutMs: clip.sourceInMs + offset,
  };
  const right: Clip = {
    ...clip,
    id: createId("clip"),
    startMs: timeMs,
    durationMs: clip.durationMs - offset,
    sourceInMs: clip.sourceInMs + offset,
    sourceOutMs: clip.sourceOutMs,
  };

  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      clips: project.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c])),
    },
    leftId: left.id,
    rightId: right.id,
  };
}

export function splitAtPlayhead(
  project: Project,
  edgeGuardMs = SPLIT_EDGE_GUARD_MS,
): { project: Project; error?: string } {
  const hits = project.clips.filter(
    (c) => project.playheadMs > c.startMs && project.playheadMs < clipEndMs(c),
  );
  if (hits.length === 0) return { project, error: "No clip under playhead" };
  let next = project;
  let lastError: string | undefined;
  let splitAny = false;
  for (const clip of hits) {
    const result = splitClipAt(next, clip.id, next.playheadMs, edgeGuardMs);
    if (result.error) lastError = result.error;
    else {
      next = result.project;
      splitAny = true;
    }
  }
  if (!splitAny) return { project, error: lastError ?? "Split rejected" };
  return { project: next };
}

export interface SnapTarget {
  timeMs: number;
  kind: "clip-start" | "clip-end" | "playhead" | "in" | "out" | "zero";
}

export function collectSnapTargets(project: Project, ignoreClipId?: string): SnapTarget[] {
  const targets: SnapTarget[] = [{ timeMs: 0, kind: "zero" }];
  if (project.snap) {
    targets.push({ timeMs: project.playheadMs, kind: "playhead" });
    if (project.inPointMs != null) targets.push({ timeMs: project.inPointMs, kind: "in" });
    if (project.outPointMs != null) targets.push({ timeMs: project.outPointMs, kind: "out" });
    for (const clip of project.clips) {
      if (clip.id === ignoreClipId) continue;
      targets.push({ timeMs: clip.startMs, kind: "clip-start" });
      targets.push({ timeMs: clipEndMs(clip), kind: "clip-end" });
    }
  }
  return targets;
}

export function snapTime(
  timeMs: number,
  targets: SnapTarget[],
  thresholdMs = SNAP_THRESHOLD_MS,
): { timeMs: number; snapped: boolean; target?: SnapTarget } {
  let best: SnapTarget | undefined;
  let bestDist = thresholdMs;
  for (const target of targets) {
    const dist = Math.abs(target.timeMs - timeMs);
    if (dist <= bestDist) {
      bestDist = dist;
      best = target;
    }
  }
  if (!best) return { timeMs, snapped: false };
  return { timeMs: best.timeMs, snapped: true, target: best };
}

export function setInPoint(
  project: Project,
  timeMs: number,
  opts?: { replace?: boolean },
): { project: Project; error?: string } {
  const t = Math.max(0, timeMs);
  if (opts?.replace) {
    if (project.outPointMs != null && t > project.outPointMs) {
      return {
        project: {
          ...project,
          inPointMs: project.outPointMs,
          outPointMs: t,
          updatedAt: new Date().toISOString(),
        },
      };
    }
    return { project: { ...project, inPointMs: t, updatedAt: new Date().toISOString() } };
  }
  if (project.outPointMs != null && t > project.outPointMs) {
    return { project, error: "IN cannot be after OUT" };
  }
  return { project: { ...project, inPointMs: t, updatedAt: new Date().toISOString() } };
}

export function setOutPoint(
  project: Project,
  timeMs: number,
  opts?: { replace?: boolean },
): { project: Project; error?: string } {
  const t = Math.max(0, timeMs);
  if (opts?.replace) {
    if (project.inPointMs != null && t < project.inPointMs) {
      return {
        project: {
          ...project,
          inPointMs: t,
          outPointMs: project.inPointMs,
          updatedAt: new Date().toISOString(),
        },
      };
    }
    return { project: { ...project, outPointMs: t, updatedAt: new Date().toISOString() } };
  }
  if (project.inPointMs != null && t < project.inPointMs) {
    return { project, error: "OUT cannot be before IN" };
  }
  return { project: { ...project, outPointMs: t, updatedAt: new Date().toISOString() } };
}

export function moveInOut(
  project: Project,
  deltaMs: number,
): { project: Project; error?: string } {
  if (project.inPointMs == null || project.outPointMs == null) {
    return { project, error: "No loop range" };
  }
  const duration = project.outPointMs - project.inPointMs;
  const inMs = Math.max(0, project.inPointMs + deltaMs);
  return {
    project: {
      ...project,
      inPointMs: inMs,
      outPointMs: inMs + duration,
      updatedAt: new Date().toISOString(),
    },
  };
}

/** VIS-only (no clips) is 0. Origin is the earliest clip start when clips exist. */
export function earliestClipStartMs(project: Project): number {
  if (project.clips.length === 0) return 0;
  let min = project.clips[0]!.startMs;
  for (const clip of project.clips) {
    if (clip.startMs < min) min = clip.startMs;
  }
  return min;
}

export const ORIGIN_LEAD_MS = 250;

export function originScrollMs(project: Project): number {
  return Math.max(0, earliestClipStartMs(project) - ORIGIN_LEAD_MS);
}

export function maybeScrollToOrigin(
  project: Project,
  opts: { prevScrollMs: number; prevClipCount: number },
): Project {
  if (project.clips.length === 0) return project;
  const firstPlace = opts.prevClipCount === 0;
  if (opts.prevScrollMs !== 0 && !firstPlace) return project;
  return { ...project, scrollMs: originScrollMs(project) };
}

export function clearInOut(project: Project): Project {
  return { ...project, inPointMs: null, outPointMs: null, updatedAt: new Date().toISOString() };
}

export function setPlayhead(project: Project, timeMs: number): Project {
  return { ...project, playheadMs: Math.max(0, timeMs) };
}

export function toggleLoop(project: Project): Project {
  return { ...project, loop: !project.loop };
}

export function toggleSnap(project: Project): Project {
  return { ...project, snap: !project.snap };
}

export function setTrackVolume(project: Project, trackId: TrackId, volume: number): Project {
  const v = Math.max(0, Math.min(2, Number(volume) || 0));
  return {
    ...project,
    tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, volume: v } : t)),
    updatedAt: new Date().toISOString(),
  };
}

export function setMasterVolume(project: Project, volume: number): Project {
  const v = Math.max(0, Math.min(2, Number(volume) || 0));
  return { ...project, masterVolume: v, updatedAt: new Date().toISOString() };
}

export function toggleTrackMute(project: Project, trackId: TrackId): Project {
  return {
    ...project,
    tracks: project.tracks.map((t) =>
      t.id === trackId ? { ...t, muted: !t.muted } : t,
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function addMarker(project: Project, timeMs: number, label?: string): Project {
  const marker: Marker = {
    id: createId("mk"),
    timeMs: Math.max(0, timeMs),
    label: label ?? `M${project.markers.length + 1}`,
  };
  return {
    ...project,
    markers: [...project.markers, marker],
    updatedAt: new Date().toISOString(),
  };
}

export function moveMarker(
  project: Project,
  markerId: string,
  timeMs: number,
): { project: Project; error?: string } {
  if (!project.markers.some((m) => m.id === markerId)) {
    return { project, error: "Marker not found" };
  }
  const nextTime = Math.max(0, timeMs);
  return {
    project: {
      ...project,
      markers: project.markers.map((m) => (m.id === markerId ? { ...m, timeMs: nextTime } : m)),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function deleteMarker(
  project: Project,
  markerId: string,
): { project: Project; error?: string } {
  if (!project.markers.some((m) => m.id === markerId)) {
    return { project, error: "Marker not found" };
  }
  return {
    project: {
      ...project,
      markers: project.markers.filter((m) => m.id !== markerId),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function duplicateClip(
  project: Project,
  clipId: string,
  atMs?: number,
): { project: Project; clip?: Clip; error?: string } {
  const clip = clipById(project, clipId);
  if (!clip) return { project, error: "Clip not found" };
  const copy: Clip = {
    ...clip,
    id: createId("clip"),
    startMs: clampStartMs(atMs ?? clipEndMs(clip)),
  };
  return {
    project: {
      ...project,
      clips: [...project.clips, copy],
      updatedAt: new Date().toISOString(),
    },
    clip: copy,
  };
}

export function updateClip(
  project: Project,
  clipId: string,
  patch: Partial<Pick<Clip, "startMs" | "durationMs" | "sourceInMs" | "sourceOutMs" | "gain" | "trackId">>,
): { project: Project; error?: string } {
  const clip = clipById(project, clipId);
  if (!clip) return { project, error: "Clip not found" };
  if (patch.trackId && kindOfTrack(patch.trackId) !== kindOfTrack(clip.trackId)) {
    return { project, error: "Cannot change clip to a different kind of track" };
  }

  const next: Clip = { ...clip, ...patch };
  if (patch.sourceInMs != null || patch.sourceOutMs != null) {
    const asset = project.assets.find((a) => a.id === clip.assetId);
    const maxOut = asset?.durationMs ?? next.sourceOutMs;
    next.sourceInMs = Math.max(0, next.sourceInMs);
    next.sourceOutMs = Math.max(next.sourceInMs + 1, Math.min(maxOut, next.sourceOutMs));
    next.durationMs = next.sourceOutMs - next.sourceInMs;
  }
  if (patch.durationMs != null) {
    next.durationMs = Math.max(1, patch.durationMs);
    next.sourceOutMs = next.sourceInMs + next.durationMs;
  }
  next.startMs = clampStartMs(next.startMs);
  next.gain = Math.max(0, Math.min(4, next.gain));

  return {
    project: {
      ...project,
      clips: project.clips.map((c) => (c.id === clipId ? next : c)),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function deleteClip(project: Project, clipId: string): Project {
  return {
    ...project,
    clips: project.clips.filter((c) => c.id !== clipId),
    updatedAt: new Date().toISOString(),
  };
}

/** End of the last clip on `trackId`, or 0 if that track is empty. */
export function lastClipEndMsOnTrack(project: Project, trackId: TrackId): number {
  let end = 0;
  for (const clip of project.clips) {
    if (clip.trackId === trackId) end = Math.max(end, clipEndMs(clip));
  }
  return end;
}

export function placeAsset(
  project: Project,
  assetId: string,
  trackId: TrackId,
  startMs = 0,
): { project: Project; clip?: Clip; error?: string } {
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) return { project, error: "Asset not found" };
  if (kindOfTrack(trackId) !== asset.kind) {
    return { project, error: `Asset kind ${asset.kind} cannot go on ${trackId}` };
  }
  const clip: Clip = {
    id: createId("clip"),
    assetId: asset.id,
    trackId,
    startMs: clampStartMs(startMs),
    durationMs: asset.durationMs,
    sourceInMs: 0,
    sourceOutMs: asset.durationMs,
    gain: 1,
  };
  return {
    project: {
      ...project,
      clips: [...project.clips, clip],
      updatedAt: new Date().toISOString(),
    },
    clip,
  };
}

export function exportRangeMs(project: Project): { startMs: number; endMs: number } {
  const startMs = project.inPointMs ?? 0;
  const computedEnd = project.clips.reduce((max, c) => Math.max(max, clipEndMs(c)), 0);
  const endMs = project.outPointMs ?? computedEnd;
  return { startMs, endMs };
}
