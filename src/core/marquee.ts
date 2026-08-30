import { TRACK_IDS, clipEndMs, type Clip, type TrackId } from "./models";

export const MARQUEE_LANES = ["VIS", "V1", "V2", "A1", "A2"] as const;
export type MarqueeLane = (typeof MARQUEE_LANES)[number];

/** Below this pixel travel, pointer-up is an empty click (clears selection). */
export const MARQUEE_CLICK_SLOP_PX = 3;

export function isMarqueeLane(value: string | null | undefined): value is MarqueeLane {
  return Boolean(value && (MARQUEE_LANES as readonly string[]).includes(value));
}

export function tracksInLaneSpan(a: MarqueeLane, b: MarqueeLane): TrackId[] {
  const i = MARQUEE_LANES.indexOf(a);
  const j = MARQUEE_LANES.indexOf(b);
  if (i < 0 || j < 0) return [];
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  return MARQUEE_LANES.slice(lo, hi + 1).filter((id): id is TrackId => TRACK_IDS.includes(id as TrackId));
}

export interface MarqueeRect {
  aMs: number;
  bMs: number;
  aLane: MarqueeLane;
  bLane: MarqueeLane;
}

export function clipIntersectsMarquee(clip: Clip, rect: MarqueeRect): boolean {
  const tracks = tracksInLaneSpan(rect.aLane, rect.bLane);
  if (!tracks.includes(clip.trackId)) return false;
  const start = Math.min(rect.aMs, rect.bMs);
  const end = Math.max(rect.aMs, rect.bMs);
  const clipEnd = clipEndMs(clip);
  if (end > start) return clip.startMs < end && clipEnd > start;
  return clip.startMs <= start && clipEnd > start;
}

export function clipsIntersectingMarquee(clips: readonly Clip[], rect: MarqueeRect): Clip[] {
  return clips
    .filter((c) => clipIntersectsMarquee(c, rect))
    .sort((a, b) => {
      const track = TRACK_IDS.indexOf(a.trackId) - TRACK_IDS.indexOf(b.trackId);
      return track !== 0 ? track : a.startMs - b.startMs;
    });
}
