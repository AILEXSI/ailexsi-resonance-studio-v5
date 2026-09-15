import { DecodedFrameCache } from "./cache";
import { AfeVideoDecoder } from "./decoder";
import { AfeError, isAfeError, throwIfAborted } from "./errors";
import { keyframeAtOrBefore, sampleIndexAtTime } from "./mp4-reader";
import { afePerfAdd, afePerfCount, afePerfEnabled } from "./perf";
import type { AfeMemoryStats, AfeMovie, AfeSample, DrawableFrame } from "./types";

const BATCH_SPAN = 24;

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
    if (!afePerfEnabled()) {
      ctx.drawImage(this.frame, dx, dy, dw, dh);
      return;
    }
    const t0 = performance.now();
    ctx.drawImage(this.frame, dx, dy, dw, dh);
    afePerfAdd("canvasDraw", performance.now() - t0);
  }

  drawWithFit(ctx: CanvasRenderingContext2D, _opts: { fit: "contain" }): void {
    const canvas = ctx.canvas;
    const srcW = this.frame.displayWidth || this.frame.codedWidth;
    const srcH = this.frame.displayHeight || this.frame.codedHeight;
    if (srcW < 2 || srcH < 2) return;
    const scale = Math.min(canvas.width / srcW, canvas.height / srcH);
    const w = srcW * scale;
    const h = srcH * scale;
    const draw = () => ctx.drawImage(this.frame, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    if (!afePerfEnabled()) {
      draw();
      return;
    }
    const t0 = performance.now();
    draw();
    afePerfAdd("canvasDraw", performance.now() - t0);
  }

  close(): void {
    const t0 = afePerfEnabled() ? performance.now() : 0;
    try {
      this.frame.close();
    } catch {
      /* already closed */
    }
    afePerfCount("framesClosed");
    if (t0) afePerfAdd("frameClose", performance.now() - t0);
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
    let i = 0;
    while (i < timesSec.length) {
      throwIfAborted(signal);
      const index = sampleIndexAtTime(this.movie, timesSec[i]!);
      if (index == null) {
        yield null;
        i += 1;
        continue;
      }
      let last = index;
      let j = i + 1;
      while (j < timesSec.length && j - i < BATCH_SPAN) {
        const nxt = sampleIndexAtTime(this.movie, timesSec[j]!);
        if (nxt == null || nxt < last) break;
        last = nxt;
        j += 1;
      }
      const produced = await this.decodeSpan(index, last, signal);
      for (let k = i; k < j; k++) {
        const idx = sampleIndexAtTime(this.movie, timesSec[k]!);
        if (idx == null) {
          yield null;
          continue;
        }
        let frame = produced.get(idx);
        if (frame) produced.delete(idx);
        else frame = this.cache.takeClone(idx) ?? undefined;
        if (!frame) {
          yield null;
          continue;
        }
        yield this.wrap(frame, this.movie.samples[idx]!);
      }
      for (const [idx, frame] of produced) {
        this.cache.put(idx, frame);
      }
      i = j;
    }
  }

  private wrap(frame: VideoFrame, sample: AfeSample): AfeDrawable {
    const t0 = afePerfEnabled() ? performance.now() : 0;
    const timestamp = sample.ptsTimescale / this.movie.timescale;
    const duration = sample.durationTimescale / this.movie.timescale;
    const drawable = new AfeDrawable(frame, timestamp, duration);
    afePerfCount("framesYielded");
    afePerfCount("videoFrameCreates");
    if (t0) afePerfAdd("videoFrameHandoff", performance.now() - t0);
    return drawable;
  }

  private async decodeTo(target: number, signal?: AbortSignal): Promise<VideoFrame> {
    const cached = this.cache.takeClone(target);
    if (cached) return cached;
    const produced = await this.decodeSpan(target, target, signal);
    const wanted = produced.get(target);
    for (const [index, frame] of produced) {
      if (index === target) continue;
      this.cache.put(index, frame);
    }
    if (wanted) {
      this.cache.put(target, wanted);
      return wanted.clone();
    }
    const again = this.cache.takeClone(target);
    if (!again) throw new AfeError("AFE_DECODE_FAILED", `no output for sample ${target}`);
    return again;
  }

  private async decodeSpan(from: number, to: number, signal?: AbortSignal): Promise<Map<number, VideoFrame>> {
    afePerfCount("decodeSpanCalls");
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const key = keyframeAtOrBefore(this.movie, start);
    const canContinue = this.warm && !this.decoder.needsKeyframe && this.nextDecode <= start;
    if (!canContinue) {
      await this.decoder.reset(signal);
      this.nextDecode = key;
      this.warm = true;
    }

    if (this.nextDecode > end) return new Map();

    const run: AfeSample[] = [];
    for (let i = this.nextDecode; i <= end; i++) {
      const sample = this.movie.samples[i];
      if (!sample) throw new AfeError("AFE_DECODE_FAILED", `missing sample ${i}`);
      run.push(sample);
    }
    if (run.length === 0) return new Map();

    let frames: Map<number, VideoFrame>;
    try {
      frames = await this.decoder.decodeRange(run, signal);
    } catch (e) {
      if (!isAfeError(e) || !/key frame/i.test(e.message)) throw e;
      await this.decoder.reset(signal);
      this.nextDecode = key;
      this.warm = true;
      const retry: AfeSample[] = [];
      for (let i = key; i <= end; i++) retry.push(this.movie.samples[i]!);
      frames = await this.decoder.decodeRange(retry, signal);
    }
    this.nextDecode = end + 1;
    return frames;
  }
}
