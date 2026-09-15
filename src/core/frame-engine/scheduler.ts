import { DecodedFrameCache } from "./cache";
import { AfeVideoDecoder } from "./decoder";
import { AfeError, throwIfAborted } from "./errors";
import { keyframeAtOrBefore, sampleIndexAtTime } from "./mp4-reader";
import type { AfeMemoryStats, AfeMovie, AfeSample, DrawableFrame } from "./types";

export class AfeDrawable implements DrawableFrame {
  constructor(
    private readonly frame: VideoFrame,
    readonly timestamp: number,
    readonly duration: number,
  ) {}

  get codedWidth(): number {
    return this.frame.codedWidth;
  }

  get codedHeight(): number {
    return this.frame.codedHeight;
  }

  draw(ctx: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number): void {
    ctx.drawImage(this.frame, dx, dy, dw, dh);
  }

  drawWithFit(ctx: CanvasRenderingContext2D, _opts: { fit: "contain" }): void {
    const canvas = ctx.canvas;
    const srcW = this.frame.displayWidth || this.frame.codedWidth;
    const srcH = this.frame.displayHeight || this.frame.codedHeight;
    if (srcW < 2 || srcH < 2) return;
    const scale = Math.min(canvas.width / srcW, canvas.height / srcH);
    const w = srcW * scale;
    const h = srcH * scale;
    ctx.drawImage(this.frame, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }

  close(): void {
    try {
      this.frame.close();
    } catch {
      /* already closed */
    }
  }
}

export class AfeScheduler {
  private readonly decoder: AfeVideoDecoder;
  private readonly cache: DecodedFrameCache;
  private nextDecode = 0;
  private warm = false;
  private closed = false;

  constructor(
    private readonly movie: AfeMovie,
    maxDecoded = 12,
  ) {
    this.decoder = new AfeVideoDecoder(movie);
    this.cache = new DecodedFrameCache(maxDecoded);
  }

  memoryStats(): AfeMemoryStats {
    return this.cache.stats();
  }

  close(): void {
    this.closed = true;
    this.warm = false;
    this.cache.clear();
    this.decoder.close();
  }

  async getFrameAt(timeSec: number, signal?: AbortSignal): Promise<DrawableFrame | null> {
    throwIfAborted(signal);
    if (this.closed) throw new AfeError("AFE_DECODE_FAILED", "scheduler closed", false);
    const index = sampleIndexAtTime(this.movie, timeSec);
    if (index == null) return null;
    const frame = await this.decodeTo(index, signal);
    return this.wrap(frame, this.movie.samples[index]!);
  }

  async *getFramesAt(timesSec: readonly number[], signal?: AbortSignal): AsyncIterable<DrawableFrame | null> {
    throwIfAborted(signal);
    if (this.closed) throw new AfeError("AFE_DECODE_FAILED", "scheduler closed", false);
    for (const t of timesSec) {
      throwIfAborted(signal);
      yield await this.getFrameAt(t, signal);
    }
  }

  private wrap(frame: VideoFrame, sample: AfeSample): AfeDrawable {
    const timestamp = sample.ptsTimescale / this.movie.timescale;
    const duration = sample.durationTimescale / this.movie.timescale;
    return new AfeDrawable(frame, timestamp, duration);
  }

  private async decodeTo(target: number, signal?: AbortSignal): Promise<VideoFrame> {
    const cached = this.cache.takeClone(target);
    if (cached) return cached;

    const key = keyframeAtOrBefore(this.movie, target);
    const canContinue = this.warm && this.nextDecode <= target && this.nextDecode > key;
    if (!canContinue) {
      await this.decoder.reset(signal);
      this.nextDecode = key;
      this.warm = true;
    }

    if (this.nextDecode > target) {
      const again = this.cache.takeClone(target);
      if (again) return again;
    }

    const run: AfeSample[] = [];
    for (let i = this.nextDecode; i <= target; i++) {
      const sample = this.movie.samples[i];
      if (!sample) throw new AfeError("AFE_DECODE_FAILED", `missing sample ${i}`);
      run.push(sample);
    }

    if (run.length === 0) {
      const again = this.cache.takeClone(target);
      if (!again) throw new AfeError("AFE_DECODE_FAILED", `no sample path to ${target}`);
      return again;
    }

    const frames = await this.decoder.decodeRange(run, signal);
    for (const [index, frame] of frames) {
      this.cache.put(index, frame);
    }
    this.nextDecode = target + 1;

    const wanted = this.cache.takeClone(target);
    if (!wanted) throw new AfeError("AFE_DECODE_FAILED", `no output for sample ${target}`);
    return wanted;
  }
}
