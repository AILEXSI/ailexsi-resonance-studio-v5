/**
 * Per-clip linear fade in/out. Shared by preview audio, export mix, and video opacity.
 * Fade factor is 0..1; gainAtClipTime multiplies that by clip.gain.
 */

export type Fadeable = {
  durationMs: number;
  fadeInMs?: number;
  fadeOutMs?: number;
};

export type GainFadeable = Fadeable & { gain: number };

/** Clamp each fade to [0, duration]. If they would overlap, scale both so they meet in the middle. */
export function normalizeClipFades(
  fadeInMs: number,
  fadeOutMs: number,
  durationMs: number,
): { fadeInMs: number; fadeOutMs: number } {
  const dur = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  let fadeIn = Number.isFinite(fadeInMs) ? fadeInMs : 0;
  let fadeOut = Number.isFinite(fadeOutMs) ? fadeOutMs : 0;
  fadeIn = Math.max(0, Math.min(dur, fadeIn));
  fadeOut = Math.max(0, Math.min(dur, fadeOut));
  const sum = fadeIn + fadeOut;
  if (sum > dur && sum > 0) {
    const scale = dur / sum;
    fadeIn *= scale;
    fadeOut *= scale;
  }
  return { fadeInMs: fadeIn, fadeOutMs: fadeOut };
}

export function applyNormalizedFades<T extends Fadeable>(clip: T): T {
  const { fadeInMs, fadeOutMs } = normalizeClipFades(
    clip.fadeInMs ?? 0,
    clip.fadeOutMs ?? 0,
    clip.durationMs,
  );
  if (clip.fadeInMs === fadeInMs && clip.fadeOutMs === fadeOutMs) return clip;
  return { ...clip, fadeInMs, fadeOutMs };
}

/** Linear envelope 0..1 at clip-local time. 0→1 over fadeIn, 1 in the middle, 1→0 over fadeOut. */
export function fadeFactorAt(clip: Fadeable, localMs: number): number {
  const durationMs = Math.max(0, clip.durationMs);
  const { fadeInMs, fadeOutMs } = normalizeClipFades(
    clip.fadeInMs ?? 0,
    clip.fadeOutMs ?? 0,
    durationMs,
  );
  if (durationMs <= 0 || !Number.isFinite(localMs)) return 0;
  if (localMs < 0 || localMs > durationMs) return 0;

  let factor = 1;
  if (fadeInMs > 0 && localMs < fadeInMs) {
    factor = localMs / fadeInMs;
  }
  if (fadeOutMs > 0 && localMs > durationMs - fadeOutMs) {
    factor = Math.min(factor, (durationMs - localMs) / fadeOutMs);
  }
  return Math.max(0, Math.min(1, factor));
}

/** Fade factor times existing clip gain. Mute/solo/track fader are applied by the caller. */
export function gainAtClipTime(clip: GainFadeable, localMs: number): number {
  return fadeFactorAt(clip, localMs) * Math.max(0, Number.isFinite(clip.gain) ? clip.gain : 0);
}

/** Canvas/CSS alpha: same factor, clamped to 0..1 (clip gain may be > 1). */
export function videoAlphaAtClipTime(clip: GainFadeable, localMs: number): number {
  return Math.min(1, gainAtClipTime(clip, localMs));
}

export type GainEnvelopePoint = { tMs: number; value: number };

/** Keyframes for an AudioParam linear envelope. `peak` is already-mixed clip/track/master gain. */
export function clipGainEnvelope(
  durationMs: number,
  fadeInMs: number,
  fadeOutMs: number,
  peak: number,
): GainEnvelopePoint[] {
  const { fadeInMs: fadeIn, fadeOutMs: fadeOut } = normalizeClipFades(
    fadeInMs,
    fadeOutMs,
    durationMs,
  );
  const p = Math.max(0, Number.isFinite(peak) ? peak : 0);
  const points: GainEnvelopePoint[] = [{ tMs: 0, value: fadeIn > 0 ? 0 : p }];
  if (fadeIn > 0) points.push({ tMs: fadeIn, value: p });
  if (fadeOut > 0) {
    const outStart = durationMs - fadeOut;
    if (outStart > fadeIn) points.push({ tMs: outStart, value: p });
    points.push({ tMs: durationMs, value: 0 });
  } else {
    points.push({ tMs: durationMs, value: p });
  }
  return points;
}

export function scheduleGainEnvelope(
  param: { setValueAtTime(value: number, time: number): unknown; linearRampToValueAtTime(value: number, time: number): unknown },
  startMs: number,
  durationMs: number,
  fadeInMs: number,
  fadeOutMs: number,
  peak: number,
): void {
  const points = clipGainEnvelope(durationMs, fadeInMs, fadeOutMs, peak);
  points.forEach((point, i) => {
    const t = (startMs + point.tMs) / 1000;
    if (i === 0) param.setValueAtTime(point.value, t);
    else param.linearRampToValueAtTime(point.value, t);
  });
}
