import { encodeAac, mixJobAudio, probeAac, withTimeout } from "./audio";
import { clearFrameSources, drawContain, getDecoder, sourceTimeSec } from "./frame-source";
import { validateMp4Ftyp } from "./ftyp";
import { videoClipAt } from "./job";
import { clearMediaCache, isPlayableSource, loadVideo, seekVideo } from "./media";
import { mp4HasAudioTrack, muxAvcToMp4, type AvcSample } from "./mp4";
import type { ExportClip, ExportHooks, ExportJob, ExportResult } from "./types";
import { featuresAt, renderVisualizerScene } from "../visualizer";

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

function even(n: number): number {
  return n % 2 === 0 ? n : n + 1;
}

function clearCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = "#101318";
  ctx.fillRect(0, 0, width, height);
}

function paintVisualizer(ctx: CanvasRenderingContext2D, job: ExportJob, timeMs: number, dt: number): void {
  if (!job.visualizer.enabled || job.visualizer.muted) return;
  const features = featuresAt(timeMs, job.durationMs);
  renderVisualizerScene(ctx, job.width, job.height, job.visualizer.sceneId, features, dt);
}

type FrameRun = {
  clip: ExportClip | undefined;
  startIndex: number;
  count: number;
};

function groupFrameRuns(job: ExportJob, total: number, fps: number): FrameRun[] {
  const runs: FrameRun[] = [];
  let current: FrameRun | undefined;
  for (let i = 0; i < total; i++) {
    const clip = videoClipAt(job, (i / fps) * 1000);
    const id = clip?.id ?? "";
    if (current && (current.clip?.id ?? "") === id) {
      current.count += 1;
    } else {
      current = { clip, startIndex: i, count: 1 };
      runs.push(current);
    }
  }
  return runs;
}

async function paintHtmlVideo(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  url: string,
  sourceSec: number,
): Promise<boolean> {
  try {
    const video = await loadVideo(url);
    await seekVideo(video, sourceSec);
    if (video.videoWidth < 2) return false;
    drawContain(ctx, canvas, video.videoWidth, video.videoHeight, (dx, dy, dw, dh) => {
      ctx.drawImage(video, dx, dy, dw, dh);
    });
    return true;
  } catch {
    return false;
  }
}

export async function exportWithWebCodecs(
  job: ExportJob,
  hooks: ExportHooks = {},
): Promise<ExportResult> {
  if (!canUseWebCodecs()) return fail(job, webCodecsUnavailableMessage());
  if (job.durationMs <= 0) return fail(job, "FAIL: empty export range");

  const width = even(job.width);
  const height = even(job.height);

  const supported = await VideoEncoder.isConfigSupported({
    codec: AVC_CODEC,
    width,
    height,
    bitrate: 3_000_000,
    framerate: job.fps,
    avc: { format: "avc" },
  });
  if (!supported.supported) {
    return fail(job, `FAIL: H.264 encoder not supported (${AVC_CODEC})`);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: false });
  if (!ctx) return fail(job, "FAIL: 2D canvas unavailable");

  hooks.onProgress?.({ percent: 6, stage: "Encoding H.264" });

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
    width,
    height,
    bitrate: 3_000_000,
    framerate: job.fps,
    avc: { format: "avc" },
    latencyMode: "quality",
    hardwareAcceleration: "prefer-software",
  });

  const frameCount = Math.max(1, Math.round((job.durationMs / 1000) * job.fps));
  const frameDurUs = Math.round(1_000_000 / job.fps);
  const dt = 1 / job.fps;
  const runs = groupFrameRuns(job, frameCount, job.fps);

  const waitForQueue = async () => {
    while (encoder.encodeQueueSize > 8) {
      await new Promise<void>((resolve) => {
        const done = () => {
          encoder.removeEventListener("dequeue", done);
          window.clearTimeout(timer);
          resolve();
        };
        const timer = window.setTimeout(done, 200);
        encoder.addEventListener("dequeue", done);
      });
    }
  };

  const encodeCanvas = async (i: number) => {
    await waitForQueue();
    const frame = new VideoFrame(canvas, {
      timestamp: i * frameDurUs,
      duration: frameDurUs,
    });
    encoder.encode(frame, { keyFrame: i % (job.fps * 2) === 0 });
    frame.close();
  };

  const paintFallback = (i: number) => {
    const timeMs = (i / job.fps) * 1000;
    clearCanvas(ctx, width, height);
    paintVisualizer(ctx, job, timeMs, dt);
  };

  try {
    for (const run of runs) {
      if (hooks.signal?.aborted) throw new Error("Export aborted");
      if (encoderError) throw encoderError;
      const clip = run.clip;
      if (!clip || clip.missing || !isPlayableSource(clip.sourceUrl)) {
        for (let k = 0; k < run.count; k++) {
          if (hooks.signal?.aborted) throw new Error("Export aborted");
          const i = run.startIndex + k;
          hooks.onProgress?.({
            percent: Math.round((i / frameCount) * 80) + 8,
            stage: "Encoding H.264",
            currentTimeMs: (i / job.fps) * 1000,
          });
          paintFallback(i);
          await encodeCanvas(i);
        }
        continue;
      }

      const timestamps = Array.from({ length: run.count }, (_, k) =>
        sourceTimeSec(clip, ((run.startIndex + k) / job.fps) * 1000, job.fps),
      );

      let painted = 0;
      const decoded = await withTimeout(getDecoder(clip.sourceUrl), 20000, null);
      console.info("[export] decoder", Boolean(decoded), clip.label);
      if (decoded) {
        let k = 0;
        try {
          for await (const sample of decoded.sink.samplesAtTimestamps(timestamps)) {
            if (hooks.signal?.aborted) throw new Error("Export aborted");
            if (encoderError) throw encoderError;
            const i = run.startIndex + k;
            hooks.onProgress?.({
              percent: Math.round((i / frameCount) * 80) + 8,
              stage: "Encoding H.264",
              currentTimeMs: (i / job.fps) * 1000,
            });
            clearCanvas(ctx, width, height);
            if (sample) {
              sample.drawWithFit(ctx, { fit: "contain" });
              sample.close();
              painted += 1;
            } else if (await paintHtmlVideo(ctx, canvas, clip.sourceUrl, timestamps[k] ?? 0)) {
              painted += 1;
            } else {
              paintFallback(i);
            }
            await encodeCanvas(i);
            k += 1;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/abort/i.test(msg)) throw e;
        }
        while (k < run.count) {
          if (hooks.signal?.aborted) throw new Error("Export aborted");
          const i = run.startIndex + k;
          clearCanvas(ctx, width, height);
          if (await paintHtmlVideo(ctx, canvas, clip.sourceUrl, timestamps[k]!)) painted += 1;
          else paintFallback(i);
          await encodeCanvas(i);
          k += 1;
        }
      } else {
        for (let k = 0; k < run.count; k++) {
          if (hooks.signal?.aborted) throw new Error("Export aborted");
          const i = run.startIndex + k;
          hooks.onProgress?.({
            percent: Math.round((i / frameCount) * 80) + 8,
            stage: "Encoding H.264",
            currentTimeMs: (i / job.fps) * 1000,
          });
          clearCanvas(ctx, width, height);
          if (await paintHtmlVideo(ctx, canvas, clip.sourceUrl, timestamps[k]!)) painted += 1;
          else paintFallback(i);
          await encodeCanvas(i);
        }
      }

      if (painted === 0) {
        throw new Error(`missing:${clip.label}`);
      }
    }

    await encoder.flush();
    encoder.close();
  } catch (e) {
    try {
      encoder.close();
    } catch {
      /* already closed */
    }
    clearFrameSources();
    clearMediaCache();
    const msg = e instanceof Error ? e.message : String(e);
    const prefixed = msg.startsWith("FAIL:") || msg.startsWith("missing:") ? msg : `FAIL: ${msg}`;
    return fail(job, prefixed.startsWith("missing:") ? `FAIL: ${prefixed}` : prefixed);
  }

  clearFrameSources();
  clearMediaCache();

  if (!description) return fail(job, "FAIL: encoder did not emit AVC description");
  if (samples.length === 0) return fail(job, "FAIL: encoder produced no samples");

  hooks.onProgress?.({ percent: 90, stage: "Encoding AAC" });
  let audioTrack: Parameters<typeof muxAvcToMp4>[0]["audio"];
  let audioKind: "aac" | "none" = "none";
  try {
    const aacProbe = await withTimeout(probeAac(), 4000, null);
    if (aacProbe) {
      const mixed = await withTimeout(mixJobAudio(job, aacProbe, hooks.signal), 12000, null);
      if (mixed) {
        const encoded = await withTimeout(encodeAac(mixed, aacProbe, hooks), 12000, null);
        if (encoded) {
          audioTrack = {
            sampleRate: aacProbe.sampleRate,
            channels: aacProbe.channels,
            description: encoded.description,
            samples: encoded.samples,
          };
          audioKind = "aac";
        }
      }
    }
  } catch {
    audioKind = "none";
  }

  hooks.onProgress?.({ percent: 95, stage: "Muxing MP4" });
  let bytes: Uint8Array;
  try {
    bytes = muxAvcToMp4({
      width,
      height,
      fps: job.fps,
      description,
      samples,
      audio: audioTrack,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(job, `FAIL: mux ${msg}`);
  }

  const check = validateMp4Ftyp(bytes);
  if (!check.ok) return fail(job, `FAIL: ${check.error}`);
  if (audioKind === "aac" && !mp4HasAudioTrack(bytes)) {
    audioKind = "none";
  }

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
    audio: audioKind,
  };
}
