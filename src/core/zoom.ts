import { projectDurationMs, type Project } from "./models";

/** Lane label / ruler gutter width. Matches `.lane` / `.ruler` CSS. */
export const LANE_LABEL_PX = 56;

/** Inset of t=0 from the lane-body / ruler-body left edge. */
export const RULER_PAD_PX = 56;

export const ZOOM_MAX_PX_PER_SEC = 400;

/** Floor when the project already fits at 1 px/s. Longer projects may go lower. */
export const ZOOM_ABS_MIN_PX_PER_SEC = 1;

export function usableLanePx(timelineWidthPx: number): number {
  return Math.max(1, timelineWidthPx - LANE_LABEL_PX - RULER_PAD_PX);
}

export function fitDurationMs(project: Project): number {
  return Math.max(projectDurationMs(project), 1000);
}

/** Zoom that places the whole project in the visible lane body. */
export function fitZoomPxPerSec(project: Project, timelineWidthPx: number): number {
  return usableLanePx(timelineWidthPx) / (fitDurationMs(project) / 1000);
}

/** Most-zoomed-out value: 1 px/s, or lower if a long clip still cannot fit. */
export function minZoomPxPerSec(project: Project, timelineWidthPx: number): number {
  return Math.min(ZOOM_ABS_MIN_PX_PER_SEC, fitZoomPxPerSec(project, timelineWidthPx));
}

export function clampZoomPxPerSec(zoom: number, minZoom: number): number {
  return Math.max(minZoom, Math.min(ZOOM_MAX_PX_PER_SEC, zoom));
}

export function visibleDurationMs(zoomPxPerSec: number, timelineWidthPx: number): number {
  return (usableLanePx(timelineWidthPx) / Math.max(zoomPxPerSec, 1e-6)) * 1000;
}

/** Playhead is in the time span drawn after the ruler pad. */
export function playheadInView(
  playheadMs: number,
  scrollMs: number,
  zoomPxPerSec: number,
  timelineWidthPx: number,
): boolean {
  const viewEnd = scrollMs + visibleDurationMs(zoomPxPerSec, timelineWidthPx);
  return playheadMs >= scrollMs && playheadMs <= viewEnd;
}

function centerPlayheadScrollMs(
  playheadMs: number,
  zoomPxPerSec: number,
  timelineWidthPx: number,
): number {
  const half = visibleDurationMs(zoomPxPerSec, timelineWidthPx) / 2;
  return Math.max(0, playheadMs - half);
}

function clampScrollKeepPlayhead(
  playheadMs: number,
  scrollMs: number,
  zoomPxPerSec: number,
  timelineWidthPx: number,
): number {
  const visible = visibleDurationMs(zoomPxPerSec, timelineWidthPx);
  let scroll = Math.max(0, scrollMs);
  if (playheadMs < scroll) scroll = Math.max(0, playheadMs);
  if (playheadMs > scroll + visible) scroll = Math.max(0, playheadMs - visible);
  return scroll;
}

/**
 * DAW-style zoom around the playhead: keep it at the same screen-x.
 * If it is off-screen first, center it, then zoom around that position.
 */
export function scrollZoomAroundPlayhead(opts: {
  playheadMs: number;
  scrollMs: number;
  zoomOld: number;
  zoomNew: number;
  timelineWidthPx: number;
}): number {
  const { playheadMs, zoomNew, timelineWidthPx } = opts;
  const zoomOld = Math.max(opts.zoomOld, 1e-6);
  let scroll = opts.scrollMs;
  if (!playheadInView(playheadMs, scroll, zoomOld, timelineWidthPx)) {
    scroll = centerPlayheadScrollMs(playheadMs, zoomOld, timelineWidthPx);
  }
  const next = playheadMs - (playheadMs - scroll) * (zoomOld / Math.max(zoomNew, 1e-6));
  return clampScrollKeepPlayhead(playheadMs, next, zoomNew, timelineWidthPx);
}
