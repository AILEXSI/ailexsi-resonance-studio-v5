import { createId } from "./ids";
import {
  SPLIT_EDGE_GUARD_MS,
  SNAP_THRESHOLD_MS,
  clipById,
  clipEndMs,
  kindOfTrack,
  TRACK_IDS,
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

export const ABUT_TOLERANCE_MS = 1;

/** Neighbor that shares this edge (end of A == start of B within 1ms). */
export function abuttingNeighbor(
  project: Project,
  clipId: string,
  edge: "in" | "out",
): Clip | undefined {
  const clip = clipById(project, clipId);
  if (!clip) return undefined;
  if (edge === "out") {
    const end = clipEndMs(clip);
    return project.clips.find(
      (c) =>
        c.id !== clipId &&
        c.trackId === clip.trackId &&
        Math.abs(c.startMs - end) <= ABUT_TOLERANCE_MS,
    );
  }
  return project.clips.find(
    (c) =>
      c.id !== clipId &&
      c.trackId === clip.trackId &&
      Math.abs(clipEndMs(c) - clip.startMs) <= ABUT_TOLERANCE_MS,
  );
}

/**
 * Lift-trim, then shift the rest of the same track so there is no hole or overlap.
 * Out: later clips (start >= old end) follow (newEnd - oldEnd).
 * In: lift leaves a hole before the clip; the trimmed clip and later clips
 * slide by the duration delta (start returns to the original, end follows).
 */
export function rippleTrimClip(
  project: Project,
  clipId: string,
  edge: "in" | "out",
  nextEdgeMs: number,
): { project: Project; error?: string } {
  const before = clipById(project, clipId);
  if (!before) return { project, error: "Clip not found" };
  const oldEnd = clipEndMs(before);
  const oldDur = before.durationMs;
  const trimmed = trimClip(project, clipId, edge, nextEdgeMs);
  if (trimmed.error) return trimmed;
  const after = clipById(trimmed.project, clipId);
  if (!after) return trimmed;
  const delta = after.durationMs - oldDur;
  if (delta === 0) return trimmed;
  return {
    project: {
      ...trimmed.project,
      clips: trimmed.project.clips.map((c) => {
        if (c.trackId !== before.trackId) return c;
        if (edge === "in" && c.id === clipId) {
          return { ...c, startMs: clampStartMs(c.startMs + delta) };
        }
        if (c.id === clipId) return c;
        if (c.startMs + ABUT_TOLERANCE_MS < oldEnd) return c;
        return { ...c, startMs: clampStartMs(c.startMs + delta) };
      }),
      updatedAt: new Date().toISOString(),
    },
  };
}

/** Move many clips by the same delta. Clamps so no start goes below 0. */
export function moveClipsByDelta(
  project: Project,
  clipIds: readonly string[],
  deltaMs: number,
): { project: Project; error?: string } {
  const targets = clipIds
    .map((id) => clipById(project, id))
    .filter((c): c is Clip => Boolean(c));
  if (targets.length === 0) return { project, error: "No clip selected" };
  const minStart = Math.min(...targets.map((c) => c.startMs));
  const delta = Math.max(deltaMs, -minStart);
  if (delta === 0) return { project };
  const starts = new Map(targets.map((c) => [c.id, c.startMs]));
  let next = project;
  for (const clip of targets) {
    const result = moveClip(next, clip.id, (starts.get(clip.id) ?? clip.startMs) + delta);
    if (result.error) return result;
    next = result.project;
  }
  return { project: next };
}

export function deleteClips(project: Project, clipIds: readonly string[]): Project {
  const drop = new Set(clipIds);
  return {
    ...project,
    clips: project.clips.filter((c) => !drop.has(c.id)),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Ripple-delete many clips. Per track, later clips first so earlier
 * ripple shifts do not invalidate later selected starts.
 */
export function rippleDeleteClips(project: Project, clipIds: readonly string[]): Project {
  const selected = clipIds
    .map((id) => clipById(project, id))
    .filter((c): c is Clip => Boolean(c));
  const order = [...selected].sort((a, b) => {
    if (a.trackId !== b.trackId) return a.trackId.localeCompare(b.trackId);
    return b.startMs - a.startMs;
  });
  let next = project;
  for (const clip of order) {
    next = rippleDeleteClip(next, clip.id);
  }
  return next;
}

/**
 * Move the shared cut between two abutting clips. Total A+B span stays constant.
 */
export function rollEdit(
  project: Project,
  leftId: string,
  rightId: string,
  cutMs: number,
): { project: Project; error?: string } {
  const left = clipById(project, leftId);
  const right = clipById(project, rightId);
  if (!left || !right) return { project, error: "Clip not found" };
  if (left.trackId !== right.trackId) {
    return { project, error: "Roll requires two clips on the same track" };
  }
  if (Math.abs(clipEndMs(left) - right.startMs) > ABUT_TOLERANCE_MS) {
    return { project, error: "Clips do not abut" };
  }

  const spanEnd = clipEndMs(right);
  let cut = Math.max(0, cutMs);
  if (project.snap) {
    cut = snapTime(cut, collectSnapTargets(project, leftId)).timeMs;
    cut = Math.max(0, cut);
  }

  const leftDur = cut - left.startMs;
  const rightDur = spanEnd - cut;
  if (leftDur < SPLIT_EDGE_GUARD_MS || rightDur < SPLIT_EDGE_GUARD_MS) {
    return { project, error: "Roll would leave less than 50ms" };
  }

  const leftSourceOut = left.sourceInMs + leftDur;
  const rightSourceIn = right.sourceInMs + (cut - right.startMs);
  const leftAsset = project.assets.find((a) => a.id === left.assetId);
  const rightAsset = project.assets.find((a) => a.id === right.assetId);
  if (rightSourceIn < 0) {
    return { project, error: "sourceIn cannot go below 0" };
  }
  if (rightSourceIn > right.sourceOutMs - SPLIT_EDGE_GUARD_MS) {
    return { project, error: "sourceIn cannot exceed sourceOut - 50ms" };
  }
  if (leftSourceOut < left.sourceInMs + SPLIT_EDGE_GUARD_MS) {
    return { project, error: "Trim would leave less than 50ms" };
  }
  if (leftAsset && leftSourceOut > leftAsset.durationMs) {
    return { project, error: "sourceOut cannot exceed asset duration" };
  }
  if (rightAsset && right.sourceOutMs > rightAsset.durationMs) {
    return { project, error: "sourceOut cannot exceed asset duration" };
  }

  const nextLeft: Clip = {
    ...left,
    durationMs: leftDur,
    sourceOutMs: leftSourceOut,
  };
  const nextRight: Clip = {
    ...right,
    startMs: cut,
    durationMs: rightDur,
    sourceInMs: rightSourceIn,
  };

  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      clips: project.clips.map((c) => {
        if (c.id === leftId) return nextLeft;
        if (c.id === rightId) return nextRight;
        return c;
      }),
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
  onlyClipIds?: readonly string[],
): { project: Project; error?: string } {
  const allow = onlyClipIds ? new Set(onlyClipIds) : null;
  const hits = project.clips.filter(
    (c) =>
      (!allow || allow.has(c.id)) &&
      project.playheadMs > c.startMs &&
      project.playheadMs < clipEndMs(c),
  );
  if (hits.length === 0) {
    return {
      project,
      error: allow ? "No selected clip under playhead" : "No clip under playhead",
    };
  }
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

/** Valid edit range [in, out) or null. */
export function editRangeOf(project: Project): { inMs: number; outMs: number } | null {
  const inMs = project.inPointMs;
  const outMs = project.outPointMs;
  if (inMs == null || outMs == null || outMs <= inMs) return null;
  return { inMs, outMs };
}

function splitAllAtTime(project: Project, timeMs: number): Project {
  const hits = project.clips.filter((c) => c.startMs < timeMs && clipEndMs(c) > timeMs);
  let next = project;
  for (const clip of hits) {
    const current = clipById(next, clip.id);
    if (!current) continue;
    if (!(current.startMs < timeMs && clipEndMs(current) > timeMs)) continue;
    const result = splitClipAt(next, current.id, timeMs);
    if (!result.error) next = result.project;
  }
  return next;
}

function clipsFullyInsideRange(project: Project, inMs: number, outMs: number): Clip[] {
  return project.clips.filter((c) => c.startMs >= inMs && clipEndMs(c) <= outMs);
}

/** Split every clip that straddles IN or OUT (50ms guard). */
export function splitAtRangeBounds(project: Project): Project {
  const range = editRangeOf(project);
  if (!range) return project;
  return splitAllAtTime(splitAllAtTime(project, range.inMs), range.outMs);
}

/**
 * Split at IN/OUT, then lift pieces that lie fully inside [in, out).
 * Later clips stay. Invalid range is a no-op.
 */
export function liftRange(project: Project): { project: Project } {
  const range = editRangeOf(project);
  if (!range) return { project };
  const split = splitAtRangeBounds(project);
  const mids = clipsFullyInsideRange(split, range.inMs, range.outMs);
  if (mids.length === 0 && split === project) return { project };
  return { project: deleteClips(split, mids.map((c) => c.id)) };
}

/**
 * liftRange, then on each track shift clips that start at/after OUT left by (out−in).
 */
export function extractRange(project: Project): { project: Project } {
  const range = editRangeOf(project);
  if (!range) return { project };
  const lifted = liftRange(project).project;
  const span = range.outMs - range.inMs;
  let moved = lifted !== project;
  const clips = lifted.clips.map((c) => {
    if (c.startMs < range.outMs) return c;
    moved = true;
    return { ...c, startMs: clampStartMs(c.startMs - span) };
  });
  if (!moved) return { project };
  return {
    project: {
      ...lifted,
      clips,
      updatedAt: new Date().toISOString(),
    },
  };
}

export interface SnapTarget {
  timeMs: number;
  kind: "clip-start" | "clip-end" | "playhead" | "in" | "out" | "zero";
}

export function collectSnapTargets(
  project: Project,
  ignoreClipId?: string | readonly string[],
): SnapTarget[] {
  const ignore = new Set(
    ignoreClipId == null ? [] : typeof ignoreClipId === "string" ? [ignoreClipId] : ignoreClipId,
  );
  const targets: SnapTarget[] = [{ timeMs: 0, kind: "zero" }];
  if (project.snap) {
    targets.push({ timeMs: project.playheadMs, kind: "playhead" });
    if (project.inPointMs != null) targets.push({ timeMs: project.inPointMs, kind: "in" });
    if (project.outPointMs != null) targets.push({ timeMs: project.outPointMs, kind: "out" });
    for (const clip of project.clips) {
      if (ignore.has(clip.id)) continue;
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

export function toggleTrackSolo(project: Project, trackId: TrackId): Project {
  return {
    ...project,
    tracks: project.tracks.map((t) =>
      t.id === trackId ? { ...t, solo: !t.solo } : t,
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

/** Same-kind track, clamped to V1/V2 or A1/A2. `delta` is a lane step within that kind. */
export function clampSameKindTrack(trackId: TrackId, delta = 0): TrackId {
  const kind = kindOfTrack(trackId);
  const lane = TRACK_IDS.filter((id) => kindOfTrack(id) === kind);
  const idx = Math.max(0, lane.indexOf(trackId));
  return lane[Math.max(0, Math.min(lane.length - 1, idx + delta))] ?? trackId;
}

/**
 * Place clipboard snapshots at `atMs`. Earliest clip lands on the playhead;
 * others keep relative start and same-kind track offsets. New ids.
 */
export function pasteClips(
  project: Project,
  clips: readonly Clip[],
  atMs: number,
): { project: Project; clipIds: string[]; error?: string } {
  if (clips.length === 0) return { project, clipIds: [], error: "Clipboard empty" };
  const origin = Math.min(...clips.map((c) => c.startMs));
  const rawStarts = clips.map((c) => atMs + (c.startMs - origin));
  const pad = Math.max(0, -Math.min(...rawStarts));
  const nextClips = [...project.clips];
  const clipIds: string[] = [];
  clips.forEach((clip, i) => {
    const copy: Clip = {
      ...clip,
      id: createId("clip"),
      startMs: clampStartMs((rawStarts[i] ?? atMs) + pad),
      trackId: clampSameKindTrack(clip.trackId),
    };
    nextClips.push(copy);
    clipIds.push(copy.id);
  });
  return {
    project: {
      ...project,
      clips: nextClips,
      updatedAt: new Date().toISOString(),
    },
    clipIds,
  };
}

/**
 * Slide source in/out. Timeline start and duration stay put.
 * Clamps sourceIn ≥ 0 and sourceOut ≤ asset duration.
 */
export function slipClip(
  project: Project,
  clipId: string,
  deltaMs: number,
): { project: Project; error?: string } {
  const clip = clipById(project, clipId);
  if (!clip) return { project, error: "Clip not found" };
  const asset = project.assets.find((a) => a.id === clip.assetId);
  const maxOut = asset?.durationMs ?? Number.POSITIVE_INFINITY;
  const maxIn = maxOut - clip.durationMs;
  const sourceInMs = Math.min(Math.max(0, clip.sourceInMs + deltaMs), Math.max(0, maxIn));
  if (sourceInMs === clip.sourceInMs) return { project };
  const next: Clip = {
    ...clip,
    sourceInMs,
    sourceOutMs: sourceInMs + clip.durationMs,
  };
  return {
    project: {
      ...project,
      clips: project.clips.map((c) => (c.id === clipId ? next : c)),
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

/**
 * Lift the clip, then shift later clips on the same track left by its duration.
 * Other tracks are unchanged.
 */
export function rippleDeleteClip(project: Project, clipId: string): Project {
  const clip = clipById(project, clipId);
  if (!clip) return project;
  const shift = clip.durationMs;
  const cutoff = clip.startMs;
  const trackId = clip.trackId;
  return {
    ...project,
    clips: project.clips
      .filter((c) => c.id !== clipId)
      .map((c) => {
        if (c.trackId !== trackId || c.startMs < cutoff) return c;
        return { ...c, startMs: clampStartMs(c.startMs - shift) };
      }),
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
