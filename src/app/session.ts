import { createId } from "../core/ids";
import { importMediaFile, ImportError, defaultTrackForKind, type ProbeFn } from "../core/media";
import type { Clip, Project, TrackId } from "../core/models";
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
  collectSnapTargets,
  createHistory,
  deleteClip,
  duplicateClip,
  moveClip,
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
  toggleTrackMute,
  trimClip,
  undo as undoHistory,
  updateClip,
  type HistoryStack,
} from "../core/timeline";

export interface Session {
  project: Project;
  history: HistoryStack;
  selectedClipId: string | null;
  clipboard: Clip | null;
  targetTrackId: TrackId;
  status: string;
  error: string | null;
  playing: boolean;
  store: BlobStore;
}

export function createSession(store?: BlobStore): Session {
  return {
    project: createEmptyProject(),
    history: createHistory(),
    selectedClipId: null,
    clipboard: null,
    targetTrackId: "V1",
    status: "New project",
    error: null,
    playing: false,
    store: store ?? createIndexedDbBlobStore(),
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
        next.project.playheadMs,
      );
      if (placed.error || !placed.clip) {
        errors.push(placed.error ?? "Place failed");
        continue;
      }
      await persistAssetBlob(next.store, asset, file);
      next = {
        ...withHistory(next, placed.project, `Imported ${asset.name}`),
        selectedClipId: placed.clip.id,
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
    error: errors.length ? errors.join(" · ") : null,
    status: errors.length ? `Imported ${imported}, ${errors.length} failed` : `Imported ${imported} file(s)`,
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

export function applySplit(session: Session): Session {
  const result = splitAtPlayhead(session.project);
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

export function applyClearInOut(session: Session): Session {
  return { ...session, project: clearInOut(session.project), status: "IN/OUT cleared", error: null };
}

export function applyMarker(session: Session): Session {
  return withHistory(session, addMarker(session.project, session.project.playheadMs), "Marker added");
}

export function applyCopy(session: Session): Session {
  const clip = session.project.clips.find((c) => c.id === session.selectedClipId);
  if (!clip) return { ...session, error: "No clip selected to copy" };
  return { ...session, clipboard: clip, status: "Copied clip", error: null };
}

export function applyPaste(session: Session): Session {
  if (!session.clipboard) return { ...session, error: "Clipboard empty" };
  const result = duplicateClip(session.project, session.clipboard.id, session.project.playheadMs);
  if (result.error || !result.clip) {
    const placed = {
      ...session.clipboard,
      startMs: Math.max(0, session.project.playheadMs),
    };
    const copy = duplicateFromClipboard(session.project, placed);
    return {
      ...withHistory(session, copy.project, "Pasted clip"),
      selectedClipId: copy.clipId,
    };
  }
  return {
    ...withHistory(session, result.project, "Pasted clip"),
    selectedClipId: result.clip.id,
  };
}

function duplicateFromClipboard(project: Project, clip: Clip): { project: Project; clipId: string } {
  const next = { ...clip, id: createId("clip") };
  return {
    project: { ...project, clips: [...project.clips, next], updatedAt: new Date().toISOString() },
    clipId: next.id,
  };
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

export function applyDelete(session: Session): Session {
  if (!session.selectedClipId) return { ...session, error: "No clip selected" };
  const next = deleteClip(session.project, session.selectedClipId);
  return { ...withHistory(session, next, "Clip deleted"), selectedClipId: null };
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

export function applyToggleMute(session: Session, trackId: TrackId): Session {
  const next = toggleTrackMute(session.project, trackId);
  const track = next.tracks.find((t) => t.id === trackId);
  const verb = track?.muted ? "Muted" : "Unmuted";
  return { ...session, project: next, status: `${verb} ${trackId}`, error: null };
}

export function applySelect(session: Session, clipId: string | null): Session {
  return { ...session, selectedClipId: clipId };
}

export function applyZoom(session: Session, zoomPxPerSec: number): Session {
  return { ...session, project: { ...session.project, zoomPxPerSec: Math.max(10, Math.min(400, zoomPxPerSec)) } };
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
    status: `Opened ${project.name}`,
    error: null,
    playing: false,
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
