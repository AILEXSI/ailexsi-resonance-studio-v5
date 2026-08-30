import { useEffect, useState } from "react";
import {
  FILMSTRIP_THUMB_PX,
  filmstripTimes,
  peaksFromChannel,
  peaksToPath,
  slicePeaks,
} from "../../core/clip-preview";
import { decodeAudio, isPlayableSource, loadVideo, seekVideo } from "../../core/exporter/media";
import type { Clip, MediaAsset } from "../../core/models";

const peakCache = new Map<string, Float32Array>();
const thumbCache = new Map<string, string>();

export function AudioClipWave(props: {
  clip: Clip;
  asset: MediaAsset;
  peaks?: Float32Array | null;
}) {
  const { clip, asset, peaks: injected } = props;
  const [peaks, setPeaks] = useState<Float32Array | null>(injected ?? null);

  useEffect(() => {
    if (injected) {
      setPeaks(injected);
      return;
    }
    const url = asset.objectUrl;
    if (!url || !isPlayableSource(url)) return;
    const cached = peakCache.get(url);
    if (cached) {
      setPeaks(cached);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const buf = await decodeAudio(url);
        const samples = buf.getChannelData(0);
        const next = peaksFromChannel(samples, 1024);
        peakCache.set(url, next);
        if (!cancelled) setPeaks(next);
      } catch {
        /* keep green fill */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.objectUrl, injected]);

  if (!peaks || peaks.length === 0) return null;
  const sliced = slicePeaks(peaks, clip.sourceInMs, clip.sourceOutMs, asset.durationMs);
  const d = peaksToPath(sliced, 200, 36);
  if (!d) return null;
  return (
    <svg
      className="clip-wave"
      data-testid={`clip-wave-${clip.id}`}
      viewBox="0 0 200 36"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

async function grabThumb(url: string, timeMs: number): Promise<string | null> {
  const key = `${url}@${Math.round(timeMs)}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  try {
    const el = await loadVideo(url);
    await seekVideo(el, timeMs / 1000);
    const canvas = document.createElement("canvas");
    canvas.width = FILMSTRIP_THUMB_PX;
    canvas.height = 36;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    const src = canvas.toDataURL("image/jpeg", 0.65);
    thumbCache.set(key, src);
    return src;
  } catch {
    return null;
  }
}

export function VideoClipStrip(props: {
  clip: Clip;
  asset: MediaAsset;
  clipWidthPx: number;
  fetchFrame?: (timeMs: number) => Promise<string | null>;
}) {
  const { clip, asset, clipWidthPx, fetchFrame } = props;
  const [thumbs, setThumbs] = useState<Array<{ timeMs: number; src: string }>>([]);

  useEffect(() => {
    const url = asset.objectUrl;
    const times = filmstripTimes({
      sourceInMs: clip.sourceInMs,
      sourceOutMs: clip.sourceOutMs,
      clipWidthPx,
    });
    let cancelled = false;
    const loader = fetchFrame ?? (url && isPlayableSource(url) ? (t: number) => grabThumb(url, t) : null);
    if (!loader) return;
    setThumbs([]);
    void (async () => {
      const next: Array<{ timeMs: number; src: string }> = [];
      for (const timeMs of times) {
        const src = await loader(timeMs);
        if (cancelled) return;
        if (src) {
          next.push({ timeMs, src });
          setThumbs([...next]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.objectUrl, clip.sourceInMs, clip.sourceOutMs, clipWidthPx, fetchFrame]);

  if (thumbs.length === 0) return null;
  return (
    <div className="clip-filmstrip" data-testid={`clip-filmstrip-${clip.id}`} aria-hidden="true">
      {thumbs.map((t) => (
        <img key={t.timeMs} src={t.src} alt="" />
      ))}
    </div>
  );
}
