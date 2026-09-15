import { ALL_FORMATS, BlobSource, Input, UrlSource, VideoSampleSink, type VideoSample } from "mediabunny";
import { isPlayableSource, loadVideo, seekVideo } from "../exporter/media";
import { AfeError, throwIfAborted } from "./errors";
import { parseIsoBmff } from "./mp4-reader";
import { afePerfAdd, afePerfCount, afePerfEnabled, afePerfTime, afePerfTimeAsync } from "./perf";
import { AfeScheduler } from "./scheduler";
import type {
  AfeMemoryStats,
  DrawableFrame,
  FrameSourceBackend,
  FrameSourceBackendId,
  OpenedFrameSource,
} from "./types";

const EMPTY_MEMORY: AfeMemoryStats = {
  decodedCached: 0,
  maxDecodedCached: 0,
  approxBytes: 0,
  peakDecodedCached: 0,
};

async function loadSourceBytes(src: string, signal?: AbortSignal): Promise<Uint8Array> {
  throwIfAborted(signal);
  if (!isPlayableSource(src)) {
    throw new AfeError("AFE_UNSUPPORTED_CONTAINER", "blocked or unreadable source");
  }
  return afePerfTimeAsync("sourceOpen", async () => {
    const res = await fetch(src, { signal });
    if (!res.ok) throw new AfeError("AFE_DECODE_FAILED", `Failed to read media (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  });
}

async function mediabunnySource(src: string) {
  if (src.startsWith("blob:") || src.startsWith("file:")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to read media (${res.status})`);
    return new BlobSource(await res.blob());
  }
  return new UrlSource(src);
}

class SampleDrawable implements DrawableFrame {
  constructor(private readonly sample: VideoSample) {}

  get timestamp(): number {
    return this.sample.timestamp;
  }

  get duration(): number {
    return this.sample.duration;
  }

  get codedWidth(): number {
    return this.sample.codedWidth;
  }

  get codedHeight(): number {
    return this.sample.codedHeight;
  }

  draw(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    if (!afePerfEnabled()) {
      this.sample.draw(ctx, dx, dy, dw, dh);
      return;
    }
    const t0 = performance.now();
    this.sample.draw(ctx, dx, dy, dw, dh);
    afePerfAdd("canvasDraw", performance.now() - t0);
  }

  drawWithFit(ctx: CanvasRenderingContext2D, opts: { fit: "contain" }): void {
    if (!afePerfEnabled()) {
      this.sample.drawWithFit(ctx, opts);
      return;
    }
    const t0 = performance.now();
    this.sample.drawWithFit(ctx, opts);
    afePerfAdd("canvasDraw", performance.now() - t0);
  }

  close(): void {
    const t0 = afePerfEnabled() ? performance.now() : 0;
    this.sample.close();
    afePerfCount("framesClosed");
    if (t0) afePerfAdd("frameClose", performance.now() - t0);
  }
}

class HtmlDrawable implements DrawableFrame {
  constructor(
    private readonly video: HTMLVideoElement,
    readonly timestamp: number,
  ) {}

  get duration(): number {
    return 0;
  }

  get codedWidth(): number {
    return this.video.videoWidth;
  }

  get codedHeight(): number {
    return this.video.videoHeight;
  }

  draw(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    ctx.drawImage(this.video, dx, dy, dw, dh);
  }

  drawWithFit(ctx: CanvasRenderingContext2D, _opts: { fit: "contain" }): void {
    const canvas = ctx.canvas;
    const srcW = this.video.videoWidth;
    const srcH = this.video.videoHeight;
    if (srcW < 2 || srcH < 2) return;
    const scale = Math.min(canvas.width / srcW, canvas.height / srcH);
    const w = srcW * scale;
    const h = srcH * scale;
    ctx.drawImage(this.video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }

  close(): void {
    /* HTMLVideoElement is cached; nothing to close */
  }
}

class AilexsiOpened implements OpenedFrameSource {
  readonly identity = "ailexsi" as const;
  private readonly scheduler: AfeScheduler;

  constructor(movie: ReturnType<typeof parseIsoBmff>) {
    this.scheduler = new AfeScheduler(movie);
  }

  getFrameAt(timeSec: number, signal?: AbortSignal) {
    return this.scheduler.getFrameAt(timeSec, signal);
  }

  getFramesAt(timesSec: readonly number[], signal?: AbortSignal) {
    return this.scheduler.getFramesAt(timesSec, signal);
  }

  close(): void {
    afePerfTime("cleanup", () => {
      this.scheduler.close();
    });
  }

  memoryStats() {
    return this.scheduler.memoryStats();
  }
}

class MediabunnyOpened implements OpenedFrameSource {
  readonly identity = "mediabunny" as const;

  constructor(
    private readonly input: Input,
    private readonly sink: VideoSampleSink,
  ) {}

  async getFrameAt(timeSec: number, signal?: AbortSignal): Promise<DrawableFrame | null> {
    throwIfAborted(signal);
    const sample = await afePerfTimeAsync("decodeQueueWait", () => this.sink.getSample(timeSec));
    if (!sample) return null;
    afePerfCount("framesDecoded");
    return afePerfTime("videoFrameHandoff", () => {
      afePerfCount("framesYielded");
      return new SampleDrawable(sample);
    });
  }

  async *getFramesAt(timesSec: readonly number[], signal?: AbortSignal): AsyncIterable<DrawableFrame | null> {
    throwIfAborted(signal);
    const iter = this.sink.samplesAtTimestamps(timesSec);
    for (;;) {
      throwIfAborted(signal);
      const step = await afePerfTimeAsync("decodeQueueWait", () => iter.next());
      if (step.done) break;
      const sample = step.value;
      if (!sample) {
        yield null;
        continue;
      }
      afePerfCount("framesDecoded");
      yield afePerfTime("videoFrameHandoff", () => {
        afePerfCount("framesYielded");
        return new SampleDrawable(sample);
      });
    }
  }

  close(): void {
    afePerfTime("cleanup", () => {
      try {
        this.input.dispose();
      } catch {
        /* already gone */
      }
    });
  }

  memoryStats(): AfeMemoryStats {
    return EMPTY_MEMORY;
  }
}

class HtmlVideoOpened implements OpenedFrameSource {
  readonly identity = "htmlvideo" as const;

  constructor(private readonly src: string) {}

  async getFrameAt(timeSec: number, signal?: AbortSignal): Promise<DrawableFrame | null> {
    throwIfAborted(signal);
    const video = await loadVideo(this.src);
    throwIfAborted(signal);
    await seekVideo(video, timeSec);
    throwIfAborted(signal);
    if (video.videoWidth < 2) return null;
    return new HtmlDrawable(video, video.currentTime);
  }

  async *getFramesAt(timesSec: readonly number[], signal?: AbortSignal): AsyncIterable<DrawableFrame | null> {
    for (const t of timesSec) {
      yield await this.getFrameAt(t, signal);
    }
  }

  close(): void {
    /* media.ts owns the element cache */
  }

  memoryStats(): AfeMemoryStats {
    return EMPTY_MEMORY;
  }
}

export class AilexsiFrameSourceBackend implements FrameSourceBackend {
  readonly identity = "ailexsi" as const;

  async open(src: string, signal?: AbortSignal): Promise<OpenedFrameSource> {
    const bytes = await loadSourceBytes(src, signal);
    throwIfAborted(signal);
    const movie = parseIsoBmff(bytes);
    return new AilexsiOpened(movie);
  }
}

export class MediabunnyFrameSourceBackend implements FrameSourceBackend {
  readonly identity = "mediabunny" as const;

  async open(src: string, signal?: AbortSignal): Promise<OpenedFrameSource> {
    throwIfAborted(signal);
    if (!isPlayableSource(src)) {
      throw new AfeError("AFE_UNSUPPORTED_CONTAINER", "blocked source");
    }
    const source = await afePerfTimeAsync("sourceOpen", () => mediabunnySource(src));
    const input = new Input({
      source,
      formats: ALL_FORMATS,
    });
    try {
      const track = await afePerfTimeAsync("containerParse", () => input.getPrimaryVideoTrack());
      if (!track) {
        input.dispose();
        throw new AfeError("AFE_UNSUPPORTED_CODEC", "no video track");
      }
      if (!(await afePerfTimeAsync("decoderConfigure", () => track.canDecode()))) {
        input.dispose();
        throw new AfeError("AFE_DECODE_CONFIG_FAILED", "track cannot decode");
      }
      throwIfAborted(signal);
      return afePerfTime("decoderCreate", () => new MediabunnyOpened(input, new VideoSampleSink(track)));
    } catch (e) {
      try {
        input.dispose();
      } catch {
        /* */
      }
      throw e;
    }
  }
}

export class HtmlVideoFrameSourceBackend implements FrameSourceBackend {
  readonly identity = "htmlvideo" as const;

  async open(src: string, signal?: AbortSignal): Promise<OpenedFrameSource> {
    throwIfAborted(signal);
    if (!isPlayableSource(src)) {
      throw new AfeError("AFE_UNSUPPORTED_CONTAINER", "blocked source");
    }
    return new HtmlVideoOpened(src);
  }
}

export function createFrameSourceBackend(id: FrameSourceBackendId): FrameSourceBackend {
  if (id === "ailexsi") return new AilexsiFrameSourceBackend();
  if (id === "htmlvideo") return new HtmlVideoFrameSourceBackend();
  return new MediabunnyFrameSourceBackend();
}

export async function openFrameSource(
  id: FrameSourceBackendId,
  src: string,
  signal?: AbortSignal,
): Promise<OpenedFrameSource> {
  return createFrameSourceBackend(id).open(src, signal);
}
