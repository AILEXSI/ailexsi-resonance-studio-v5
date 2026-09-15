/**
 * Frame-accurate source frames for export.
 * Production default is Mediabunny. AILEXSI Frame Engine is an internal
 * challenger; HTMLVideo remains the existing fallback when a decoder cannot open.
 */
import { clipRateOf } from "../models";
import {
  createFrameSourceBackend,
  isAfeError,
  type DrawableFrame,
  type FrameSourceBackendId,
  type OpenedFrameSource,
} from "../frame-engine";
import type { ExportClip } from "./types";
import { isPlayableSource } from "./media";

export type { DrawableFrame, FrameSourceBackendId };

export type OpenedDecoder = {
  identity: FrameSourceBackendId;
  source: OpenedFrameSource;
  samplesAtTimestamps(
    timestamps: Iterable<number>,
    signal?: AbortSignal,
  ): AsyncIterable<DrawableFrame | null>;
  close(): void;
};

let frameSourceBackend: FrameSourceBackendId = "mediabunny";

export function getFrameSourceBackend(): FrameSourceBackendId {
  return frameSourceBackend;
}

/** Testing / internal only. Production default remains Mediabunny. */
export function setFrameSourceBackend(next: FrameSourceBackendId): void {
  frameSourceBackend = next === "ailexsi" || next === "htmlvideo" || next === "mediabunny" ? next : "mediabunny";
}

export function resetFrameSourceBackend(): void {
  frameSourceBackend = "mediabunny";
}

const decoderCache = new Map<string, Promise<OpenedDecoder | null>>();

/** Source media time (seconds) at the center of an output frame. */
export function sourceTimeSec(clip: ExportClip, timelineMs: number, fps: number): number {
  const srcIn = clip.sourceInMs ?? 0;
  const offset = Math.max(0, timelineMs - clip.startMs);
  let srcMs = srcIn + offset * clipRateOf(clip) + 500 / Math.max(1, fps);
  if (clip.sourceOutMs != null && clip.sourceOutMs > srcIn) {
    srcMs = Math.min(srcMs, clip.sourceOutMs - 1);
  }
  return Math.max(0, srcMs / 1000);
}

function wrapOpened(source: OpenedFrameSource): OpenedDecoder {
  return {
    identity: source.identity,
    source,
    samplesAtTimestamps(timestamps: Iterable<number>, signal?: AbortSignal) {
      return source.getFramesAt([...timestamps], signal);
    },
    close() {
      source.close();
    },
  };
}

async function openPreferred(src: string, signal?: AbortSignal): Promise<OpenedDecoder | null> {
  if (frameSourceBackend === "htmlvideo") return null;
  if (!isPlayableSource(src)) return null;

  if (frameSourceBackend === "ailexsi") {
    try {
      return wrapOpened(await createFrameSourceBackend("ailexsi").open(src, signal));
    } catch (e) {
      if (isAfeError(e) && e.code === "AFE_ABORTED") throw e;
      if (isAfeError(e) && e.fallbackSafe) {
        try {
          return wrapOpened(await createFrameSourceBackend("mediabunny").open(src, signal));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  try {
    return wrapOpened(await createFrameSourceBackend("mediabunny").open(src, signal));
  } catch {
    return null;
  }
}

export function getDecoder(src: string, signal?: AbortSignal): Promise<OpenedDecoder | null> {
  if (frameSourceBackend === "htmlvideo") return Promise.resolve(null);
  if (!isPlayableSource(src)) return Promise.resolve(null);
  const key = `${frameSourceBackend}:${src}`;
  const hit = decoderCache.get(key);
  if (hit) return hit;
  const opened = openPreferred(src, signal);
  decoderCache.set(key, opened);
  return opened;
}

export function drawContain(
  _ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  srcW: number,
  srcH: number,
  draw: (dx: number, dy: number, dw: number, dh: number) => void,
): void {
  if (srcW < 2 || srcH < 2) return;
  const scale = Math.min(canvas.width / srcW, canvas.height / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  draw((canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

export function clearFrameSources(): void {
  for (const pending of decoderCache.values()) {
    void pending.then((opened) => {
      try {
        opened?.close();
      } catch {
        /* already gone */
      }
    });
  }
  decoderCache.clear();
}
