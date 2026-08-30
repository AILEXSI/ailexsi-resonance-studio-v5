import type { Transition } from "./transition";

export type MediaKind = "video" | "audio" | "image";
export type TrackId = "V1" | "V2" | "A1" | "A2";

/**
 * Visualz Canvas-2D builtin scene ids (ported from @ailexsi/visualz 0.1.0-blueprint).
 * VIS is an overlay lane, not a TrackId.
 */
export const VISUALIZER_SCENE_IDS = [
  "pulse-orb",
  "spectrum-bars",
  "particle-field",
  "resonance-wave",
  "tunnel-spiral",
  "lita-bloom",
] as const;

export type VisualizerSceneId = (typeof VISUALIZER_SCENE_IDS)[number];

/** Visualz signature scene. New projects and missing-visualizer loads use this. */
export const DEFAULT_VISUALIZER_SCENE_ID: VisualizerSceneId = "resonance-wave";

export interface VisualizerEvent {
  id: string;
  sceneId: VisualizerSceneId;
  startMs: number;
  durationMs: number;
}

export interface VisualizerState {
  enabled: boolean;
  muted: boolean;
  sceneId: VisualizerSceneId;
  /** Overlay from-to on the timeline. durationMs <= 0 = whole timeline. Not a TrackId. */
  startMs?: number;
  durationMs?: number;
  /** Scene clips on the VIS lane. Empty = use sceneId + window. Not TrackId clips. */
  events?: VisualizerEvent[];
}

export function defaultVisualizer(): VisualizerState {
  return {
    enabled: true,
    muted: false,
    sceneId: DEFAULT_VISUALIZER_SCENE_ID,
    startMs: 0,
    durationMs: 0,
    events: [],
  };
}

export type FrontVideoTrackId = "V1" | "V2";

export function isFrontVideoTrackId(value: unknown): value is FrontVideoTrackId {
  return value === "V1" || value === "V2";
}

export function isVisualizerSceneId(value: unknown): value is VisualizerSceneId {
  return typeof value === "string" && (VISUALIZER_SCENE_IDS as readonly string[]).includes(value);
}

export const TRACK_IDS: TrackId[] = ["V1", "V2", "A1", "A2"];

export function kindOfTrack(id: TrackId): "video" | "audio" {
  return id === "V1" || id === "V2" ? "video" : "audio";
}

/** Picture assets sit on V1/V2. Images have no audio. */
export function isPictureKind(kind: MediaKind): boolean {
  return kind === "video" || kind === "image";
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
  /** True when a video file also has decodable audio. Missing on legacy assets. */
  hasAudio?: boolean;
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
  /** Linear fade-in length. 0 = none. Clamped to duration; scaled if fadeIn+fadeOut would overlap. */
  fadeInMs: number;
  /** Linear fade-out length. 0 = none. */
  fadeOutMs: number;
  /** Playback rate. 1 = unity. Source window stays; durationMs = (sourceOut−sourceIn) / rate. */
  rate: number;
  /** Shared id for a linked A/V pair. Missing = unlinked (legacy). */
  linkId?: string;
  /** False = skip picture and mix. Missing = enabled. */
  enabled?: boolean;
}

export function clipIsEnabled(clip: { enabled?: boolean }): boolean {
  return clip.enabled !== false;
}

export interface Track {
  id: TrackId;
  kind: "video" | "audio";
  name: string;
  muted: boolean;
  /** When any track is soloed, only soloed tracks are audible. Mute still wins. */
  solo: boolean;
  /** Linear track fader. 1 = 0 dB unity. 0 = silence. */
  volume: number;
  /** Stereo pan. −1 = hard L, 0 = center, +1 = hard R. Master has no pan. */
  pan: number;
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
  /** Edit-point objects. Missing/empty = hard cuts. Not React state. */
  transitions: Transition[];
  playheadMs: number;
  inPointMs: number | null;
  outPointMs: number | null;
  loop: boolean;
  snap: boolean;
  zoomPxPerSec: number;
  scrollMs: number;
  visualizer: VisualizerState;
  /** Which video track covers on overlap. Default V2 (later-on-top). */
  frontVideoTrackId: FrontVideoTrackId;
  /** Linear master fader. 1 = 0 dB unity. */
  masterVolume: number;
}

export const CLIP_RATE_MIN = 0.25;
export const CLIP_RATE_MAX = 4;

export function clampClipRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  return Math.max(CLIP_RATE_MIN, Math.min(CLIP_RATE_MAX, rate));
}

export function clipRateOf(clip: { rate?: number }): number {
  return clampClipRate(clip.rate ?? 1);
}

/** Timeline delta → source delta. Rate 1 is identity. */
export function timelineDeltaToSource(clip: { rate?: number }, deltaTimelineMs: number): number {
  return clipRateOf(clip) * deltaTimelineMs;
}

/** Source delta → timeline delta. Rate 1 is identity. */
export function sourceDeltaToTimeline(clip: { rate?: number }, deltaSourceMs: number): number {
  return deltaSourceMs / clipRateOf(clip);
}

export function sourceSpanMs(clip: { sourceInMs: number; sourceOutMs: number }): number {
  return Math.max(1, clip.sourceOutMs - clip.sourceInMs);
}

export function timelineDurationForRate(sourceSpan: number, rate: number): number {
  return Math.max(1, sourceSpan / clampClipRate(rate));
}

export const SPLIT_EDGE_GUARD_MS = 50;
export const SNAP_THRESHOLD_MS = 80;
export const FRAME_MS = 1000 / 30;

/** mm:ss.cc (centiseconds). */
export function formatTimecode(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${String(m).padStart(2, "0")}:${rem.toFixed(2).padStart(5, "0")}`;
}

/**
 * Parse a Transport timecode. Accepts the printed `mm:ss.cc` form, `m:ss`,
 * `m:ss.cs`, `h:m:ss` (optional fraction), and a raw integer millisecond value.
 * Invalid → null (caller restores the current playhead display).
 */
export function parseTimecode(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const ms = Number(text);
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, Math.round(ms));
  }
  const parts = text.split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [minutes, seconds] = nums as [number, number];
    if (seconds >= 60) return null;
    return Math.max(0, Math.round((minutes * 60 + seconds) * 1000));
  }
  const [hours, minutes, seconds] = nums as [number, number, number];
  if (minutes >= 60 || seconds >= 60) return null;
  return Math.max(0, Math.round((hours * 3600 + minutes * 60 + seconds) * 1000));
}

export function isTrackMuted(project: Project, trackId: TrackId): boolean {
  return project.tracks.find((t) => t.id === trackId)?.muted === true;
}

export function isTrackSoloed(project: Project, trackId: TrackId): boolean {
  return project.tracks.find((t) => t.id === trackId)?.solo === true;
}

export function anyTrackSoloed(project: Project): boolean {
  return project.tracks.some((t) => t.solo);
}

/**
 * Shared audible rule for preview and export.
 * Mute always wins. If any track is soloed, only soloed tracks are audible.
 */
export function isTrackAudible(project: Project, trackId: TrackId): boolean {
  const track = project.tracks.find((t) => t.id === trackId);
  if (!track) return false;
  if (track.muted) return false;
  if (anyTrackSoloed(project) && !track.solo) return false;
  return true;
}

export function trackVolumeOf(project: Project, trackId: TrackId): number {
  const v = project.tracks.find((t) => t.id === trackId)?.volume;
  return v == null || !Number.isFinite(v) ? 1 : Math.max(0, v);
}

export function trackPanOf(project: Project, trackId: TrackId): number {
  const p = project.tracks.find((t) => t.id === trackId)?.pan;
  if (p == null || !Number.isFinite(p)) return 0;
  return Math.max(-1, Math.min(1, p));
}

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
    { id: "V1", kind: "video", name: "V1", muted: false, solo: false, volume: 1, pan: 0 },
    { id: "V2", kind: "video", name: "V2", muted: false, solo: false, volume: 1, pan: 0 },
    { id: "A1", kind: "audio", name: "A1", muted: false, solo: false, volume: 1, pan: 0 },
    { id: "A2", kind: "audio", name: "A2", muted: false, solo: false, volume: 1, pan: 0 },
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
      clipIsEnabled(c) &&
      kindOfTrack(c.trackId) === "video" &&
      timeMs >= c.startMs &&
      timeMs < clipEndMs(c),
  );
  const front = project.frontVideoTrackId === "V1" ? "V1" : "V2";
  return hits.find((c) => c.trackId === front) ?? hits.find((c) => c.trackId === "V1" || c.trackId === "V2");
}

export function audioClipsAt(project: Project, timeMs: number): Clip[] {
  return project.clips.filter(
    (c) =>
      clipIsEnabled(c) &&
      kindOfTrack(c.trackId) === "audio" &&
      isTrackAudible(project, c.trackId) &&
      timeMs >= c.startMs &&
      timeMs < clipEndMs(c),
  );
}

export function clipOnTrackAt(project: Project, trackId: TrackId, timeMs: number): Clip | undefined {
  return project.clips.find(
    (c) =>
      clipIsEnabled(c) &&
      c.trackId === trackId &&
      timeMs >= c.startMs &&
      timeMs < clipEndMs(c),
  );
}

/** Audible clips on V1/V2/A1/A2 under the playhead (picture + mix). Stills have no audio. */
export function mixClipsAt(project: Project, timeMs: number): Clip[] {
  return TRACK_IDS.flatMap((id) => {
    if (!isTrackAudible(project, id)) return [];
    const clip = clipOnTrackAt(project, id, timeMs);
    if (!clip) return [];
    const asset = assetById(project, clip.assetId);
    if (asset?.kind === "image") return [];
    return [clip];
  });
}

export function sourceTimeAt(clip: Clip, timelineMs: number): number {
  const offset = Math.max(0, timelineMs - clip.startMs);
  return clip.sourceInMs + offset * clipRateOf(clip);
}
