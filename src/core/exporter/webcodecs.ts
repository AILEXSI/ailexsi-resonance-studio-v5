import { validateMp4Ftyp } from "./ftyp";
import { videoClipAt } from "./job";
import { muxAvcToMp4, type AvcSample } from "./mp4";
import type { ExportHooks, ExportJob, ExportResult } from "./types";

const AVC_CODEC = "avc1.42001f";

export function canUseWebCodecs(): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof VideoEncoder.isConfigSupported === "function"
  );
}

export function webCodecsUnavailableMessage(): string {
  return "FAIL: WebCodecs unavailable. H.264 MP4 export requires VideoEncoder and VideoFrame. WebM is not a fallback.";
}

function fail(job: ExportJob, error: string): ExportResult {
  return {
    success: false,
    error,
    fileName: job.fileName,
    durationMs: job.durationMs,
    fileSizeBytes: 0,
  };
}

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("Source video failed to load"));
  });
  return video;
}

function seekVideo(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = Math.max(0, seconds);
  });
}

export async function exportWithWebCodecs(
  job: ExportJob,
  hooks: ExportHooks = {},
): Promise<ExportResult> {
  if (!canUseWebCodecs()) return fail(job, webCodecsUnavailableMessage());
  if (job.durationMs <= 0) return fail(job, "FAIL: empty export range");

  const supported = await VideoEncoder.isConfigSupported({
    codec: AVC_CODEC,
    width: job.width,
    height: job.height,
    bitrate: 3_000_000,
    framerate: job.fps,
    avc: { format: "avc" },
  });
  if (!supported.supported) {
    return fail(job, `FAIL: H.264 encoder not supported (${AVC_CODEC})`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = job.width;
  canvas.height = job.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fail(job, "FAIL: 2D canvas unavailable");

  const videos = new Map<string, HTMLVideoElement>();
  for (const clip of job.tracks.flatMap((t) => t.clips)) {
    if (clip.kind !== "video" || !clip.sourceUrl || clip.missing) continue;
    if (!videos.has(clip.sourceUrl)) {
      try {
        videos.set(clip.sourceUrl, await loadVideo(clip.sourceUrl));
      } catch {
        /* draw slate instead */
      }
    }
  }

  const samples: AvcSample[] = [];
  let description: Uint8Array | undefined;
  let encoderError: Error | undefined;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig?.description) {
        const desc = meta.decoderConfig.description;
        if (desc instanceof ArrayBuffer) description = new Uint8Array(desc);
        else if (ArrayBuffer.isView(desc)) {
          description = new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength);
        }
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({
        data,
        timestampUs: chunk.timestamp,
        durationUs: chunk.duration ?? Math.round(1_000_000 / job.fps),
        key: chunk.type === "key",
      });
    },
    error: (e) => {
      encoderError = e;
    },
  });

  encoder.configure({
    codec: AVC_CODEC,
    width: job.width,
    height: job.height,
    bitrate: 3_000_000,
    framerate: job.fps,
    avc: { format: "avc" },
    latencyMode: "quality",
  });

  const frameCount = Math.max(1, Math.round((job.durationMs / 1000) * job.fps));
  const frameDurUs = Math.round(1_000_000 / job.fps);

  try {
    for (let i = 0; i < frameCount; i++) {
      if (hooks.signal?.aborted) throw new Error("Export aborted");
      if (encoderError) throw encoderError;
      const timeMs = (i / job.fps) * 1000;
      hooks.onProgress?.({
        percent: Math.round((i / frameCount) * 90),
        stage: "Encoding H.264",
        currentTimeMs: timeMs,
      });

      ctx.fillStyle = "#101318";
      ctx.fillRect(0, 0, job.width, job.height);
      const clip = videoClipAt(job, timeMs);
      if (clip) {
        const video = clip.sourceUrl ? videos.get(clip.sourceUrl) : undefined;
        if (video) {
          const sourceSec = (clip.sourceInMs + (timeMs - clip.startMs)) / 1000;
          if (Math.abs(video.currentTime - sourceSec) > 0.04) {
            await seekVideo(video, sourceSec);
          }
          const scale = Math.min(job.width / (video.videoWidth || job.width), job.height / (video.videoHeight || job.height));
          const dw = (video.videoWidth || job.width) * scale;
          const dh = (video.videoHeight || job.height) * scale;
          ctx.drawImage(video, (job.width - dw) / 2, (job.height - dh) / 2, dw, dh);
        } else {
          ctx.fillStyle = "#2a3140";
          ctx.fillRect(0, 0, job.width, job.height);
          ctx.fillStyle = "#d7dde8";
          ctx.font = "28px ui-sans-serif, system-ui, sans-serif";
          ctx.fillText(clip.missing ? `missing: ${clip.label}` : clip.label, 32, 64);
        }
      }

      const frame = new VideoFrame(canvas, {
        timestamp: i * frameDurUs,
        duration: frameDurUs,
      });
      encoder.encode(frame, { keyFrame: i % (job.fps * 2) === 0 });
      frame.close();
    }

    await encoder.flush();
    encoder.close();
  } catch (e) {
    try {
      encoder.close();
    } catch {
      /* already closed */
    }
    const msg = e instanceof Error ? e.message : String(e);
    return fail(job, `FAIL: ${msg}`);
  }

  if (!description) return fail(job, "FAIL: encoder did not emit AVC description");
  if (samples.length === 0) return fail(job, "FAIL: encoder produced no samples");

  hooks.onProgress?.({ percent: 95, stage: "Muxing MP4" });
  let bytes: Uint8Array;
  try {
    bytes = muxAvcToMp4({
      width: job.width,
      height: job.height,
      fps: job.fps,
      description,
      samples,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(job, `FAIL: mux ${msg}`);
  }

  const check = validateMp4Ftyp(bytes);
  if (!check.ok) return fail(job, `FAIL: ${check.error}`);

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "video/mp4" });
  hooks.onProgress?.({ percent: 100, stage: "Done" });
  return {
    success: true,
    fileName: job.fileName,
    durationMs: job.durationMs,
    fileSizeBytes: blob.size,
    mimeType: "video/mp4",
    blob,
    brands: check.brands,
  };
}
