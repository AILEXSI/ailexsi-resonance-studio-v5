import { createId } from "../ids";
import {
  clipEndMs,
  kindOfTrack,
  type Project,
} from "../models";
import { exportRangeMs } from "../timeline";
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
    if (track.muted) {
      return { id: track.id, kind: track.kind, clips: [] };
    }
    const clips: ExportClip[] = project.clips
      .filter((c) => c.trackId === track.id)
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
          gain: c.gain,
          missing: !asset || asset.missing || !asset.objectUrl,
          label: asset?.name ?? c.id,
        };
      });
    return { id: track.id, kind: track.kind, clips };
  });

  const hasClips = tracks.some((t) => t.clips.length > 0);
  const visOnly = project.visualizer.enabled && !project.visualizer.muted;
  if (!hasClips && !visOnly) {
    throw new ExportPlanError("Nothing to export in the IN/OUT range");
  }

  const safe = (opts.fileName || project.name || "resonance").replace(/[^\w\-]+/g, "_");
  return {
    id: createId("job"),
    projectId: project.id,
    projectName: project.name,
    startMs,
    endMs,
    durationMs: endMs - startMs,
    width: opts.width ?? 1280,
    height: opts.height ?? 720,
    fps: opts.fps ?? 30,
    fileName: safe.endsWith(".mp4") ? safe : `${safe}.mp4`,
    tracks,
    visualizer: {
      enabled: project.visualizer.enabled,
      muted: project.visualizer.muted,
      sceneId: project.visualizer.sceneId,
    },
  };
}

export function videoClipAt(job: ExportJob, timeMs: number): ExportClip | undefined {
  const hits = job.tracks
    .filter((t) => t.kind === "video")
    .flatMap((t) => t.clips)
    .filter((c) => timeMs >= c.startMs && timeMs < c.endMs);
  return hits.find((c) => c.trackId === "V2") ?? hits.find((c) => c.trackId === "V1");
}

export function audioClipsForMix(job: ExportJob): ExportClip[] {
  return job.tracks
    .filter((t) => t.kind === "audio")
    .flatMap((t) => t.clips)
    .filter((c) => !c.missing);
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
