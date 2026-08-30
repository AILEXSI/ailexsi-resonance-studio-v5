/** Downsample a channel to max-abs peaks. Pure — no WebAudio. */
export function peaksFromChannel(samples: ArrayLike<number>, buckets: number): Float32Array {
  const n = Math.max(1, Math.floor(buckets));
  const out = new Float32Array(n);
  const len = samples.length;
  if (len === 0) return out;
  const span = len / n;
  for (let i = 0; i < n; i += 1) {
    const start = Math.floor(i * span);
    const end = Math.min(len, Math.floor((i + 1) * span));
    let peak = 0;
    for (let s = start; s < end; s += 1) {
      const v = Math.abs(samples[s] ?? 0);
      if (v > peak) peak = v;
    }
    out[i] = peak;
  }
  return out;
}

export function slicePeaks(
  peaks: Float32Array,
  sourceInMs: number,
  sourceOutMs: number,
  assetDurationMs: number,
): Float32Array {
  if (peaks.length === 0) return peaks;
  const dur = Math.max(assetDurationMs, 1);
  const a = Math.max(0, Math.min(1, sourceInMs / dur));
  const b = Math.max(a + 1 / peaks.length, Math.min(1, sourceOutMs / dur));
  const i0 = Math.floor(a * peaks.length);
  const i1 = Math.max(i0 + 1, Math.ceil(b * peaks.length));
  return peaks.subarray(i0, i1);
}

/** Midline SVG path: up and down from each peak. */
export function peaksToPath(peaks: Float32Array, width: number, height: number): string {
  const w = Math.max(1, width);
  const h = Math.max(2, height);
  const mid = h / 2;
  const n = peaks.length;
  if (n === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const x = (i / Math.max(1, n - 1)) * w;
    const amp = Math.min(1, peaks[i] ?? 0) * (mid - 1);
    if (i === 0) parts.push(`M ${x.toFixed(2)} ${(mid - amp).toFixed(2)}`);
    else parts.push(`L ${x.toFixed(2)} ${(mid - amp).toFixed(2)}`);
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    const x = (i / Math.max(1, n - 1)) * w;
    const amp = Math.min(1, peaks[i] ?? 0) * (mid - 1);
    parts.push(`L ${x.toFixed(2)} ${(mid + amp).toFixed(2)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

export const FILMSTRIP_THUMB_PX = 48;

/** Source-media timestamps (ms) spaced along the clip for a filmstrip. */
export function filmstripTimes(opts: {
  sourceInMs: number;
  sourceOutMs: number;
  clipWidthPx: number;
  thumbWidthPx?: number;
}): number[] {
  const thumb = Math.max(16, opts.thumbWidthPx ?? FILMSTRIP_THUMB_PX);
  const n = Math.max(1, Math.floor(opts.clipWidthPx / thumb));
  const span = Math.max(1, opts.sourceOutMs - opts.sourceInMs);
  const times: number[] = [];
  for (let i = 0; i < n; i += 1) {
    times.push(opts.sourceInMs + ((i + 0.5) / n) * span);
  }
  return times;
}

export async function collectFilmstripTimes(
  opts: Parameters<typeof filmstripTimes>[0],
  fetchFrame: (timeMs: number) => Promise<unknown>,
): Promise<{ timeMs: number; frame: unknown }[]> {
  const times = filmstripTimes(opts);
  const out: { timeMs: number; frame: unknown }[] = [];
  for (const timeMs of times) {
    out.push({ timeMs, frame: await fetchFrame(timeMs) });
  }
  return out;
}
