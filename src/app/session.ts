import { unlinkClips } from "../core/link";
import { resolveEditPair, upsertTransition, type Transition } from "../core/transition";
import { classifyFile, importMediaFile, ImportError, defaultTrackForKind, type ProbeFn } from "../core/media";
import {
  clipById,
  kindOfTrack,
  type Clip,
  type FrontVideoTrackId,
  type MediaKind,
  type Project,
  type TrackId,
} from "../core/models";
import { relinkClipsOnProject, relinkSelectionOf } from "../core/relink";
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
  closeGapOnTrack,
  collectSnapTargets,
  collectVisEventSnapTargets,
  createHistory,
  resolveCloseGapTrack,
  playheadStrictlyInsideClip,
  resolveRippleTrimToPlayheadClip,
  nextEditPointMs,
  prevEditPointMs,
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
import {
  cycleVisualizerScene,
  deleteVisualizerEvent,
  insertVisualizerEvent,
  moveVisualizerEvent,
  pasteVisualizerEvent,
  setVisualizer,
  stretchVisualizerEvent,
  toggleVisualizerMute,
  updateVisualizerEvent,
  visEventClipboardOf,
  visualizerEventsOf,
  type VisEventClipboard,
} from "../core/visualizer";
import type { VisualizerState } from "../core/models";
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
  /** VIS overlay selected for inspector (not a TrackId / clip). */
  selectedVis: boolean;
  /** Selected VIS event id. Null = fallback sceneId+window. */
  selectedVisEventId: string | null;
  /** Last plain-clicked clip. Shift+click ranges from here. View state only. */
  selectionAnchorClipId: string | null;
  /** Snapshot of copied clips. Empty = none. One-clip copy is a single-item array. */
  clipboard: Clip[];
  /** VIS event copy. Separate from clip clipboard. */
  visClipboard: VisEventClipboard | null;
  /** Which clipboard Ctrl+V prefers when no clip is selected. */
  lastClipboardKind: "clip" | "vis" | null;
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
    selectedVis: false,
    selectedVisEventId: null,
    selectionAnchorClipId: null,
    clipboard: [],
    visClipboard: null,
    lastClipboardKind: null,
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
    selectedVis: false,
    selectedVisEventId: null,
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

export function applyCloseGap(session: Session): Session {
  const trackId = resolveCloseGapTrack(session.project, {
    selectedClipId: session.selectedClipId,
    selectedVis: session.selectedVis,
  });
  if (!trackId) return session;
  const result = closeGapOnTrack(session.project, trackId, session.project.playheadMs);
  if ("unchanged" in result) return session;
  if ("error" in result) return session;
  const playheadMs = session.project.playheadMs;
  if (result.project.playheadMs !== playheadMs) {
    return withHistory(
      session,
      { ...result.project, playheadMs },
      "Closed gap",
    );
  }
  return withHistory(session, result.project, "Closed gap");
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

export function applyRippleTrimToPlayhead(session: Session, edge: "in" | "out"): Session {
  const clip = resolveRippleTrimToPlayheadClip(session.project, {
    selectedClipId: session.selectedClipId,
    selectedVis: session.selectedVis,
  });
  if (!clip) return session;
  const playheadMs = session.project.playheadMs;
  if (!playheadStrictlyInsideClip(clip, playheadMs)) return session;
  let next = applyRippleTrim(session, clip.id, edge, playheadMs);
  if (next.project.playheadMs !== playheadMs) {
    next = { ...next, project: { ...next.project, playheadMs } };
  }
  if (clipById(next.project, clip.id) && next.selectedClipId !== clip.id) {
    return {
      ...next,
      selectedClipId: clip.id,
      selectedClipIds: [clip.id],
      selectedVis: false,
      selectedVisEventId: null,
    };
  }
  return next;
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

function selectedVisEvent(session: Session) {
  if (selectionOf(session).length > 0) return undefined;
  if (!session.selectedVisEventId) return undefined;
  return visualizerEventsOf(session.project).find((e) => e.id === session.selectedVisEventId);
}

function shouldPasteVisEvent(session: Session): boolean {
  if (!session.visClipboard) return false;
  if (selectionOf(session).length > 0) return false;
  if (session.selectedVisEventId || session.selectedVis) return true;
  return session.lastClipboardKind === "vis";
}

export function applyCopy(session: Session): Session {
  const vis = selectedVisEvent(session);
  if (vis) {
    return {
      ...session,
      visClipboard: visEventClipboardOf(vis),
      lastClipboardKind: "vis",
      status: "Copied VIS event",
      error: null,
    };
  }
  const ids = selectionOf(session);
  const clips = ids
    .map((id) => clipById(session.project, id))
    .filter((c): c is Clip => Boolean(c));
  if (clips.length === 0) return { ...session, error: "No clip selected to copy" };
  return {
    ...session,
    clipboard: clips.map((c) => ({ ...c })),
    lastClipboardKind: "clip",
    status: clips.length > 1 ? "Copied clips" : "Copied clip",
    error: null,
  };
}

/** Copy then lift-delete the selection. One history entry. */
export function applyCut(session: Session): Session {
  const vis = selectedVisEvent(session);
  if (vis) {
    const copied = applyCopy(session);
    const next = deleteVisualizerEvent(session.project, vis.id);
    return {
      ...withHistory(copied, next, "Cut VIS event"),
      selectedVisEventId: null,
      selectedVis: true,
    };
  }
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
  if (shouldPasteVisEvent(session) && session.visClipboard) {
    const { project, event } = pasteVisualizerEvent(
      session.project,
      session.visClipboard,
      session.project.playheadMs,
    );
    return {
      ...withHistory(session, project, "Pasted VIS event"),
      selectedClipId: null,
      selectedClipIds: [],
      selectedMarkerId: null,
      selectedVis: true,
      selectedVisEventId: event.id,
      selectionAnchorClipId: null,
    };
  }
  if (selectionOf(session).length === 0 && (session.selectedVisEventId || session.selectedVis)) {
    return { ...session, error: "Clipboard empty" };
  }
  if (session.clipboard.length === 0) return { ...session, error: "Clipboard empty" };
  const result = pasteClips(session.project, session.clipboard, session.project.playheadMs);
  if (result.error) return { ...session, error: result.error };
  const many = result.clipIds.length > 1;
  return withClipSelection(
    withHistory(session, result.project, many ? "Pasted clips" : "Pasted clip"),
    result.clipIds,
  );
}

/** Clone the selection at the playhead. Does not write `session.clipboard`. */
export function applyDuplicate(session: Session): Session {
  const ids = selectionOf(session);
  const clips = ids
    .map((id) => clipById(session.project, id))
    .filter((c): c is Clip => Boolean(c));
  if (clips.length === 0) return session;
  const result = pasteClips(
    session.project,
    clips.map((c) => ({ ...c })),
    session.project.playheadMs,
  );
  if (result.error) return { ...session, error: result.error };
  const many = result.clipIds.length > 1;
  return withClipSelection(
    withHistory(session, result.project, many ? "Duplicated clips" : "Duplicated clip"),
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

export async function ingestRelinkFile(
  session: Session,
  file: File,
  expectedKind: MediaKind,
  probe?: ProbeFn,
): Promise<{ session: Session; assetId: string } | { error: string }> {
  try {
    const kind = classifyFile(file);
    if (kind !== expectedKind) {
      return { error: `Relink rejected: expected ${expectedKind}, got ${kind}` };
    }
    const asset = await importMediaFile(file, probe);
    if (asset.kind !== expectedKind) {
      return { error: `Relink rejected: expected ${expectedKind}, got ${asset.kind}` };
    }
    await persistAssetBlob(session.store, asset, file);
    const project = {
      ...session.project,
      assets: [...session.project.assets, asset],
      updatedAt: new Date().toISOString(),
    };
    return { session: { ...session, project, error: null }, assetId: asset.id };
  } catch (e) {
    if (e instanceof ImportError) return { error: e.message };
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function applyRelinkClips(
  session: Session,
  clipIds: readonly string[],
  assetId: string,
): Session {
  const sel = relinkSelectionOf(session.project, clipIds);
  if (!sel) return session;
  const result = relinkClipsOnProject(session.project, sel.clipIds, assetId);
  if ("unchanged" in result) return session;
  if ("error" in result) return { ...session, error: result.error, status: "Relink failed" };
  return withHistory(session, result.project, sel.clipIds.length > 1 ? "Relinked clips" : "Relinked clip");
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

export function applySetTransition(
  session: Session,
  patch: Partial<Pick<Transition, "type" | "durationMs" | "audioMode" | "audioDurationMs" | "startMs">>,
): Session {
  const pair = resolveEditPair(session.project, selectionOf(session));
  if (!pair) return session;
  const { project } = upsertTransition(session.project, pair, patch);
  return withHistory(session, project, "Set transition");
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
  if (session.selectedVisEventId) {
    const next = deleteVisualizerEvent(session.project, session.selectedVisEventId);
    if (next === session.project) return session;
    return {
      ...withHistory(session, next, "Deleted VIS event"),
      selectedVisEventId: null,
      selectedVis: true,
    };
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
  if (session.selectedVisEventId) return applyDelete(session);
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

export function applyGotoNextEdit(session: Session): Session {
  const next = nextEditPointMs(session.project, session.project.playheadMs);
  if (next == null) return session;
  return applyPlayhead(session, next);
}

export function applyGotoPrevEdit(session: Session): Session {
  const prev = prevEditPointMs(session.project, session.project.playheadMs);
  if (prev == null) return session;
  return applyPlayhead(session, prev);
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
  const eventId = session.selectedVisEventId;
  const next = cycleVisualizerScene(session.project, eventId);
  const event = eventId ? visualizerEventsOf(next).find((e) => e.id === eventId) : undefined;
  return {
    ...session,
    project: next,
    status: `Visualizer ${event?.sceneId ?? next.visualizer.sceneId}`,
    error: null,
  };
}

export function applySelectVis(session: Session): Session {
  return {
    ...session,
    selectedClipId: null,
    selectedClipIds: [],
    selectedMarkerId: null,
    selectedVis: true,
    selectedVisEventId: null,
    selectionAnchorClipId: null,
  };
}

export function applySelectVisEvent(session: Session, eventId: string): Session {
  const event = visualizerEventsOf(session.project).find((e) => e.id === eventId);
  if (!event) return applySelectVis(session);
  return {
    ...session,
    selectedClipId: null,
    selectedClipIds: [],
    selectedMarkerId: null,
    selectedVis: true,
    selectedVisEventId: event.id,
    selectionAnchorClipId: null,
  };
}

export function applyInsertVisEvent(session: Session): Session {
  const { project, event, inserted } = insertVisualizerEvent(
    session.project,
    session.project.playheadMs,
  );
  if (!inserted) return applySelectVisEvent(session, event.id);
  return {
    ...withHistory(session, project, "VIS event"),
    selectedClipId: null,
    selectedClipIds: [],
    selectedMarkerId: null,
    selectedVis: true,
    selectedVisEventId: event.id,
    selectionAnchorClipId: null,
  };
}

export function applyMoveVisEvent(session: Session, eventId: string, startMs: number): Session {
  const snapped = session.project.snap
    ? snapTime(startMs, collectVisEventSnapTargets(session.project, eventId)).timeMs
    : startMs;
  const project = moveVisualizerEvent(session.project, eventId, snapped);
  if (project === session.project) return session;
  return {
    ...withHistory(session, project, "Moved VIS event"),
    selectedVis: true,
    selectedVisEventId: eventId,
    selectedClipId: null,
    selectedClipIds: [],
  };
}

export function applyStretchVisEvent(
  session: Session,
  eventId: string,
  edge: "in" | "out",
  nextEdgeMs: number,
): Session {
  const snapped = session.project.snap
    ? snapTime(nextEdgeMs, collectVisEventSnapTargets(session.project, eventId)).timeMs
    : nextEdgeMs;
  const project = stretchVisualizerEvent(session.project, eventId, edge, snapped);
  if (project === session.project) return session;
  return {
    ...withHistory(session, project, "Stretched VIS event"),
    selectedVis: true,
    selectedVisEventId: eventId,
    selectedClipId: null,
    selectedClipIds: [],
  };
}

export function applySetFrontVideoTrack(session: Session, trackId: FrontVideoTrackId): Session {
  const next = trackId === "V1" ? "V1" : "V2";
  const current = session.project.frontVideoTrackId === "V1" ? "V1" : "V2";
  if (current === next) return session;
  return withHistory(
    session,
    { ...session.project, frontVideoTrackId: next, updatedAt: new Date().toISOString() },
    `Front ${next}`,
  );
}

export function applySetVisualizer(
  session: Session,
  patch: Partial<Pick<VisualizerState, "sceneId" | "startMs" | "durationMs">>,
): Session {
  if (session.selectedVisEventId) {
    const project = updateVisualizerEvent(session.project, session.selectedVisEventId, patch);
    const event = visualizerEventsOf(project).find((e) => e.id === session.selectedVisEventId);
    return {
      ...session,
      project,
      status: `Visualizer ${event?.sceneId ?? project.visualizer.sceneId}`,
      error: null,
    };
  }
  const project = setVisualizer(session.project, patch);
  return {
    ...session,
    project,
    status: `Visualizer ${project.visualizer.sceneId}`,
    error: null,
  };
}

function compareClipOrder(a: Clip, b: Clip): number {
  return a.startMs - b.startMs || a.id.localeCompare(b.id);
}

function earliestSelectedClipId(session: Session): string | null {
  const clips = selectionOf(session)
    .map((id) => clipById(session.project, id))
    .filter((c): c is Clip => !!c)
    .sort(compareClipOrder);
  return clips[0]?.id ?? null;
}

/** Inclusive same-track range. Empty when tracks/kinds differ. VIS is not a clip. */
export function clipsInShiftRange(project: Project, fromId: string, toId: string): string[] {
  const from = clipById(project, fromId);
  const to = clipById(project, toId);
  if (!from || !to) return [];
  if (from.trackId !== to.trackId) return [];
  if (kindOfTrack(from.trackId) !== kindOfTrack(to.trackId)) return [];
  const onTrack = project.clips.filter((c) => c.trackId === from.trackId).sort(compareClipOrder);
  const i = onTrack.findIndex((c) => c.id === from.id);
  const j = onTrack.findIndex((c) => c.id === to.id);
  if (i < 0 || j < 0) return [];
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  return onTrack.slice(lo, hi + 1).map((c) => c.id);
}

export function applySelect(
  session: Session,
  clipId: string | null,
  opts?: { toggle?: boolean; range?: boolean },
): Session {
  if (clipId == null) {
    return { ...withClipSelection(session, []), selectedMarkerId: null, selectionAnchorClipId: null };
  }
  if (opts?.range) {
    const clicked = clipById(session.project, clipId);
    if (!clicked) return session;
    const stored = session.selectionAnchorClipId;
    const anchorId =
      stored && clipById(session.project, stored) ? stored : earliestSelectedClipId(session);
    if (!anchorId) {
      return {
        ...withClipSelection(session, [clipId]),
        selectedMarkerId: null,
        selectionAnchorClipId: clipId,
      };
    }
    const ids = clipsInShiftRange(session.project, anchorId, clipId);
    if (ids.length === 0) return session;
    return {
      ...withClipSelection(session, ids),
      selectedMarkerId: null,
      selectionAnchorClipId: stored ?? anchorId,
    };
  }
  if (opts?.toggle) {
    const current = selectionOf(session);
    const hadNone = current.length === 0;
    const next = current.includes(clipId)
      ? current.filter((id) => id !== clipId)
      : [clipId, ...current];
    const anchor = hadNone ? clipId : session.selectionAnchorClipId;
    return { ...withClipSelection(session, next), selectedMarkerId: null, selectionAnchorClipId: anchor };
  }
  return { ...withClipSelection(session, [clipId]), selectedMarkerId: null, selectionAnchorClipId: clipId };
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
    selectedVis: false,
    selectedVisEventId: null,
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
