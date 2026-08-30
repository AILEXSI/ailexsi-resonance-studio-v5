import { createId } from "./ids";
import { normalizeClipFades } from "./fades";
import { ZOOM_MAX_PX_PER_SEC } from "./zoom";
import {
  clampClipRate,
  defaultTracks,
  defaultVisualizer,
  isTrackId,
  isVisualizerSceneId,
  type Clip,
  type MediaAsset,
  type MediaKind,
  type Project,
  type Track,
  type VisualizerState,
} from "./models";

export const PROJECT_SCHEMA_VERSION = 5;
export const PROJECT_FILE_SUFFIX = ".resonance.json";

export function createEmptyProject(name = "Untitled Resonance"): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createId("proj"),
    name,
    createdAt: now,
    updatedAt: now,
    assets: [],
    tracks: defaultTracks(),
    clips: [],
    markers: [],
    playheadMs: 0,
    inPointMs: null,
    outPointMs: null,
    loop: false,
    snap: true,
    zoomPxPerSec: 80,
    scrollMs: 0,
    visualizer: defaultVisualizer(),
    masterVolume: 1,
  };
}

export function touch(project: Project, patch: Partial<Project> = {}): Project {
  return { ...project, ...patch, updatedAt: new Date().toISOString() };
}

function isMediaKind(value: unknown): value is MediaKind {
  return value === "video" || value === "audio";
}

function sanitizeAsset(raw: unknown): MediaAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== "string" || typeof a.name !== "string") return null;
  if (!isMediaKind(a.kind)) return null;
  const blobId = typeof a.blobId === "string" && !a.blobId.startsWith("blob:")
    ? a.blobId
    : a.id;
  const missingFlag = a.missing === true;
  const objectUrl = typeof a.objectUrl === "string" ? a.objectUrl : undefined;
  const looksMissing =
    missingFlag ||
    (typeof a.objectUrl === "string" && a.objectUrl.startsWith("missing:")) ||
    blobId.startsWith("missing:");
  return {
    id: a.id,
    name: a.name.startsWith("missing:") ? a.name.slice("missing:".length) : a.name,
    kind: a.kind,
    mimeType: typeof a.mimeType === "string" ? a.mimeType : "",
    durationMs: Number(a.durationMs) || 0,
    blobId,
    objectUrl: looksMissing ? undefined : objectUrl,
    missing: looksMissing,
    width: typeof a.width === "number" ? a.width : undefined,
    height: typeof a.height === "number" ? a.height : undefined,
  };
}

function sanitizeClip(raw: unknown): Clip | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== "string" || typeof c.assetId !== "string") return null;
  if (typeof c.trackId !== "string" || !isTrackId(c.trackId)) return null;
  const startMs = Math.max(0, Number(c.startMs) || 0);
  const durationMs = Math.max(1, Number(c.durationMs) || 0);
  const sourceInMs = Math.max(0, Number(c.sourceInMs) || 0);
  const sourceOutMs = Math.max(sourceInMs + 1, Number(c.sourceOutMs) || sourceInMs + durationMs);
  const fades = normalizeClipFades(
    c.fadeInMs == null ? 0 : Number(c.fadeInMs),
    c.fadeOutMs == null ? 0 : Number(c.fadeOutMs),
    durationMs,
  );
  return {
    id: c.id,
    assetId: c.assetId,
    trackId: c.trackId,
    startMs,
    durationMs,
    sourceInMs,
    sourceOutMs,
    gain: Math.max(0, Number(c.gain) || 1),
    fadeInMs: fades.fadeInMs,
    fadeOutMs: fades.fadeOutMs,
    rate: c.rate == null ? 1 : clampClipRate(Number(c.rate)),
  };
}

function sanitizeTracks(raw: unknown): Track[] {
  const defaults = defaultTracks();
  if (!Array.isArray(raw)) return defaults;
  return defaults.map((track) => {
    const found = raw.find((t) => t && typeof t === "object" && (t as Track).id === track.id) as
      | Track
      | undefined;
    if (!found) return track;
    const vol = Number((found as Track).volume);
    const pan = Number((found as Track).pan);
    return {
      ...track,
      muted: Boolean(found.muted),
      solo: found.solo === true,
      volume: Number.isFinite(vol) ? Math.max(0, Math.min(2, vol)) : 1,
      pan: Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0,
    };
  });
}

function sanitizeVisualizer(raw: unknown): VisualizerState {
  const fallback = defaultVisualizer();
  if (!raw || typeof raw !== "object") return fallback;
  const v = raw as Record<string, unknown>;
  return {
    enabled: v.enabled !== false,
    muted: v.muted === true,
    sceneId: isVisualizerSceneId(v.sceneId) ? v.sceneId : fallback.sceneId,
  };
}

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectFormatError";
  }
}

/** Strip session-only blob URLs. They are not durable ids. */
export function serializeProject(project: Project): string {
  const durable: Project = {
    ...project,
    assets: project.assets.map((asset) => ({
      ...asset,
      objectUrl: undefined,
      missing: true,
      name: asset.name,
    })),
    updatedAt: new Date().toISOString(),
  };
  return `${JSON.stringify(durable, null, 2)}\n`;
}

export function deserializeProject(text: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProjectFormatError("File is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ProjectFormatError("Project root must be an object");
  }
  const raw = parsed as Record<string, unknown>;
  if (raw.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new ProjectFormatError(
      `Unsupported schemaVersion ${String(raw.schemaVersion)} (need ${PROJECT_SCHEMA_VERSION})`,
    );
  }
  if (typeof raw.id !== "string" || typeof raw.name !== "string") {
    throw new ProjectFormatError("Project id and name are required");
  }
  const assets = Array.isArray(raw.assets)
    ? raw.assets.map(sanitizeAsset).filter((a): a is MediaAsset => a != null)
    : [];
  const clips = Array.isArray(raw.clips)
    ? raw.clips.map(sanitizeClip).filter((c): c is Clip => c != null)
    : [];
  const base = createEmptyProject(raw.name);
  return {
    ...base,
    id: raw.id,
    name: raw.name,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
    assets,
    tracks: sanitizeTracks(raw.tracks),
    clips,
    markers: Array.isArray(raw.markers)
      ? raw.markers
          .filter((m) => m && typeof m === "object")
          .map((m) => {
            const mk = m as Record<string, unknown>;
            return {
              id: typeof mk.id === "string" ? mk.id : createId("mk"),
              timeMs: Math.max(0, Number(mk.timeMs) || 0),
              label: typeof mk.label === "string" ? mk.label : "M",
            };
          })
      : [],
    playheadMs: Math.max(0, Number(raw.playheadMs) || 0),
    inPointMs: raw.inPointMs == null ? null : Math.max(0, Number(raw.inPointMs)),
    outPointMs: raw.outPointMs == null ? null : Math.max(0, Number(raw.outPointMs)),
    loop: Boolean(raw.loop),
    snap: raw.snap !== false,
    zoomPxPerSec: Math.max(0.05, Math.min(ZOOM_MAX_PX_PER_SEC, Number(raw.zoomPxPerSec) || 80)),
    scrollMs: Math.max(0, Number(raw.scrollMs) || 0),
    visualizer: sanitizeVisualizer(raw.visualizer),
    masterVolume: (() => {
      const v = Number(raw.masterVolume);
      return Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 1;
    })(),
  };
}

export function downloadText(filename: string, text: string, mime = "application/json"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function projectFilename(project: Project): string {
  const safe = project.name.replace(/[^\w\-]+/g, "_") || "untitled";
  return `${safe}${PROJECT_FILE_SUFFIX}`;
}
