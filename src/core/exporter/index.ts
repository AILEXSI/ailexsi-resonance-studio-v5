import { canUseWebCodecs, exportWithWebCodecs, webCodecsUnavailableMessage } from "./webcodecs";
import { missingOnlyVideoLabel } from "./job";
import type { ExportHooks, ExportJob, ExportResult } from "./types";

export type { ExportHooks, ExportJob, ExportProgress, ExportResult, ExportAudioKind } from "./types";
export { jobFromProject, ExportPlanError, summarizeJob, videoClipAt, missingOnlyVideoLabel } from "./job";
export { canUseWebCodecs, webCodecsUnavailableMessage } from "./webcodecs";
export { validateMp4Ftyp, looksLikeWebm, hexHeader } from "./ftyp";
export { mp4HasAudioTrack } from "./mp4";

function fail(job: ExportJob | undefined, error: string): ExportResult {
  return {
    success: false,
    error,
    fileName: job?.fileName ?? "export.mp4",
    durationMs: job?.durationMs ?? 0,
    fileSizeBytes: 0,
  };
}

export async function exportTimeline(
  job: ExportJob,
  hooks: ExportHooks = {},
): Promise<ExportResult> {
  hooks.onProgress?.({ percent: 0, stage: "Validating" });
  if (!job || job.durationMs <= 0) {
    return fail(job, "FAIL: empty export job");
  }
  const visOnly = job.visualizer?.enabled && !job.visualizer?.muted;
  if (!job.tracks.some((t) => t.clips.length > 0) && !visOnly) {
    return fail(job, "FAIL: no clips in export range");
  }
  const missingName = missingOnlyVideoLabel(job);
  if (missingName) {
    return fail(job, `FAIL: missing:${missingName}`);
  }
  if (!canUseWebCodecs()) {
    return fail(job, webCodecsUnavailableMessage());
  }
  return exportWithWebCodecs(job, hooks);
}

export function downloadMp4(result: ExportResult): void {
  if (!result.success || !result.blob) {
    throw new Error(result.error ?? "Export did not produce an MP4");
  }
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.fileName.endsWith(".mp4") ? result.fileName : `${result.fileName}.mp4`;
  a.click();
  URL.revokeObjectURL(url);
}
