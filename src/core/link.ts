import { createId } from "./ids";
import {
  clipById,
  clipEndMs,
  kindOfTrack,
  type Clip,
  type Project,
  type TrackId,
} from "./models";

export function livingLinkedMate(project: Project, clipId: string): Clip | undefined {
  const clip = clipById(project, clipId);
  if (!clip?.linkId) return undefined;
  return project.clips.find((c) => c.id !== clip.id && c.linkId === clip.linkId);
}

/** First selected clip that still has a living same-`linkId` mate. */
export function firstClipIdWithLivingMate(
  project: Project,
  clipIds: readonly string[],
): string | undefined {
  for (const id of clipIds) {
    if (livingLinkedMate(project, id)) return id;
  }
  return undefined;
}

/** V clip mixes its own audio unless a living linked A clip carries it. */
export function vClipMixesOwnAudio(project: Project, clip: Clip): boolean {
  if (kindOfTrack(clip.trackId) !== "video") return true;
  const mate = livingLinkedMate(project, clip.id);
  return !mate || kindOfTrack(mate.trackId) !== "audio";
}

export function expandLinkedClipIds(project: Project, clipIds: readonly string[]): string[] {
  const ids = new Set(clipIds.filter(Boolean));
  for (const id of [...ids]) {
    const mate = livingLinkedMate(project, id);
    if (mate) ids.add(mate.id);
  }
  return [...ids];
}

export function rangeOverlapsClip(clip: Clip, startMs: number, durationMs: number): boolean {
  return clip.startMs < startMs + durationMs && clipEndMs(clip) > startMs;
}

/** First A lane (A1 then A2) that can hold `[startMs, startMs+durationMs)` without overlap. */
export function firstFreeAudioTrack(
  project: Project,
  startMs: number,
  durationMs: number,
): TrackId | undefined {
  for (const id of ["A1", "A2"] as const) {
    const busy = project.clips.some(
      (c) => c.trackId === id && rangeOverlapsClip(c, startMs, durationMs),
    );
    if (!busy) return id;
  }
  return undefined;
}

export function unlinkClips(
  project: Project,
  clipId: string,
): { project: Project; error?: string } {
  const clip = clipById(project, clipId);
  if (!clip) return { project, error: "Clip not found" };
  if (!clip.linkId) return { project };
  const linkId = clip.linkId;
  return {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
      clips: project.clips.map((c) => (c.linkId === linkId ? { ...c, linkId: undefined } : c)),
    },
  };
}

/** After paste: pairs that are both present get a new linkId; orphans lose linkId. */
export function remapPastedLinkIds(clips: readonly Clip[]): Clip[] {
  const groups = new Map<string, number>();
  for (const c of clips) {
    if (!c.linkId) continue;
    groups.set(c.linkId, (groups.get(c.linkId) ?? 0) + 1);
  }
  const nextLink = new Map<string, string | undefined>();
  for (const [old, n] of groups) {
    nextLink.set(old, n >= 2 ? createId("link") : undefined);
  }
  return clips.map((c) => {
    if (!c.linkId) return c;
    const mapped = nextLink.get(c.linkId);
    return { ...c, linkId: mapped };
  });
}
