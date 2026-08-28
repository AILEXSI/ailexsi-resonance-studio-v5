export type MediaKind = "video" | "audio";
export type TrackId = "V1" | "V2" | "A1" | "A2";

export const TRACK_IDS: TrackId[] = ["V1", "V2", "A1", "A2"];

export function kindOfTrack(id: TrackId): MediaKind {
  return id === "V1" || id === "V2" ? "video" : "audio";
}

export function isTrackId(value: string): value is TrackId {
  return TRACK_IDS.includes(value as TrackId);
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  mimeType: string;
  durationMs: number;
  /** Durable IndexedDB key. Never a blob: URL. */
  blobId: string;
  /** Session-only object URL. Not a durable identity. */
  objectUrl?: string;
  missing: boolean;
  width?: number;
  height?: number;
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: TrackId;
  startMs: number;
  durationMs: number;
  sourceInMs: number;
  sourceOutMs: number;
  gain: number;
}

export interface Track {
  id: TrackId;
  kind: MediaKind;
  name: string;
  muted: boolean;
}

export interface Marker {
  id: string;
  timeMs: number;
  label: string;
}

export interface Project {
  schemaVersion: 5;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  assets: MediaAsset[];
  tracks: Track[];
  clips: Clip[];
  markers: Marker[];
  playheadMs: number;
  inPointMs: number | null;
  outPointMs: number | null;
  loop: boolean;
  snap: boolean;
  zoomPxPerSec: number;
  scrollMs: number;
}

export const SPLIT_EDGE_GUARD_MS = 50;
export const SNAP_THRESHOLD_MS = 80;
export const FRAME_MS = 1000 / 30;

export function clipEndMs(clip: Clip): number {
  return clip.startMs + clip.durationMs;
}

export function projectDurationMs(project: Project): number {
  let max = 0;
  for (const clip of project.clips) {
    max = Math.max(max, clipEndMs(clip));
  }
  for (const marker of project.markers) {
    max = Math.max(max, marker.timeMs);
  }
  if (project.outPointMs != null) max = Math.max(max, project.outPointMs);
  return max;
}

export function defaultTracks(): Track[] {
  return [
    { id: "V1", kind: "video", name: "V1", muted: false },
    { id: "V2", kind: "video", name: "V2", muted: false },
    { id: "A1", kind: "audio", name: "A1", muted: false },
    { id: "A2", kind: "audio", name: "A2", muted: false },
  ];
}

export function assetById(project: Project, id: string): MediaAsset | undefined {
  return project.assets.find((a) => a.id === id);
}

export function clipById(project: Project, id: string): Clip | undefined {
  return project.clips.find((c) => c.id === id);
}

export function clipsOnTrack(project: Project, trackId: TrackId): Clip[] {
  return project.clips.filter((c) => c.trackId === trackId);
}

export function topVideoClipAt(project: Project, timeMs: number): Clip | undefined {
  const hits = project.clips.filter(
    (c) =>
      kindOfTrack(c.trackId) === "video" &&
      timeMs >= c.startMs &&
      timeMs < clipEndMs(c),
  );
  return hits.find((c) => c.trackId === "V2") ?? hits.find((c) => c.trackId === "V1");
}

export function audioClipsAt(project: Project, timeMs: number): Clip[] {
  return project.clips.filter(
    (c) =>
      kindOfTrack(c.trackId) === "audio" &&
      timeMs >= c.startMs &&
      timeMs < clipEndMs(c),
  );
}

export function sourceTimeAt(clip: Clip, timelineMs: number): number {
  const offset = Math.max(0, timelineMs - clip.startMs);
  return clip.sourceInMs + offset;
}
