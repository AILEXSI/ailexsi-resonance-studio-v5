import { FRAME_MS, projectDurationMs, type Project } from "./models";

export function playbackBounds(project: Project): { startMs: number; endMs: number } {
  const startMs = project.inPointMs ?? 0;
  const endMs = project.outPointMs ?? Math.max(startMs + FRAME_MS, projectDurationMs(project));
  return { startMs, endMs };
}

/** JKL shuttle steps. 0 = paused. Cap ±4. */
export const SHUTTLE_RATES = [0, 1, 2, 4] as const;

export function nextShuttleRate(current: number, dir: -1 | 0 | 1): number {
  if (dir === 0) return 0;
  if (dir > 0) {
    if (current <= 0) return 1;
    if (current < 2) return 2;
    return 4;
  }
  if (current >= 0) return -1;
  if (current > -2) return -2;
  return -4;
}

export function advancePlayhead(
  project: Project,
  deltaMs: number,
): { playheadMs: number; stopped: boolean } {
  const { startMs, endMs } = playbackBounds(project);
  let next = project.playheadMs + deltaMs;
  if (next >= endMs) {
    if (project.loop) return { playheadMs: startMs, stopped: false };
    return { playheadMs: endMs, stopped: true };
  }
  if (next <= startMs) {
    if (deltaMs < 0) {
      if (project.loop) return { playheadMs: endMs, stopped: false };
      return { playheadMs: startMs, stopped: true };
    }
    if (next < 0) next = 0;
  }
  if (next < 0) next = 0;
  return { playheadMs: next, stopped: false };
}
