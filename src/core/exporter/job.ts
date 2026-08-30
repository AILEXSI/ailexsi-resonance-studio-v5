import { createId } from "../ids";
import {
  TRACK_IDS,
  clipEndMs,
  isTrackAudible,
  kindOfTrack,
  type Project,
} from "../models";
import { clampPan, mixLinearGain } from "../volume";
import { exportRangeMs } from "../timeline";
import {
  compositeVideoAt,
  contextFromExportClips,
  primaryLayer,
  resolvePictureSource,
  type CompositeVis,
} from "../transition";
import type { ExportClip, ExportJob, ExportTrack } from "./types";

export class ExportPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportPlanError";
  }
}

export interface JobOptions {
  width?: number;
  height?: number;
  fps?: number;
  fileName?: string;
}

export function jobFromProject(project: Project, opts: JobOptions = {}): ExportJob {
  const { startMs, endMs } = exportRangeMs(project);
  if (endMs <= startMs) {
    throw new ExportPlanError("Export range is empty (IN >= OUT or no clips)");
  }
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const tracks: ExportTrack[] = project.tracks.map((track) => {
    const audible = isTrackAudible(project, track.id);
    const keepPicture = kindOfTrack(track.id) === "video";
    if (!audible && !keepPicture) {
      return { id: track.id, kind: track.kind, pan: clampPan(track.pan ?? 0), clips: [] };
    }
    const clips: ExportClip[] = project.clips
      .filter((c) => c.trackId === track.id && c.enabled !== false)
      .filter((c) => clipEndMs(c) > startMs && c.startMs < endMs)
      .map((c) => {
        const asset = assets.get(c.assetId);
        return {
          id: c.id,
          trackId: c.trackId,
          kind: kindOfTrack(c.trackId),
          startMs: Math.max(0, c.startMs - startMs),
          endMs: Math.max(0, clipEndMs(c) - startMs),
          sourceUrl: asset?.objectUrl && !asset.missing ? asset.objectUrl : "",
          sourceInMs: c.sourceInMs,
          sourceOutMs: c.sourceOutMs,
          gain: mixLinearGain(c.gain, track.volume ?? 1, project.masterVolume ?? 1, !audible),
          fadeInMs: c.fadeInMs,
          fadeOutMs: c.fadeOutMs,
          rate: c.rate ?? 1,
          missing: !asset || asset.missing || !asset.objectUrl,
          label: asset?.name ?? c.id,
          linkId: c.linkId,
          still: asset?.kind === "image",
        };
      });
    return { id: track.id, kind: track.kind, pan: clampPan(track.pan ?? 0), clips };
  });

  const hasClips = tracks.some((t) => t.clips.length > 0);
  const visOnly = project.visualizer.enabled && !project.visualizer.muted;
  if (!hasClips && !visOnly) {
    throw new ExportPlanError("Nothing to export in the IN/OUT range");
  }

  const safe = (opts.fileName || project.name || "resonance").replace(/[^\w\-]+/g, "_");
  const durationMs = endMs - startMs;
  const transitions = (project.transitions ?? [])
    .map((t) => ({ ...t, startMs: t.startMs - startMs }))
    .filter((t) => t.durationMs > 0 && t.startMs + t.durationMs > 0 && t.startMs < durationMs);
  return {
    id: createId("job"),
    projectId: project.id,
    projectName: project.name,
    startMs,
    endMs,
    durationMs,
    width: opts.width ?? 1280,
    height: opts.height ?? 720,
    fps: opts.fps ?? 30,
    fileName: safe.endsWith(".mp4") ? safe : `${safe}.mp4`,
    tracks,
    visualizer: {
      enabled: project.visualizer.enabled,
      muted: project.visualizer.muted,
      sceneId: project.visualizer.sceneId,
      startMs: project.visualizer.startMs ?? 0,
      durationMs: project.visualizer.durationMs ?? 0,
      events: (project.visualizer.events ?? [])
        .map((e) => ({ ...e, startMs: e.startMs - startMs }))
        .filter((e) => e.durationMs > 0 && e.startMs + e.durationMs > 0 && e.startMs < durationMs),
    },
    transitions,
    frontVideoTrackId: project.frontVideoTrackId === "V1" ? "V1" : "V2",
  };
}

function jobVideoClips(job: ExportJob): ExportClip[] {
  return job.tracks.filter((t) => t.kind === "video").flatMap((t) => t.clips);
}

export function exportVisOf(job: ExportJob): CompositeVis {
  return {
    enabled: job.visualizer.enabled,
    muted: job.visualizer.muted,
    events: (job.visualizer.events ?? []).map((e) => ({
      startMs: e.startMs,
      durationMs: e.durationMs,
    })),
    startMs: job.visualizer.startMs ?? 0,
    durationMs: job.visualizer.durationMs ?? 0,
  };
}

export function videoClipAt(job: ExportJob, timeMs: number): ExportClip | undefined {
  const clips = jobVideoClips(job);
  const front = job.frontVideoTrackId === "V1" ? "V1" : "V2";
  const ctx = contextFromExportClips(clips, job.transitions ?? [], front, exportVisOf(job));
  const picture = resolvePictureSource(ctx, timeMs);
  if (picture.kind === "vis" || picture.kind === "black") {
    if (picture.source === "vis" || picture.source === "black") return undefined;
  }
  if (picture.clipId) {
    const chosen = clips.find((c) => c.id === picture.clipId && timeMs >= c.startMs && timeMs < c.endMs);
    if (chosen) return chosen;
  }
  const composite = compositeVideoAt(ctx, timeMs);
  const primary = primaryLayer(composite);
  if (primary) {
    const hit = clips.find(
      (c) => c.id === primary.clipId && timeMs >= c.startMs && timeMs < c.endMs,
    );
    if (hit) return hit;
  }
  if (picture.kind === "vis" || picture.kind === "black") return undefined;
  const hits = clips.filter((c) => timeMs >= c.startMs && timeMs < c.endMs);
  const preferred = hits.find((c) => c.trackId === front);
  if (preferred) return preferred;
  hits.sort((a, b) => TRACK_IDS.indexOf(b.trackId) - TRACK_IDS.indexOf(a.trackId));
  return hits[0];
}

/** Mix candidates: A and V clips that are present. Video-only files drop at decode. */
export function audioClipsForMix(job: ExportJob): ExportClip[] {
  const clips = job.tracks.flatMap((t) => t.clips).filter((c) => !c.missing);
  const livingAudioLinks = new Set(
    clips.filter((c) => c.kind === "audio" && c.linkId).map((c) => c.linkId as string),
  );
  return clips.filter((c) => {
    if (c.still) return false;
    if (c.kind === "video" && c.linkId && livingAudioLinks.has(c.linkId)) return false;
    return true;
  });
}

export function missingOnlyVideoLabel(job: ExportJob): string | undefined {
  const videos = job.tracks.filter((t) => t.kind === "video").flatMap((t) => t.clips);
  if (videos.length === 0) return undefined;
  const present = videos.filter((c) => !c.missing && Boolean(c.sourceUrl));
  if (present.length > 0) return undefined;
  return videos[0]?.label || "media";
}

export function summarizeJob(job: ExportJob): {
  videoClips: number;
  audioClips: number;
  missing: number;
  durationMs: number;
} {
  const clips = job.tracks.flatMap((t) => t.clips);
  return {
    videoClips: clips.filter((c) => c.kind === "video").length,
    audioClips: clips.filter((c) => c.kind === "audio").length,
    missing: clips.filter((c) => c.missing).length,
    durationMs: job.durationMs,
  };
}
