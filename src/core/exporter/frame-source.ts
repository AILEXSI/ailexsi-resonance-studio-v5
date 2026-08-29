/**
 * Frame-accurate source frames for export.
 * HTMLVideoElement.currentTime snaps to GOP keyframes, so the exporter
 * decodes with Mediabunny VideoSampleSink.samplesAtTimestamps when possible.
 */
import {
  ALL_FORMATS,
  BlobSource,
  Input,
  UrlSource,
  VideoSampleSink,
} from "mediabunny";
import type { ExportClip } from "./types";
import { isPlayableSource } from "./media";

export type OpenedDecoder = {
  input: Input;
  sink: VideoSampleSink;
};

const decoderCache = new Map<string, Promise<OpenedDecoder | null>>();

/** Source media time (seconds) at the center of an output frame. */
export function sourceTimeSec(clip: ExportClip, timelineMs: number, fps: number): number {
  const srcIn = clip.sourceInMs ?? 0;
  const offset = Math.max(0, timelineMs - clip.startMs);
  let srcMs = srcIn + offset + 500 / Math.max(1, fps);
  if (clip.sourceOutMs != null && clip.sourceOutMs > srcIn) {
    srcMs = Math.min(srcMs, clip.sourceOutMs - 1);
  }
  return Math.max(0, srcMs / 1000);
}

async function sourceForUrl(src: string) {
  if (src.startsWith("blob:") || src.startsWith("file:")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to read media (${res.status})`);
    return new BlobSource(await res.blob());
  }
  return new UrlSource(src);
}

export function getDecoder(src: string): Promise<OpenedDecoder | null> {
  if (!isPlayableSource(src)) return Promise.resolve(null);
  const hit = decoderCache.get(src);
  if (hit) return hit;
  const opened = (async (): Promise<OpenedDecoder | null> => {
    try {
      const input = new Input({
        source: await sourceForUrl(src),
        formats: ALL_FORMATS,
      });
      const track = await input.getPrimaryVideoTrack();
      if (!track) {
        input.dispose();
        return null;
      }
      if (!(await track.canDecode())) {
        input.dispose();
        return null;
      }
      return {
        input,
        sink: new VideoSampleSink(track),
      };
    } catch {
      return null;
    }
  })();
  decoderCache.set(src, opened);
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
        opened?.input.dispose();
      } catch {
        /* already gone */
      }
    });
  }
  decoderCache.clear();
}
