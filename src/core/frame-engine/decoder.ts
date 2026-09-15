import { decoderConfigOf } from "./avc-config";
import { AfeError, abortedError, throwIfAborted } from "./errors";
import { afePerfAdd, afePerfCount, afePerfEnabled, afePerfMarkDecoded, afePerfProbeInstalled } from "./perf";
import type { AfeMovie, AfeSample } from "./types";
import { sampleBytes } from "./mp4-reader";

export class AfeVideoDecoder {
  private decoder: VideoDecoder | null = null;
  private waiters = new Map<number, { resolve: (frame: VideoFrame) => void; reject: (e: Error) => void }>();
  private generation = 0;
  private closed = false;
  private lastError: Error | null = null;
  private configured = false;
  /** WebCodecs requires a key chunk after configure() or flush(). */
  needsKeyframe = true;

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
    if (!afePerfProbeInstalled()) afePerfCount("decoderCreates");
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
      this.needsKeyframe = true;
      if (!afePerfProbeInstalled()) afePerfCount("decoderConfigures");
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
        if (!afePerfProbeInstalled()) afePerfCount("decoderResets");
        this.decoder.configure(decoderConfigOf(this.movie.avc));
        this.needsKeyframe = true;
        if (!afePerfProbeInstalled()) afePerfCount("decoderConfigures");
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

  /** Submit one sample after ensure(). Decode order is the call order. Does not flush. */
  enqueueSample(sample: AfeSample, signal?: AbortSignal): Promise<VideoFrame> {
    throwIfAborted(signal);
    if (!this.decoder) throw new AfeError("AFE_DECODE_FAILED", "decoder missing");
    if (this.lastError) throw this.lastError;
    if (this.needsKeyframe && !sample.isKeyframe) {
      throw new AfeError("AFE_DECODE_FAILED", "key frame required after configure/flush", false);
    }
    const timestamp = this.chunkTimestampUs(sample);
    const read0 = afePerfEnabled() && typeof performance !== "undefined" ? performance.now() : 0;
    const data = sampleBytes(this.movie, sample).slice();
    if (afePerfEnabled()) {
      afePerfAdd("encodedSampleRead", performance.now() - read0);
      afePerfCount("sampleByteSlices");
      afePerfMarkDecoded(sample.index);
    }
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
    try {
      this.decoder.decode(chunk);
      if (sample.isKeyframe) this.needsKeyframe = false;
    } catch (e) {
      this.waiters.delete(timestamp);
      throw new AfeError("AFE_DECODE_FAILED", e instanceof Error ? e.message : String(e));
    }
    return promise;
  }

  async submitSample(sample: AfeSample, signal?: AbortSignal): Promise<VideoFrame> {
    await this.ensure(signal);
    return this.enqueueSample(sample, signal);
  }

  async releaseHeld(signal?: AbortSignal): Promise<void> {
    await this.settleOutputs(signal, false);
  }

  /**
   * Decode `samples` in order. Do not flush between sequential calls — flush()
   * forces the next chunk to be a keyframe and destroys forward state.
   */
  async decodeRange(
    samples: AfeSample[],
    signal?: AbortSignal,
    persist = false,
  ): Promise<Map<number, VideoFrame>> {
    throwIfAborted(signal);
    if (samples.length === 0) return new Map();
    await this.ensure(signal);
    const gen = this.generation;
    const pending: { index: number; promise: Promise<VideoFrame> }[] = [];
    for (const sample of samples) {
      pending.push({ index: sample.index, promise: this.enqueueSample(sample, signal) });
    }
    await this.settleOutputs(signal, persist);
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

  /**
   * Wait for VideoDecoder outputs without flush() when possible.
   * flush() forces the next chunk to be a keyframe and makes the scheduler
   * restart the GOP — measured AFE-02 baseline: 102 chunks for 60 frames.
   */
  private async settleOutputs(signal?: AbortSignal, persist = false): Promise<void> {
    const dec = this.decoder;
    if (!dec || this.waiters.size === 0) return;

    const waitDequeue = () =>
      new Promise<void>((resolve) => {
        const done = () => {
          dec.removeEventListener("dequeue", done);
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(done, 16);
        dec.addEventListener("dequeue", done);
      });

    while (dec.decodeQueueSize > 0) {
      throwIfAborted(signal);
      await waitDequeue();
    }

    if (persist && this.waiters.size > 0) {
      const stallMs = 40;
      let lastSize = this.waiters.size;
      let lastChange = typeof performance !== "undefined" ? performance.now() : Date.now();
      while (this.waiters.size > 0) {
        throwIfAborted(signal);
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - lastChange >= stallMs) break;
        await new Promise<void>((r) => setTimeout(r, 0));
        if (this.waiters.size < lastSize) {
          lastSize = this.waiters.size;
          lastChange = typeof performance !== "undefined" ? performance.now() : Date.now();
        }
      }
    }

    if (this.waiters.size === 0) return;
    try {
      await dec.flush();
      if (!afePerfProbeInstalled()) afePerfCount("decoderFlushes");
      this.needsKeyframe = true;
    } catch (e) {
      if (signal?.aborted) throw abortedError(signal);
      throw new AfeError("AFE_DECODE_FAILED", e instanceof Error ? e.message : String(e));
    }
  }

  close(): void {
    this.closed = true;
    this.generation += 1;
    this.rejectWaiters(new AfeError("AFE_ABORTED", "decoder closed", false));
    this.teardown();
  }

  private onOutput(frame: VideoFrame): void {
    afePerfCount("framesDecoded");
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
    this.needsKeyframe = true;
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
