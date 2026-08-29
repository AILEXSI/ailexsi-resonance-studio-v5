import type { MediaKind, TrackId, VisualizerSceneId } from "../models";

export interface ExportClip {
  id: string;
  trackId: TrackId;
  kind: MediaKind;
  startMs: number;
  endMs: number;
  sourceUrl: string;
  sourceInMs: number;
  sourceOutMs: number;
  gain: number;
  missing: boolean;
  label: string;
}

export interface ExportTrack {
  id: TrackId;
  kind: MediaKind;
  clips: ExportClip[];
}

export interface ExportVisualizer {
  enabled: boolean;
  muted: boolean;
  sceneId: VisualizerSceneId;
}

export interface ExportJob {
  id: string;
  projectId: string;
  projectName: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  fileName: string;
  tracks: ExportTrack[];
  visualizer: ExportVisualizer;
}

export interface ExportProgress {
  percent: number;
  stage: string;
  currentTimeMs?: number;
}

export type ExportAudioKind = "aac" | "none";

export interface ExportResult {
  success: boolean;
  error?: string;
  fileName: string;
  durationMs: number;
  fileSizeBytes: number;
  mimeType?: string;
  blob?: Blob;
  brands?: string[];
  audio?: ExportAudioKind;
}

export interface ExportHooks {
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}
