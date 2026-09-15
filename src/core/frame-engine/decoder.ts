import { decoderConfigOf } from "./avc-config";
import { AfeError, abortedError, throwIfAborted } from "./errors";
import type { AfeMovie, AfeSample } from "./types";
import { sampleBytes } from "./mp4-reader";

export class AfeVideoDecoder {
  private decoder: VideoDecoder | null = null;
  private waiters = new Map<number, { resolve: (frame: VideoFrame) => void; reject: (e: Error) => void }>();
  private generation = 0;
  private closed = false;
  private lastError: Error | null = null;
  private configured = false;

  constructor(private readonly movie: AfeMovie) {}

  get isOpen(): boolean {
    return this.decoder != null && this.configured && !this.closed;
  }

  async ensure(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    if (this.closed) throw new AfeError("AFE_DECODE_FAILED", "decoder closed", false);
    if (this.decoder && this.configured) return;
    if (typeof VideoDecoder === "undefined") {
      throw new AfeError("AFE_DECODE_CONFIG_FAILED", "VideoDecoder unavailable");
    }
    this.decoder = new VideoDecoder({
      output: (frame) => this.onOutput(frame),
      error: (e) => this.onError(e),
    });
    try {
      const config = decoderConfigOf(this.movie.avc);
      const support = await VideoDecoder.isConfigSupported(config);
      throwIfAborted(signal);
      if (!support.supported) {
        this.teardown();
        throw new AfeError("AFE_DECODE_CONFIG_FAILED", `unsupported ${config.codec}`);
      }
      this.decoder.configure(config);
      this.configured = true;
    } catch (e) {
      this.teardown();
      if (e instanceof AfeError) throw e;
      throw new AfeError("AFE_DECODE_CONFIG_FAILED", e instanceof Error ? e.message : String(e));
    }
  }

  async reset(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    this.rejectWaiters(new AfeError("AFE_DECODE_FAILED", "decoder reset", false));
    if (this.decoder && this.configured) {
      try {
        this.decoder.reset();
        this.decoder.configure(decoderConfigOf(this.movie.avc));
      } catch (e) {
        this.teardown();
        throw new AfeError("AFE_DECODE_FAILED", e instanceof Error ? e.message : String(e));
      }
    } else {
      await this.ensure(signal);
    }
  }

  chunkTimestampUs(sample: AfeSample): number {
    return Math.round((sample.ptsTimescale / this.movie.timescale) * 1_000_000);
  }

  /**
   * Decode `samples` in order (must start at a keyframe after reset).
   * One flush at the end so intermediates are not individually flushed.
   */
  async decodeRange(samples: AfeSample[], signal?: AbortSignal): Promise<Map<number, VideoFrame>> {
    throwIfAborted(signal);
    await this.ensure(signal);
    if (!this.decoder) throw new AfeError("AFE_DECODE_FAILED", "decoder missing");
    if (this.lastError) throw this.lastError;
    if (samples.length === 0) return new Map();

    const gen = this.generation;
    const pending: { index: number; timestamp: number; promise: Promise<VideoFrame> }[] = [];

    for (const sample of samples) {
      throwIfAborted(signal);
      const timestamp = this.chunkTimestampUs(sample);
      const data = sampleBytes(this.movie, sample).slice();
      const chunk = new EncodedVideoChunk({
        type: sample.isKeyframe ? "key" : "delta",
        timestamp,
        duration: Math.max(1, Math.round((sample.durationTimescale / this.movie.timescale) * 1_000_000)),
        data,
      });
      const promise = new Promise<VideoFrame>((resolve, reject) => {
        const onAbort = () => {
          this.waiters.delete(timestamp);
          reject(abortedError(signal));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        this.waiters.set(timestamp, {
          resolve: (f) => {
            signal?.removeEventListener("abort", onAbort);
            resolve(f);
          },
          reject: (e) => {
            signal?.removeEventListener("abort", onAbort);
            reject(e);
          },
        });
      });
      pending.push({ index: sample.index, timestamp, promise });
      try {
        this.decoder.decode(chunk);
      } catch (e) {
        this.waiters.delete(timestamp);
        throw new AfeError("AFE_DECODE_FAILED", e instanceof Error ? e.message : String(e));
      }
    }

    try {
      await this.decoder.flush();
    } catch (e) {
      if (signal?.aborted) throw abortedError(signal);
      throw new AfeError("AFE_DECODE_FAILED", e instanceof Error ? e.message : String(e));
    }

    const out = new Map<number, VideoFrame>();
    for (const item of pending) {
      const frame = await item.promise;
      if (this.closed || gen !== this.generation) {
        try {
          frame.close();
        } catch {
          /* */
        }
        throw new AfeError("AFE_DECODE_FAILED", "decoder superseded", false);
      }
      out.set(item.index, frame);
    }
    throwIfAborted(signal);
    return out;
  }

  close(): void {
    this.closed = true;
    this.generation += 1;
    this.rejectWaiters(new AfeError("AFE_ABORTED", "decoder closed", false));
    this.teardown();
  }

  private onOutput(frame: VideoFrame): void {
    if (this.closed) {
      frame.close();
      return;
    }
    const waiter = this.waiters.get(frame.timestamp);
    if (waiter) {
      this.waiters.delete(frame.timestamp);
      waiter.resolve(frame);
      return;
    }
    // Timestamp mismatch: attach to the nearest pending waiter.
    let best: number | undefined;
    let bestDelta = Infinity;
    for (const ts of this.waiters.keys()) {
      const d = Math.abs(ts - frame.timestamp);
      if (d < bestDelta) {
        bestDelta = d;
        best = ts;
      }
    }
    if (best != null && bestDelta < 2) {
      const w = this.waiters.get(best);
      this.waiters.delete(best);
      w?.resolve(frame);
      return;
    }
    frame.close();
  }

  private onError(e: DOMException): void {
    const err = new AfeError("AFE_DECODE_FAILED", e.message || "VideoDecoder error");
    this.lastError = err;
    this.rejectWaiters(err);
  }

  private rejectWaiters(err: Error): void {
    const pending = [...this.waiters.values()];
    this.waiters.clear();
    for (const w of pending) w.reject(err);
  }

  private teardown(): void {
    this.configured = false;
    if (this.decoder) {
      try {
        this.decoder.close();
      } catch {
        /* already closed */
      }
    }
    this.decoder = null;
  }
}
