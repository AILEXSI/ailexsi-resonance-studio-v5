/**
 * Optional live A1/A2 AnalyserNode tap for Visualz setFeatures.
 * MediaElementSource can only be created once per element, so sources are
 * cached for the page lifetime. If Web Audio is unavailable or tap fails,
 * the host must use the synthetic 120 BPM AudioFeatures fallback.
 */

import { createFeatureExtractor, type FeatureExtractor } from "./feature-extractor";
import type { AudioFeatures } from "./types";

export interface PlaybackTap {
  sample(timeMs: number): AudioFeatures;
  resume(): void;
  disconnect(): void;
}

const sourceCache = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
let sharedCtx: AudioContext | null = null;

function audioCtor(): typeof AudioContext | undefined {
  if (typeof AudioContext !== "undefined") return AudioContext;
  return (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function sharedAudioContext(): AudioContext | null {
  if (sharedCtx && sharedCtx.state !== "closed") return sharedCtx;
  const Ctor = audioCtor();
  if (!Ctor) return null;
  try {
    sharedCtx = new Ctor();
    return sharedCtx;
  } catch {
    sharedCtx = null;
    return null;
  }
}

function sourceFor(ctx: AudioContext, el: HTMLMediaElement): MediaElementAudioSourceNode | null {
  const cached = sourceCache.get(el);
  if (cached) return cached;
  try {
    const source = ctx.createMediaElementSource(el);
    sourceCache.set(el, source);
    return source;
  } catch {
    return null;
  }
}

export function createPlaybackTap(
  elements: Array<HTMLMediaElement | null>,
): PlaybackTap | null {
  const ctx = sharedAudioContext();
  if (!ctx) return null;

  const media = elements.filter((el): el is HTMLMediaElement => el != null);
  if (media.length === 0) return null;

  const mixer = ctx.createGain();
  mixer.gain.value = 1;
  mixer.connect(ctx.destination);

  let connected = 0;
  for (const el of media) {
    const source = sourceFor(ctx, el);
    if (!source) continue;
    try {
      source.connect(mixer);
      connected += 1;
    } catch {
      // already wired this tick
    }
  }

  if (connected === 0) {
    try {
      mixer.disconnect();
    } catch {
      /* ignore */
    }
    return null;
  }

  let extractor: FeatureExtractor;
  try {
    extractor = createFeatureExtractor(ctx, mixer);
  } catch {
    try {
      mixer.disconnect();
    } catch {
      /* ignore */
    }
    return null;
  }

  return {
    sample(timeMs: number) {
      return extractor.sample(timeMs);
    },
    resume() {
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    },
    disconnect() {
      extractor.disconnect();
      try {
        mixer.disconnect();
      } catch {
        /* ignore */
      }
      // Keep shared AudioContext + MediaElementSources; they cannot be recreated.
    },
  };
}

/** Prefer live analyser when it has energy; otherwise keep the synthetic grid. */
export function preferLiveFeatures(
  live: AudioFeatures | null | undefined,
  fallback: AudioFeatures,
): AudioFeatures {
  if (!live) return fallback;
  const energy = live.rms + live.bass + live.mid + live.treble;
  if (energy < 0.02 && !live.onset) return fallback;
  return live;
}
