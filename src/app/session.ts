import { unlinkClips } from "../core/link";
import { importMediaFile, ImportError, defaultTrackForKind, type ProbeFn } from "../core/media";
import { clipById, type Clip, type Project, type TrackId } from "../core/models";
import {
  createIndexedDbBlobStore,
  hydrateProject,
  persistAssetBlob,
  type BlobStore,
} from "../core/persistence";
import { createEmptyProject, deserializeProject, serializeProject } from "../core/project";
import {
  addMarker,
  clearInOut,
  deleteMarker,
  collectSnapTargets,
  createHistory,
  deleteClips,
  pasteClips,
  slipClips,
  slideClips,
  setClipRate,
  maybeScrollToOrigin,
  moveClip,
  moveClipsByDelta,
  moveMarker,
  moveInOut,
  lastClipEndMsOnTrack,
  placeAsset,
  pushHistory,
  redo as redoHistory,
  setInPoint,
  setOutPoint,
  setPlayhead,
  snapTime,
  splitAtPlayhead,
  toggleLoop,
  toggleSnap,
  setMasterVolume,
  setTrackPan,
  setTrackVolume,
  rippleDeleteClips,
  rippleTrimClip,
  liftRange,
  extractRange,
  editRangeOf,
  rollEdit,
  abuttingNeighbor,
  toggleTrackMute,
  toggleTrackSolo,
  trimClip,
  undo as undoHistory,
  updateClip,
  type HistoryStack,
} from "../core/timeline";
import { nextShuttleRate } from "../core/playback";
import { cycleVisualizerScene, toggleVisualizerMute } from "../core/visualizer";
import { formatDb, formatPan, linearToDb } from "../core/volume";
import {
  clampZoomPxPerSec,
  fitZoomPxPerSec,
  minZoomPxPerSec,
  scrollZoomAroundPlayhead,
} from "../core/zoom";

export interface Session {
  project: Project;
  history: HistoryStack;
  selectedClipId: string | null;
  /** Source of truth for clip selection. `selectedClipId` is the primary (first). */
  selectedClipIds: string[];
  selectedMarkerId: string | null;
  /** Snapshot of copied clips. Empty = none. One-clip copy is a single-item array. */
  clipboard: Clip[];
  targetTrackId: TrackId;
  status: string;
  error: string | null;
  playing: boolean;
  /** 0 = paused. Space uses ±1. J/L step 1→2→4 (signed). */
  shuttleRate: number;
  store: BlobStore;
}

export function createSession(store?: BlobStore): Session {
  return {
    project: createEmptyProject(),
    history: createHistory(),
    selectedClipId: null,
    selectedClipIds: [],
    selectedMarkerId: null,
    clipboard: [],
    targetTrackId: "V1",
    status: "New project",
    error: null,
    playing: false,
    shuttleRate: 0,
    store: store ?? createIndexedDbBlobStore(),
  };
}

/** Clip ids currently selected. Falls back to `selectedClipId` so older tests stay valid. */
export function selectionOf(session: Session): string[] {
  if (session.selectedClipIds && session.selectedClipIds.length > 0) {
    return [...new Set(session.selectedClipIds)];
  }
  return session.selectedClipId ? [session.selectedClipId] : [];
}

export function withClipSelection(session: Session, ids: string[]): Session {
  const unique = [...new Set(ids)];
  return {
    ...session,
    selectedClipIds: unique,
    selectedClipId: unique[0] ?? null,
  };
}

function withHistory(session: Session, nextProject: Project, status: string): Session {
  return {
    ...session,
    history: pushHistory(session.history, session.project),
    project: nextProject,
    status,
    error: null,
  };
}

export function newProject(session: Session): Session {
  return {
    ...createSession(session.store),
    status: "New project",
  };
}

export async function importFiles(
  session: Session,
  files: FileList | File[],
  probe?: ProbeFn,
): Promise<Session> {
  const list = Array.from(files);
  if (list.length === 0) {
    return { ...session, error: "No files selected", status: "Import failed" };
  }
  let next = session;
  const errors: string[] = [];
  let imported = 0;
  const prevScrollMs = session.project.scrollMs;
  const prevClipCount = session.project.clips.length;
  for (const file of list) {
    try {
      const asset = await importMediaFile(file, probe);
      const projectWithAsset = {
        ...next.project,
        assets: [...next.project.assets, asset],
        updatedAt: new Date().toISOString(),
      };
      const preferred =
        asset.kind === "video"
          ? next.targetTrackId === "V2"
            ? "V2"
            : "V1"
          : next.targetTrackId === "A2"
            ? "A2"
            : "A1";
      const placed = placeAsset(
        projectWithAsset,
        asset.id,
        preferred,
        lastClipEndMsOnTrack(projectWithAsset, preferred),
      );
      if (placed.error || !placed.clip) {
        errors.push(placed.error ?? "Place failed");
        continue;
      }
      await persistAssetBlob(next.store, asset, file);
      const placedIds = placed.audioClip
        ? [placed.clip.id, placed.audioClip.id]
        : [placed.clip.id];
      next = {
        ...withClipSelection(
          withHistory(next, placed.project, `Imported ${asset.name}`),
          placedIds,
        ),
        targetTrackId: preferred,
      };
      imported += 1;
    } catch (e) {
      if (e instanceof ImportError) errors.push(e.message);
      else errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (imported === 0) {
    return {
      ...next,
      error: errors.join(" · ") || "Import failed",
      status: "Import failed",
    };
  }
  return {
    ...next,
    project: maybeScrollToOrigin(next.project, { prevScrollMs, prevClipCount }),
    error: errors.length ? errors.join(" · ") : null,
    status: errors.length ? `Imported ${imported}, ${errors.length} failed` : `Imported ${imported} file(s)`,
  };
}

export function applyPlaceAsset(
  session: Session,
  assetId: string,
  trackId: TrackId,
  startMs?: number,
): Session {
  const prevScrollMs = session.project.scrollMs;
  const prevClipCount = session.project.clips.length;
  const result = placeAsset(
    session.project,
    assetId,
    trackId,
    startMs ?? session.project.playheadMs,
  );
  if (result.error || !result.clip) {
    return { ...session, error: result.error ?? "Place failed", status: "Place failed" };
  }
  const project = maybeScrollToOrigin(result.project, { prevScrollMs, prevClipCount });
  const asset = project.assets.find((a) => a.id === assetId);
  const placedIds = result.audioClip ? [result.clip.id, result.audioClip.id] : [result.clip.id];
  return {
    ...withClipSelection(
      withHistory(session, project, `Placed ${asset?.name ?? "clip"}`),
      placedIds,
    ),
    error: null,
  };
}

export function applyMove(
  session: Session,
  clipId: string,
  startMs: number,
  trackId?: TrackId,
): Session {
  const snapped = session.project.snap
    ? snapTime(startMs, collectSnapTargets(session.project, clipId)).timeMs
    : startMs;
  const result = moveClip(session.project, clipId, snapped, trackId);
  if (result.error) return { ...session, error: result.error };
  return withHistory(session, result.project, "Moved clip");
}

export function applyMoveClips(
  session: Session,
  clipIds: readonly string[],
  deltaMs: number,
  trackId?: TrackId,
): Session {
  const ids = [...new Set(clipIds)];
  if (ids.length === 0) return { ...session, error: "No clip selected" };
  if (ids.length === 1 && trackId) {
    const clip = clipById(session.project, ids[0]!);
    if (!clip) return { ...session, error: "Clip not found" };
    const result = moveClip(session.project, clip.id, clip.startMs + deltaMs, trackId);
    if (result.error) return { ...session, error: result.error };
    return withHistory(session, result.project, "Moved clip");
  }
  const result = moveClipsByDelta(session.project, ids, deltaMs);
  if (result.error) return { ...session, error: result.error };
  if (result.project === session.project) return session;
  return withHistory(session, result.project, ids.length > 1 ? "Moved clips" : "Moved clip");
}

export function applyTrim(
  session: Session,
  clipId: string,
  edge: "in" | "out",
  nextEdgeMs: number,
): Session {
  const result = trimClip(session.project, clipId, edge, nextEdgeMs);
  if (result.error) return { ...session, error: result.error };
  return withHistory(session, result.project, "Trimmed clip");
}

export function applyRippleTrim(
  session: Session,
  clipId: string,
  edge: "in" | "out",
  nextEdgeMs: number,
): Session {
  const result = rippleTrimClip(session.project, clipId, edge, nextEdgeMs);
  if (result.error) return { ...session, error: result.error };
  return withHistory(session, result.project, "Ripple trimmed");
}

export function applyRoll(
  session: Session,
  clipId: string,
  edge: "in" | "out",
  nextEdgeMs: number,
): Session {
  const clip = session.project.clips.find((c) => c.id === clipId);
  if (!clip) return { ...session, error: "Clip not found" };
  const neighbor = abuttingNeighbor(session.project, clipId, edge);
  if (!neighbor) return { ...session, error: "No abutting clip to roll" };
  const leftId = edge === "out" ? clipId : neighbor.id;
  const rightId = edge === "out" ? neighbor.id : clipId;
  const result = rollEdit(session.project, leftId, rightId, nextEdgeMs);
  if (result.error) return { ...session, error: result.error };
  return withHistory(session, result.project, "Rolled edit");
}

export function applySplit(session: Session): Session {
  const ids = selectionOf(session);
  const result =
    ids.length >= 2
      ? splitAtPlayhead(session.project, undefined, ids)
      : splitAtPlayhead(session.project);
  if (result.error) return { ...session, error: result.error, status: "Split rejected" };
  return withHistory(session, result.project, "Split at playhead");
}

export function applyUndo(session: Session): Session {
  const result = undoHistory(session.history, session.project);
  if (!result) return { ...session, status: "Nothing to undo" };
  return { ...session, project: result.project, history: result.history, status: "Undo", error: null };
}

export function applyRedo(session: Session): Session {
  const result = redoHistory(session.history, session.project);
  if (!result) return { ...session, status: "Nothing to redo" };
  return { ...session, project: result.project, history: result.history, status: "Redo", error: null };
}

export function applyIn(session: Session): Session {
  const result = setInPoint(session.project, session.project.playheadMs);
  if (result.error) return { ...session, error: result.error };
  return { ...session, project: result.project, status: "IN set", error: null };
}

export function applyOut(session: Session): Session {
  const result = setOutPoint(session.project, session.project.playheadMs);
  if (result.error) return { ...session, error: result.error };
  return { ...session, project: result.project, status: "OUT set", error: null };
}

export function applyInAt(session: Session, ms: number): Session {
  const bothSet = session.project.inPointMs != null && session.project.outPointMs != null;
  const base = bothSet
    ? { ...session.project, inPointMs: null, outPointMs: null }
    : session.project;
  const result = setInPoint(base, ms);
  if (result.error) return { ...session, error: result.error };
  return { ...session, project: result.project, status: "IN set", error: null };
}

export function applyOutAt(session: Session, ms: number): Session {
  const t = Math.max(0, ms);
  if (session.project.inPointMs != null && t < session.project.inPointMs) {
    return applyLoopRange(session, session.project.inPointMs, t);
  }
  const result = setOutPoint(session.project, t);
  if (result.error) return { ...session, error: result.error };
  const complete = result.project.inPointMs != null && result.project.outPointMs != null;
  return {
    ...session,
    project: complete ? { ...result.project, loop: true } : result.project,
    status: complete ? "Loop range set" : "OUT set",
    error: null,
  };
}

export function applyLoopRange(session: Session, aMs: number, bMs: number): Session {
  const a = Math.max(0, aMs);
  const b = Math.max(0, bMs);
  const inMs = Math.min(a, b);
  const outMs = Math.max(a, b);
  const cleared = { ...session.project, inPointMs: null, outPointMs: null };
  const withIn = setInPoint(cleared, inMs);
  if (withIn.error) return { ...session, error: withIn.error };
  const withOut = setOutPoint(withIn.project, outMs);
  if (withOut.error) return { ...session, error: withOut.error };
  return {
    ...session,
    project: { ...withOut.project, loop: true },
    status: "Loop range set",
    error: null,
  };
}

export function applyMoveInOut(session: Session, deltaMs: number): Session {
  const result = moveInOut(session.project, deltaMs);
  if (result.error) return { ...session, error: result.error };
  return { ...session, project: result.project, status: "Loop range moved", error: null };
}

export function applyInPointReplace(session: Session, ms: number): Session {
  const result = setInPoint(session.project, ms, { replace: true });
  if (result.error) return { ...session, error: result.error };
  return { ...session, project: result.project, error: null };
}

export function applyOutPointReplace(session: Session, ms: number): Session {
  const result = setOutPoint(session.project, ms, { replace: true });
  if (result.error) return { ...session, error: result.error };
  return { ...session, project: result.project, error: null };
}

export function applyClearInOut(session: Session): Session {
  return { ...session, project: clearInOut(session.project), status: "IN/OUT cleared", error: null };
}

export function applyMarker(session: Session): Session {
  const next = addMarker(session.project, session.project.playheadMs);
  const added = next.markers[next.markers.length - 1];
  return {
    ...withClipSelection(withHistory(session, next, "Marker added"), []),
    selectedMarkerId: added?.id ?? null,
  };
}

export function applyCopy(session: Session): Session {
  const ids = selectionOf(session);
  const clips = ids
    .map((id) => clipById(session.project, id))
    .filter((c): c is Clip => Boolean(c));
  if (clips.length === 0) return { ...session, error: "No clip selected to copy" };
  return {
    ...session,
    clipboard: clips.map((c) => ({ ...c })),
    status: clips.length > 1 ? "Copied clips" : "Copied clip",
    error: null,
  };
}

/** Copy then lift-delete the selection. One history entry. */
export function applyCut(session: Session): Session {
  const ids = selectionOf(session);
  const copied = applyCopy(session);
  if (copied.error || copied.clipboard.length === 0) {
    return { ...session, error: copied.error ?? "No clip selected to cut" };
  }
  const next = deleteClips(session.project, ids);
  return withClipSelection(
    withHistory(
      { ...copied, project: session.project },
      next,
      ids.length > 1 ? "Cut clips" : "Cut clip",
    ),
    [],
  );
}

export function applyPaste(session: Session): Session {
  if (session.clipboard.length === 0) return { ...session, error: "Clipboard empty" };
  const result = pasteClips(session.project, session.clipboard, session.project.playheadMs);
  if (result.error) return { ...session, error: result.error };
  const many = result.clipIds.length > 1;
  return withClipSelection(
    withHistory(session, result.project, many ? "Pasted clips" : "Pasted clip"),
    result.clipIds,
  );
}

export function applySlip(
  session: Session,
  clipId: string,
  deltaMs: number,
  clipIds?: readonly string[],
): Session {
  const ids = clipIds && clipIds.length > 0 ? [...clipIds] : [clipId];
  if (clipId && ids.includes(clipId)) {
    ids.splice(ids.indexOf(clipId), 1);
    ids.unshift(clipId);
  }
  const result = slipClips(session.project, ids, deltaMs);
  if (result.error) return { ...session, error: result.error };
  if (result.project === session.project) return session;
  return withHistory(session, result.project, ids.length > 1 ? "Slipped clips" : "Slipped clip");
}

export function applyUnlinkClips(session: Session, clipId: string): Session {
  const result = unlinkClips(session.project, clipId);
  if (result.error) return { ...session, error: result.error };
  if (result.project === session.project) return session;
  return withHistory(session, result.project, "Unlinked clips");
}

export function applySlideClip(
  session: Session,
  clipId: string,
  deltaMs: number,
  clipIds?: readonly string[],
): Session {
  const ids = clipIds && clipIds.length > 0 ? clipIds : [clipId];
  const result = slideClips(session.project, ids, deltaMs);
  if (result.error) return { ...session, error: result.error };
  if (result.project === session.project) return session;
  return withHistory(session, result.project, ids.length > 1 ? "Slid clips" : "Slid clip");
}

export function applyUpdateClip(
  session: Session,
  clipId: string,
  patch: Parameters<typeof updateClip>[2],
): Session {
  const result = updateClip(session.project, clipId, patch);
  if (result.error) return { ...session, error: result.error };
  return withHistory(session, result.project, "Clip updated");
}

export function applySetClipFades(
  session: Session,
  clipId: string,
  fadeInMs: number,
  fadeOutMs: number,
): Session {
  const result = updateClip(session.project, clipId, { fadeInMs, fadeOutMs });
  if (result.error) return { ...session, error: result.error };
  return withHistory(session, result.project, "Clip fades");
}

export function applySetClipRate(session: Session, clipId: string, rate: number): Session {
  const result = setClipRate(session.project, clipId, rate);
  if (result.error) return { ...session, error: result.error };
  if (result.project === session.project) return session;
  return withHistory(session, result.project, "Clip rate");
}

export function applyLiftRange(session: Session): Session {
  if (!editRangeOf(session.project)) return session;
  const result = liftRange(session.project);
  if (result.project === session.project) return session;
  return withClipSelection(withHistory(session, result.project, "Lifted range"), []);
}

export function applyExtractRange(session: Session): Session {
  if (!editRangeOf(session.project)) return session;
  const result = extractRange(session.project);
  if (result.project === session.project) return session;
  return withClipSelection(withHistory(session, result.project, "Extracted range"), []);
}

export function applyDelete(session: Session): Session {
  const ids = selectionOf(session);
  if (ids.length > 0) {
    const next = deleteClips(session.project, ids);
    return withClipSelection(
      withHistory(session, next, ids.length > 1 ? "Clips deleted" : "Clip deleted"),
      [],
    );
  }
  if (session.selectedMarkerId) {
    const result = deleteMarker(session.project, session.selectedMarkerId);
    if (result.error) return { ...session, error: result.error };
    return { ...withHistory(session, result.project, "Marker deleted"), selectedMarkerId: null };
  }
  if (editRangeOf(session.project)) return applyLiftRange(session);
  return { ...session, error: "No clip selected" };
}

export function applyRippleDelete(session: Session): Session {
  const ids = selectionOf(session);
  if (ids.length > 0) {
    const next = rippleDeleteClips(session.project, ids);
    return withClipSelection(withHistory(session, next, "Ripple deleted"), []);
  }
  if (editRangeOf(session.project)) return applyExtractRange(session);
  return { ...session, error: "No clip selected" };
}

export function applyNudge(session: Session, deltaMs: number): Session {
  const ids = selectionOf(session);
  if (ids.length === 0) return { ...session, error: "No clip selected" };
  const result = moveClipsByDelta(session.project, ids, deltaMs);
  if (result.error) return { ...session, error: result.error };
  const verb = deltaMs < 0 ? "Nudged left" : "Nudged right";
  return withHistory(session, result.project, verb);
}

export function applyDeleteMarker(session: Session, markerId: string): Session {
  const result = deleteMarker(session.project, markerId);
  if (result.error) return { ...session, error: result.error };
  return {
    ...withHistory(session, result.project, "Marker deleted"),
    selectedMarkerId: session.selectedMarkerId === markerId ? null : session.selectedMarkerId,
  };
}

export function applyMoveMarker(session: Session, markerId: string, timeMs: number): Session {
  const result = moveMarker(session.project, markerId, timeMs);
  if (result.error) return { ...session, error: result.error };
  return {
    ...withClipSelection(session, []),
    project: result.project,
    selectedMarkerId: markerId,
    error: null,
  };
}

export function applyPlayhead(session: Session, timeMs: number): Session {
  return { ...session, project: setPlayhead(session.project, timeMs) };
}

export function applyToggleLoop(session: Session): Session {
  return { ...session, project: toggleLoop(session.project) };
}

export function applyToggleSnap(session: Session): Session {
  return { ...session, project: toggleSnap(session.project) };
}

export function applyTrackVolume(session: Session, trackId: TrackId, volume: number): Session {
  return {
    ...session,
    project: setTrackVolume(session.project, trackId, volume),
    status: `${trackId} ${formatDb(linearToDb(volume))}`,
    error: null,
  };
}

export function applySetTrackPan(session: Session, trackId: TrackId, pan: number): Session {
  return {
    ...session,
    project: setTrackPan(session.project, trackId, pan),
    status: `${trackId} ${formatPan(pan)}`,
    error: null,
  };
}

export function applyMasterVolume(session: Session, volume: number): Session {
  return {
    ...session,
    project: setMasterVolume(session.project, volume),
    status: `Master ${formatDb(linearToDb(volume))}`,
    error: null,
  };
}

export function applyToggleMute(session: Session, trackId: TrackId): Session {
  const next = toggleTrackMute(session.project, trackId);
  const track = next.tracks.find((t) => t.id === trackId);
  const verb = track?.muted ? "Muted" : "Unmuted";
  return { ...session, project: next, status: `${verb} ${trackId}`, error: null };
}

export function applyToggleSolo(session: Session, trackId: TrackId): Session {
  const next = toggleTrackSolo(session.project, trackId);
  const track = next.tracks.find((t) => t.id === trackId);
  const verb = track?.solo ? "Solo" : "Unsolo";
  return { ...session, project: next, status: `${verb} ${trackId}`, error: null };
}

export function applyPlay(session: Session): Session {
  return { ...session, playing: true, shuttleRate: 1, status: "Playing", error: null };
}

export function applyPause(session: Session): Session {
  return { ...session, playing: false, shuttleRate: 0, status: "Paused", error: null };
}

export function applyStop(session: Session): Session {
  return applyPlayhead(
    { ...session, playing: false, shuttleRate: 0, status: "Stopped", error: null },
    session.project.inPointMs ?? 0,
  );
}

export function applyPlayPause(session: Session): Session {
  return session.playing || session.shuttleRate !== 0 ? applyPause(session) : applyPlay(session);
}

export function applyShuttle(session: Session, dir: -1 | 0 | 1): Session {
  const rate = nextShuttleRate(session.shuttleRate, dir);
  if (rate === 0) {
    return { ...session, playing: false, shuttleRate: 0, status: "Paused", error: null };
  }
  const label = rate < 0 ? `Shuttle ${rate}x` : `Shuttle +${rate}x`;
  return { ...session, playing: true, shuttleRate: rate, status: label, error: null };
}

export function applyToggleVisualizerMute(session: Session): Session {
  const next = toggleVisualizerMute(session.project);
  const verb = next.visualizer.muted ? "Muted" : "Unmuted";
  return { ...session, project: next, status: `${verb} VIS`, error: null };
}

export function applyCycleVisualizerScene(session: Session): Session {
  const next = cycleVisualizerScene(session.project);
  return {
    ...session,
    project: next,
    status: `Visualizer ${next.visualizer.sceneId}`,
    error: null,
  };
}

export function applySelect(
  session: Session,
  clipId: string | null,
  opts?: { toggle?: boolean },
): Session {
  if (clipId == null) {
    return { ...withClipSelection(session, []), selectedMarkerId: null };
  }
  if (opts?.toggle) {
    const current = selectionOf(session);
    const next = current.includes(clipId)
      ? current.filter((id) => id !== clipId)
      : [clipId, ...current];
    return { ...withClipSelection(session, next), selectedMarkerId: null };
  }
  return { ...withClipSelection(session, [clipId]), selectedMarkerId: null };
}

/** Marquee / multi-select. Union keeps existing ids (Shift+marquee). */
export function applySelectClips(
  session: Session,
  clipIds: readonly string[],
  opts?: { union?: boolean },
): Session {
  if (opts?.union) {
    const next = [...selectionOf(session)];
    for (const id of clipIds) {
      if (!next.includes(id)) next.push(id);
    }
    return { ...withClipSelection(session, next), selectedMarkerId: null };
  }
  return { ...withClipSelection(session, [...clipIds]), selectedMarkerId: null };
}

export function applySelectMarker(session: Session, markerId: string | null): Session {
  if (markerId) {
    return { ...withClipSelection(session, []), selectedMarkerId: markerId };
  }
  return { ...session, selectedMarkerId: null };
}

export function applyZoom(session: Session, zoomPxPerSec: number, timelineWidthPx = 1000): Session {
  const minZ = minZoomPxPerSec(session.project, timelineWidthPx);
  const zoomOld = session.project.zoomPxPerSec;
  const zoomNew = clampZoomPxPerSec(zoomPxPerSec, minZ);
  return {
    ...session,
    project: {
      ...session.project,
      zoomPxPerSec: zoomNew,
      scrollMs: scrollZoomAroundPlayhead({
        playheadMs: session.project.playheadMs,
        scrollMs: session.project.scrollMs,
        zoomOld,
        zoomNew,
        timelineWidthPx,
      }),
    },
  };
}

/** Fit the whole project in the lane and reset scroll to t=0. */
export function applyFit(session: Session, timelineWidthPx: number): Session {
  const z = fitZoomPxPerSec(session.project, timelineWidthPx);
  const minZ = minZoomPxPerSec(session.project, timelineWidthPx);
  return {
    ...session,
    project: {
      ...session.project,
      zoomPxPerSec: clampZoomPxPerSec(z, minZ),
      scrollMs: 0,
    },
    status: "Fit timeline",
    error: null,
  };
}

export function applyScroll(session: Session, scrollMs: number): Session {
  return { ...session, project: { ...session.project, scrollMs: Math.max(0, scrollMs) } };
}

export function openSerialized(session: Session, text: string): Session {
  const project = deserializeProject(text);
  return {
    ...session,
    project,
    history: createHistory(),
    selectedClipId: null,
    selectedClipIds: [],
    selectedMarkerId: null,
    status: `Opened ${project.name}`,
    error: null,
    playing: false,
    shuttleRate: 0,
  };
}

export async function hydrateSession(session: Session): Promise<Session> {
  const project = await hydrateProject(session.project, session.store);
  const missing = project.assets.filter((a) => a.missing);
  return {
    ...session,
    project,
    status: missing.length ? `${missing.length} media file(s) missing` : session.status,
    error: missing.length ? missing.map((a) => `missing:${a.name}`).join(" · ") : session.error,
  };
}

export function projectJson(session: Session): string {
  return serializeProject(session.project);
}

export function defaultTrackHint(kind: "video" | "audio"): TrackId {
  return defaultTrackForKind(kind);
}
