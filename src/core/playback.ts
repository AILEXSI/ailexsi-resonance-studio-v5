import { FRAME_MS, projectDurationMs, type Project } from "./models";

export function playbackBounds(project: Project): { startMs: number; endMs: number } {
  const startMs = project.inPointMs ?? 0;
  const endMs = project.outPointMs ?? Math.max(startMs + FRAME_MS, projectDurationMs(project));
  return { startMs, endMs };
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
  if (next < 0) next = 0;
  return { playheadMs: next, stopped: false };
}
