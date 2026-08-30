/**
 * Optional live A1/A2 AnalyserNode tap for Visualz setFeatures.
 * MediaElementSource can only be created once per element, so sources are
 * cached for the page lifetime. If Web Audio is unavailable or tap fails,
 * the host must use the synthetic 120 BPM AudioFeatures fallback.
 */

import { createFeatureExtractor, type FeatureExtractor } from "./feature-extractor";
import type { AudioFeatures } from "./types";

export interface MixPeaks {
  A1: number;
  A2: number;
  master: number;
}

export interface PlaybackTap {
  sample(timeMs: number): AudioFeatures;
  resume(): void;
  disconnect(): void;
  setGains(gains: {
    A1: number;
    A2: number;
    master: number;
    A1pan?: number;
    A2pan?: number;
  }): void;
  peaks(): MixPeaks;
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
  const masterAnalyser = ctx.createAnalyser();
  masterAnalyser.fftSize = 512;
  mixer.connect(masterAnalyser);
  masterAnalyser.connect(ctx.destination);

  const trackGains: GainNode[] = [];
  const trackPanners: Array<StereoPannerNode | null> = [];
  const trackAnalysers: AnalyserNode[] = [];
  let connected = 0;
  for (const el of media) {
    const source = sourceFor(ctx, el);
    if (!source) continue;
    try {
      const gain = ctx.createGain();
      gain.gain.value = 1;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      let panner: StereoPannerNode | null = null;
      if (typeof ctx.createStereoPanner === "function") {
        panner = ctx.createStereoPanner();
        panner.pan.value = 0;
        source.connect(gain);
        gain.connect(panner);
        panner.connect(analyser);
      } else {
        source.connect(gain);
        gain.connect(analyser);
      }
      analyser.connect(mixer);
      trackGains.push(gain);
      trackPanners.push(panner);
      trackAnalysers.push(analyser);
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

  const peakBuf = new Float32Array(512);
  const readPeak = (node: AnalyserNode): number => {
    try {
      node.getFloatTimeDomainData(peakBuf);
    } catch {
      return 0;
    }
    let p = 0;
    for (let i = 0; i < peakBuf.length; i += 1) p = Math.max(p, Math.abs(peakBuf[i] ?? 0));
    return p;
  };

  return {
    sample(timeMs: number) {
      return extractor.sample(timeMs);
    },
    resume() {
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    },
    setGains(gains) {
      const a1 = trackGains[0];
      const a2 = trackGains[1];
      if (a1) a1.gain.value = Math.max(0, gains.A1);
      if (a2) a2.gain.value = Math.max(0, gains.A2);
      mixer.gain.value = Math.max(0, gains.master);
      const p1 = trackPanners[0];
      const p2 = trackPanners[1];
      if (p1 && gains.A1pan != null) p1.pan.value = Math.max(-1, Math.min(1, gains.A1pan));
      if (p2 && gains.A2pan != null) p2.pan.value = Math.max(-1, Math.min(1, gains.A2pan));
    },
    peaks() {
      return {
        A1: trackAnalysers[0] ? readPeak(trackAnalysers[0]) : 0,
        A2: trackAnalysers[1] ? readPeak(trackAnalysers[1]) : 0,
        master: readPeak(masterAnalyser),
      };
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
