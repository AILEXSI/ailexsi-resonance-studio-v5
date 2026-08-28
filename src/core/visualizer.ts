import {
  topVideoClipAt,
  type Project,
  type VisualizerSceneId,
} from "./models";

export const BEAT_WINDOW_MS = 90;
export const DEFAULT_VISUALIZER_BPM = 120;

export interface VisualizerFeatures {
  timeMs: number;
  energy: number;
  bass: number;
  mid: number;
  high: number;
}

/** 120 BPM grid (or `bpm`) from 0 inclusive to duration exclusive. */
export function beatGrid(durationMs: number, bpm = DEFAULT_VISUALIZER_BPM): number[] {
  if (durationMs <= 0 || bpm <= 0) return [];
  const interval = 60_000 / bpm;
  const beats: number[] = [];
  for (let t = 0; t < durationMs; t += interval) beats.push(t);
  return beats;
}

/** 0..1 pulse: 1 on a beat, 0 when the nearest beat is >= 90ms away. */
export function energyAt(timeMs: number, beatsMs: number[]): number {
  if (beatsMs.length === 0) return 0;
  let nearest = Infinity;
  for (const beat of beatsMs) {
    const dist = Math.abs(timeMs - beat);
    if (dist < nearest) nearest = dist;
  }
  if (nearest >= BEAT_WINDOW_MS) return 0;
  return 1 - nearest / BEAT_WINDOW_MS;
}

/**
 * Synthetic bands from the 120 BPM grid (and its 2× subdivision).
 * Not an FFT of any media file — there is no network and no decode.
 */
export function featuresAt(timeMs: number, durationMs: number): VisualizerFeatures {
  const span = Math.max(0, durationMs);
  const beats = beatGrid(span);
  const energy = energyAt(timeMs, beats);
  const eighths = beatGrid(span, DEFAULT_VISUALIZER_BPM * 2);
  const hats = energyAt(timeMs, eighths);
  return {
    timeMs,
    energy,
    bass: energy,
    mid: clamp01(energy * 0.55 + hats * 0.45),
    high: clamp01(hats * (0.35 + 0.65 * (1 - energy))),
  };
}

export function nextSceneId(current: VisualizerSceneId): VisualizerSceneId {
  return current === "spectrum-bars" ? "pulse-orb" : "spectrum-bars";
}

export function sceneShortName(sceneId: VisualizerSceneId): string {
  return sceneId === "pulse-orb" ? "Orb" : "Bars";
}

/** Main Output fallback: visualizer only when no unmuted V1/V2 clip is under the playhead. */
export function shouldShowVisualizer(project: Project, timeMs: number): boolean {
  if (!project.visualizer.enabled || project.visualizer.muted) return false;
  if (topVideoClipAt(project, timeMs)) return false;
  return true;
}

export function toggleVisualizerMute(project: Project): Project {
  return {
    ...project,
    visualizer: { ...project.visualizer, muted: !project.visualizer.muted },
    updatedAt: new Date().toISOString(),
  };
}

export function cycleVisualizerScene(project: Project): Project {
  return {
    ...project,
    visualizer: {
      ...project.visualizer,
      sceneId: nextSceneId(project.visualizer.sceneId),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function renderVisualizerScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sceneId: VisualizerSceneId,
  features: VisualizerFeatures,
  dt: number,
): void {
  if (w <= 0 || h <= 0) return;
  if (sceneId === "pulse-orb") {
    renderPulseOrb(ctx, w, h, features, dt);
    return;
  }
  renderSpectrumBars(ctx, w, h, features, dt);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function renderSpectrumBars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  features: VisualizerFeatures,
  dt: number,
): void {
  ctx.fillStyle = "#050608";
  ctx.fillRect(0, 0, w, h);
  const bars = 32;
  const gap = Math.max(1, w / 220);
  const barW = Math.max(1, (w - gap * (bars + 1)) / bars);
  const attack = 1 + Math.min(0.25, Math.max(0, dt) * 4);
  for (let i = 0; i < bars; i += 1) {
    const t = i / (bars - 1);
    const band = t < 1 / 3 ? features.bass : t < 2 / 3 ? features.mid : features.high;
    const wobble = 0.12 * Math.abs(Math.sin(features.timeMs / 130 + i * 0.45));
    const amp = clamp01(band * 0.88 + wobble * features.energy) * attack;
    const height = Math.max(2, amp * h * 0.88);
    const x = gap + i * (barW + gap);
    const hue = 38 + t * 36;
    const light = 42 + features.energy * 28;
    ctx.fillStyle = `hsl(${hue} 72% ${light}%)`;
    ctx.fillRect(x, h - height, barW, height);
  }
}

function renderPulseOrb(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  features: VisualizerFeatures,
  dt: number,
): void {
  ctx.fillStyle = "#050608";
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const base = Math.min(w, h) * 0.16;
  const bloom = 1 + Math.min(0.2, Math.max(0, dt) * 3);
  const r = base * (1 + features.energy * 1.45) * bloom;
  const glow = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r * 2.4);
  glow.addColorStop(0, `rgba(212, 180, 90, ${0.32 + features.energy * 0.55})`);
  glow.addColorStop(0.5, `rgba(122, 162, 255, ${0.12 + features.energy * 0.28})`);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(238, 242, 247, ${0.18 + features.energy * 0.62})`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * (1.28 + features.energy * 0.45), 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(212, 180, 90, ${0.18 + features.energy * 0.72})`;
  ctx.lineWidth = 2 + features.energy * 5;
  ctx.stroke();
}
