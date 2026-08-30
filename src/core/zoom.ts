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
