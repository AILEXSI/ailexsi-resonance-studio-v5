import { canUseWebCodecs, exportWithWebCodecs, webCodecsUnavailableMessage } from "./webcodecs";
import type { ExportHooks, ExportJob, ExportResult } from "./types";

export type { ExportHooks, ExportJob, ExportProgress, ExportResult } from "./types";
export { jobFromProject, ExportPlanError, summarizeJob, videoClipAt } from "./job";
export { canUseWebCodecs, webCodecsUnavailableMessage } from "./webcodecs";
export { validateMp4Ftyp, looksLikeWebm, hexHeader } from "./ftyp";

export async function exportTimeline(
  job: ExportJob,
  hooks: ExportHooks = {},
): Promise<ExportResult> {
  hooks.onProgress?.({ percent: 0, stage: "Validating" });
  if (!job || job.durationMs <= 0) {
    return {
      success: false,
      error: "FAIL: empty export job",
      fileName: job?.fileName ?? "export.mp4",
      durationMs: job?.durationMs ?? 0,
      fileSizeBytes: 0,
    };
  }
  if (!job.tracks.some((t) => t.clips.length > 0)) {
    return {
      success: false,
      error: "FAIL: no clips in export range",
      fileName: job.fileName,
      durationMs: job.durationMs,
      fileSizeBytes: 0,
    };
  }
  if (!canUseWebCodecs()) {
    return {
      success: false,
      error: webCodecsUnavailableMessage(),
      fileName: job.fileName,
      durationMs: job.durationMs,
      fileSizeBytes: 0,
    };
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

