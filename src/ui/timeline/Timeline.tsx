import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  TRACK_IDS,
  clipEndMs,
  isTrackId,
  kindOfTrack,
  projectDurationMs,
  type Clip,
  type Project,
  type TrackId,
  type VisualizerEvent,
} from "../../core/models";
import { fadeHandlesVisible, fadesFromHandleDrag } from "../../core/fade-handles";
import { durationMsFromHandleDrag, transitionDurationSnapTargets } from "../../core/transition-handles";
import { listStackedEditPairs, type StackedOverlapMark } from "../../core/transition";
import { normalizeClipFades } from "../../core/fades";
import {
  MARQUEE_CLICK_SLOP_PX,
  clipsIntersectingMarquee,
  isMarqueeLane,
  type MarqueeLane,
} from "../../core/marquee";
import { abuttingNeighbor, collectSnapTargets, isSlideBlock, snapTime } from "../../core/timeline";
import {
  DEFAULT_LANE_HEIGHT_PX,
  DEFAULT_LANE_LABEL_PX,
  clampLaneHeightPx,
  clampLaneLabelPx,
  heightGroupOfLane,
  type LaneHeightGroup,
  type LaneHeights,
} from "../../core/layout-prefs";
import { RULER_PAD_PX } from "../../core/zoom";
import { formatVisEventLabel, sceneShortName, visualizerEventsOf } from "../../core/visualizer";
import { CLIP_MENU_SHORTCUTS } from "../shortcuts/labels";
import { AudioClipWave, VideoClipStrip } from "./ClipPreview";
import { buildRulerTicks } from "../../core/ruler";
import { isAssetDrag, mediaDropPlace, readAssetDrag } from "../../core/media";

export { RULER_PAD_PX };

/** Compatible V/A lane under the pointer (header or body). VIS is not a TrackId. */
function trackIdFromPoint(clientX: number, clientY: number): TrackId | undefined {
  const fromPoint = document.elementFromPoint;
  if (typeof fromPoint !== "function") return undefined;
  const hit = fromPoint.call(document, clientX, clientY);
  let node: Element | null = hit;
  while (node) {
    const raw = node.getAttribute("data-testid");
    const m = raw?.match(/^lane-(V1|V2|A1|A2)(?:-body)?$/);
    if (m && isTrackId(m[1]!)) return m[1];
    node = node.parentElement;
  }
  return undefined;
}

interface Props {
  project: Project;
  selectedClipId: string | null;
  selectedClipIds?: string[];
  selectedMarkerId?: string | null;
  selectedVisEventId?: string | null;
  selectedVisEventIds?: string[];
  onSelect: (clipId: string | null, opts?: { toggle?: boolean; range?: boolean }) => void;
  onSelectMarker?: (markerId: string | null) => void;
  onMarkerMoveLive?: (markerId: string, timeMs: number) => void;
  onMarkerMoveCommit?: () => void;
  onDeleteMarker?: (markerId: string) => void;
  onPlayhead: (ms: number) => void;
  onMoveLive: (clipId: string, startMs: number, trackId?: TrackId, clipIds?: string[]) => void;
  onMoveCommit: () => void;
  onTrimLive: (
    clipId: string,
    edge: "in" | "out",
    nextEdgeMs: number,
    mode?: "lift" | "ripple" | "roll",
  ) => void;
  onTrimCommit: () => void;
  onSlipLive?: (clipId: string, deltaMs: number, clipIds?: readonly string[]) => void;
  onSlipCommit?: () => void;
  onSlideLive?: (clipId: string, deltaMs: number, clipIds?: readonly string[]) => void;
  onSlideCommit?: () => void;
  onFadesLive?: (clipId: string, fadeInMs: number, fadeOutMs: number) => void;
  onFadesCommit?: () => void;
  onTransitionDurationLive?: (durationMs: number, clipIds: readonly string[]) => void;
  onTransitionDurationCommit?: () => void;
  onTransitionAudioDurationLive?: (audioDurationMs: number, clipIds: readonly string[]) => void;
  onTransitionAudioDurationCommit?: () => void;
  onSelectClips?: (clipIds: readonly string[], opts?: { union?: boolean }) => void;
  onToggleMute: (trackId: TrackId) => void;
  onToggleSolo?: (trackId: TrackId) => void;
  onToggleVisualizerMute: () => void;
  onCycleVisualizerScene: () => void;
  onSelectVis?: () => void;
  onSelectVisEvent?: (eventId: string) => void;
  onInsertVisEvent?: () => void;
  onVisEventMoveLive?: (eventId: string, startMs: number) => void;
  onVisEventMoveCommit?: () => void;
  onVisEventStretchLive?: (eventId: string, edge: "in" | "out", nextEdgeMs: number) => void;
  onVisEventStretchCommit?: () => void;
  onSetFrontVideoTrack?: (trackId: "V1" | "V2") => void;
  /** Arrange = all tracks. Cutter = video only. VIS overlay is separate. */
  visibleTrackIds?: TrackId[];
  onSplitHere: (clipId: string, timeMs: number) => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  onRippleDelete?: () => void;
  onLiftRange?: () => void;
  onExtractRange?: () => void;
  onRelink?: () => void;
  onCloseGap?: () => void;
  onRippleTrimToPlayhead?: (edge: "in" | "out") => void;
  onSelectAll?: () => void;
  onSelectAllOnTrack?: () => void;
  onSetClipsEnabled?: (enabled: boolean) => void;
  onZoom: (zoom: number, timelineWidthPx: number) => void;
  onFit: (timelineWidthPx: number) => void;
  onViewport?: (timelineWidthPx: number) => void;
  onScroll: (ms: number) => void;
  onLoopClick: (ms: number) => void;
  onLoopInLive: (ms: number) => void;
  onLoopOutLive: (ms: number) => void;
  onLoopMoveLive: (deltaMs: number) => void;
  onLoopCommit: () => void;
  laneLabelPx?: number;
  laneHeights?: LaneHeights;
  onLaneLabelPx?: (px: number) => void;
  onLaneHeight?: (group: LaneHeightGroup, px: number) => void;
  /** Bin drag onto Arrange — same place command as MediaBrowser onPlace. */
  onPlaceAsset?: (assetId: string, trackId: TrackId, startMs: number) => void;
}

function msToX(ms: number, zoom: number, scrollMs: number): number {
  return RULER_PAD_PX + ((ms - scrollMs) / 1000) * zoom;
}

function xToMs(x: number, zoom: number, scrollMs: number): number {
  return scrollMs + ((x - RULER_PAD_PX) / zoom) * 1000;
}

function msToWidth(ms: number, zoom: number): number {
  return (ms / 1000) * zoom;
}

interface ClipMenu {
  x: number;
  y: number;
  clipId: string;
  timeMs: number;
}

interface MarkerMenu {
  x: number;
  y: number;
  markerId: string;
}

interface VisEventMenu {
  x: number;
  y: number;
  eventId: string;
}

export function Timeline({
  project,
  selectedClipId,
  selectedClipIds,
  selectedMarkerId = null,
  selectedVisEventId = null,
  selectedVisEventIds,
  onSelect,
  onSelectMarker,
  onMarkerMoveLive,
  onMarkerMoveCommit,
  onDeleteMarker,
  onPlayhead,
  onMoveLive,
  onMoveCommit,
  onTrimLive,
  onTrimCommit,
  onSlipLive,
  onSlipCommit,
  onSlideLive,
  onSlideCommit,
  onFadesLive,
  onFadesCommit,
  onTransitionDurationLive,
  onTransitionDurationCommit,
  onTransitionAudioDurationLive,
  onTransitionAudioDurationCommit,
  onSelectClips,
  onToggleMute,
  onToggleSolo,
  onToggleVisualizerMute,
  onCycleVisualizerScene,
  onSelectVis,
  onSelectVisEvent,
  onInsertVisEvent,
  onVisEventMoveLive,
  onVisEventMoveCommit,
  onVisEventStretchLive,
  onVisEventStretchCommit,
  onSetFrontVideoTrack,
  visibleTrackIds,
  onSplitHere,
  onCut,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onRippleDelete,
  onLiftRange,
  onExtractRange,
  onRelink,
  onCloseGap,
  onRippleTrimToPlayhead,
  onSelectAll,
  onSelectAllOnTrack,
  onSetClipsEnabled,
  onZoom,
  onFit,
  onViewport,
  onScroll,
  onLoopClick,
  onLoopInLive,
  onLoopOutLive,
  onLoopMoveLive,
  onLoopCommit,
  laneLabelPx = DEFAULT_LANE_LABEL_PX,
  laneHeights,
  onLaneLabelPx,
  onLaneHeight,
  onPlaceAsset,
}: Props) {
  const timelineRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragKindRef = useRef<
    | "move"
    | "trim"
    | "fade"
    | "slip"
    | "slide"
    | "marquee"
    | "loop-in"
    | "loop-out"
    | "loop-move"
    | "marker"
    | "vis-move"
    | "vis-trim"
    | "transition-duration"
    | "lane-label"
    | "lane-height"
    | null
  >(null);
  const [menu, setMenu] = useState<ClipMenu | null>(null);
  const [markerMenu, setMarkerMenu] = useState<MarkerMenu | null>(null);
  const [visMenu, setVisMenu] = useState<VisEventMenu | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const [viewWidth, setViewWidth] = useState(1000);
  const duration = Math.max(10_000, projectDurationMs(project) + 2000);
  const measureWidth = (): number => timelineRef.current?.clientWidth ?? 1000;

  useEffect(() => {
    const el = timelineRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setViewWidth(el.clientWidth || 1000));
    ro.observe(el);
    setViewWidth(el.clientWidth || 1000);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    onViewport?.(viewWidth);
  }, [viewWidth, onViewport]);

  const ticks = useMemo(
    () =>
      buildRulerTicks({
        zoomPxPerSec: project.zoomPxPerSec,
        durationMs: duration,
        scrollMs: project.scrollMs,
        viewWidthPx: Math.max(200, viewWidth - 56),
      }),
    [duration, project.scrollMs, project.zoomPxPerSec, viewWidth],
  );

  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const width = el.clientWidth || 1000;
      const next = e.deltaY > 0 ? project.zoomPxPerSec / 1.2 : project.zoomPxPerSec * 1.2;
      onZoom(next, width);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoom, project.zoomPxPerSec]);

  const timeFromEvent = (clientX: number, contentEl?: HTMLElement | null): number => {
    const el = contentEl ?? bodyRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, xToMs(clientX - rect.left, project.zoomPxPerSec, project.scrollMs));
  };

  const snapIf = (ms: number, ignore: Array<"in" | "out"> = []): number => {
    if (!project.snap) return Math.max(0, ms);
    const targets = collectSnapTargets(project).filter((t) => !ignore.includes(t.kind as "in" | "out"));
    return Math.max(0, snapTime(ms, targets).timeMs);
  };

  const onRulerPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setMenu(null);
    setMarkerMenu(null);
    setVisMenu(null);
    onPlayhead(timeFromEvent(e.clientX, e.currentTarget));
  };

  const onEmptyContext = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setMenu(null);
    setMarkerMenu(null);
    setVisMenu(null);
    onLoopClick(snapIf(timeFromEvent(e.clientX, e.currentTarget)));
  };

  const onLaneBodyPointer = (e: ReactPointerEvent<HTMLDivElement>, lane: MarqueeLane) => {
    if (e.button !== 0) return;
    if (dragKindRef.current) return;
    setMenu(null);
    setMarkerMenu(null);
    setVisMenu(null);
    const originEl = e.currentTarget;
    onPlayhead(timeFromEvent(e.clientX, originEl));
    dragKindRef.current = "marquee";
    const originX = e.clientX;
    const originY = e.clientY;
    const originTime = timeFromEvent(e.clientX, originEl);
    const union = e.shiftKey;
    let lastLane: MarqueeLane = lane;
    let lastTime = originTime;
    let moved = false;

    const localOf = (clientX: number, clientY: number) => {
      const r = timelineRef.current?.getBoundingClientRect();
      return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
    };
    const originLocal = localOf(originX, originY);

    const laneAt = (clientX: number, clientY: number): MarqueeLane => {
      try {
        const probe = document.elementFromPoint;
        const hit = typeof probe === "function" ? probe.call(document, clientX, clientY) : null;
        const node = hit instanceof Element ? hit.closest("[data-marquee-lane]") : null;
        const id = node?.getAttribute("data-marquee-lane");
        if (isMarqueeLane(id)) return id;
      } catch {
        /* jsdom has no elementFromPoint */
      }
      return lastLane;
    };

    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "marquee") return;
      if (
        Math.abs(ev.clientX - originX) > MARQUEE_CLICK_SLOP_PX ||
        Math.abs(ev.clientY - originY) > MARQUEE_CLICK_SLOP_PX
      ) {
        moved = true;
      }
      lastTime = timeFromEvent(ev.clientX, originEl);
      lastLane = laneAt(ev.clientX, ev.clientY);
      if (moved) {
        const p = localOf(ev.clientX, ev.clientY);
        setMarquee({ x0: originLocal.x, y0: originLocal.y, x1: p.x, y1: p.y });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
      setMarquee(null);
      if (!moved) {
        if (lane === "VIS") {
          if (onInsertVisEvent) onInsertVisEvent();
          else onSelectVis?.();
        } else onSelect(null);
        return;
      }
      const hits = clipsIntersectingMarquee(project.clips, {
        aMs: originTime,
        bMs: lastTime,
        aLane: lane,
        bLane: lastLane,
      });
      onSelectClips?.(
        hits.map((c) => c.id),
        { union },
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onMarkerPointerDown = (e: ReactPointerEvent, markerId: string, timeMs: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    setMarkerMenu(null);
    if (dragKindRef.current) return;
    dragKindRef.current = "marker";
    onSelectMarker?.(markerId);
    const originX = e.clientX;
    const originTime = timeMs;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "marker") return;
      const dx = ev.clientX - originX;
      if (Math.abs(dx) > 1) moved = true;
      const next = Math.max(0, originTime + (dx / project.zoomPxPerSec) * 1000);
      onMarkerMoveLive?.(markerId, next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
      if (moved) onMarkerMoveCommit?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onMarkerContext = (e: ReactMouseEvent, markerId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectMarker?.(markerId);
    setMenu(null);
    setMarkerMenu({ x: e.clientX, y: e.clientY, markerId });
  };

  const selectedIds = selectedClipIds?.length
    ? selectedClipIds
    : selectedClipId
      ? [selectedClipId]
      : [];
  const primaryId = selectedClipId ?? selectedIds[0] ?? null;
  const overlapMarks = useMemo(() => listStackedEditPairs(project), [project]);

  const onClipPointerDown = (e: ReactPointerEvent, clip: Clip) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    setMarkerMenu(null);
    if ((e.ctrlKey || e.metaKey) && e.altKey) {
      if (dragKindRef.current) return;
      const inSelectedBlock = selectedIds.includes(clip.id) && isSlideBlock(project, selectedIds);
      if (!inSelectedBlock && !selectedIds.includes(clip.id)) onSelect(clip.id);
      const slidingIds = inSelectedBlock ? selectedIds : [clip.id];
      dragKindRef.current = "slide";
      const originX = e.clientX;
      const move = (ev: PointerEvent) => {
        if (dragKindRef.current !== "slide") return;
        const deltaMs = ((ev.clientX - originX) / project.zoomPxPerSec) * 1000;
        onSlideLive?.(clip.id, deltaMs, slidingIds);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        dragKindRef.current = null;
        onSlideCommit?.();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      onSelect(clip.id, { toggle: true });
      return;
    }
    if (e.shiftKey) {
      onSelect(clip.id, { range: true });
      return;
    }
    if (e.altKey) {
      if (dragKindRef.current) return;
      if (!selectedIds.includes(clip.id)) onSelect(clip.id);
      const slippingIds =
        selectedIds.includes(clip.id) && selectedIds.length >= 2 ? selectedIds : [clip.id];
      dragKindRef.current = "slip";
      const originX = e.clientX;
      const move = (ev: PointerEvent) => {
        if (dragKindRef.current !== "slip") return;
        const deltaMs = ((ev.clientX - originX) / project.zoomPxPerSec) * 1000;
        onSlipLive?.(clip.id, deltaMs, slippingIds);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        dragKindRef.current = null;
        onSlipCommit?.();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    if (dragKindRef.current) return;
    const inGroup = selectedIds.includes(clip.id);
    if (!inGroup) onSelect(clip.id);
    const movingIds = inGroup ? selectedIds : [clip.id];
    dragKindRef.current = "move";
    const originX = e.clientX;
    const originStart = clip.startMs;
    const originY = e.clientY;
    const originTrack = clip.trackId;
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "move") return;
      const dx = ev.clientX - originX;
      const nextStart = originStart + (dx / project.zoomPxPerSec) * 1000;
      const dy = ev.clientY - originY;
      let trackId: TrackId | undefined;
      if (movingIds.length === 1) {
        const over = trackIdFromPoint(ev.clientX, ev.clientY);
        if (over && kindOfTrack(over) === kindOfTrack(originTrack)) trackId = over;
        else if (Math.abs(dy) > 24) {
          const idx = TRACK_IDS.indexOf(originTrack);
          const next = TRACK_IDS[idx + (dy > 0 ? 1 : -1)];
          if (next && kindOfTrack(next) === kindOfTrack(originTrack)) trackId = next;
        }
      }
      onMoveLive(clip.id, nextStart, trackId, movingIds);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
      onMoveCommit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onTrimPointerDown = (e: ReactPointerEvent, clip: Clip, edge: "in" | "out") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    if (dragKindRef.current) return;
    dragKindRef.current = "trim";
    onSelect(clip.id);
    const originX = e.clientX;
    const originEdge = edge === "in" ? clip.startMs : clipEndMs(clip);
    const mode: "lift" | "ripple" | "roll" = e.shiftKey
      ? "ripple"
      : abuttingNeighbor(project, clip.id, edge)
        ? "roll"
        : "lift";
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "trim") return;
      const dx = ev.clientX - originX;
      const nextEdge = originEdge + (dx / project.zoomPxPerSec) * 1000;
      onTrimLive(clip.id, edge, nextEdge, ev.shiftKey ? "ripple" : mode);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
      onTrimCommit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onVisEventPointerDown = (e: ReactPointerEvent, event: VisualizerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    setMarkerMenu(null);
    setVisMenu(null);
    if (dragKindRef.current) return;
    onSelectVisEvent?.(event.id);
    if (!onVisEventMoveLive) return;
    dragKindRef.current = "vis-move";
    const originX = e.clientX;
    const originStart = event.startMs;
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "vis-move") return;
      const nextStart = originStart + ((ev.clientX - originX) / project.zoomPxPerSec) * 1000;
      onVisEventMoveLive(event.id, nextStart);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
      onVisEventMoveCommit?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onVisEventTrimPointerDown = (
    e: ReactPointerEvent,
    event: VisualizerEvent,
    edge: "in" | "out",
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    setMarkerMenu(null);
    setVisMenu(null);
    if (dragKindRef.current) return;
    onSelectVisEvent?.(event.id);
    if (!onVisEventStretchLive) return;
    dragKindRef.current = "vis-trim";
    const originX = e.clientX;
    const originEdge = edge === "in" ? event.startMs : event.startMs + event.durationMs;
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "vis-trim") return;
      const nextEdge = originEdge + ((ev.clientX - originX) / project.zoomPxPerSec) * 1000;
      onVisEventStretchLive(event.id, edge, nextEdge);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
      onVisEventStretchCommit?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onFadePointerDown = (e: ReactPointerEvent, clip: Clip, edge: "in" | "out") => {
    if (e.button !== 0) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    if (dragKindRef.current) return;
    dragKindRef.current = "fade";
    onSelect(clip.id);
    const originX = e.clientX;
    const originIn = clip.fadeInMs;
    const originOut = clip.fadeOutMs;
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "fade") return;
      const next = fadesFromHandleDrag(
        originIn,
        originOut,
        clip.durationMs,
        ev.clientX - originX,
        project.zoomPxPerSec,
        edge,
      );
      onFadesLive?.(clip.id, next.fadeInMs, next.fadeOutMs);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
      onFadesCommit?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onTransitionDurationPointerDown = (
    e: ReactPointerEvent,
    mark: StackedOverlapMark,
    kind: "video" | "audio",
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    if (dragKindRef.current) return;
    dragKindRef.current = "transition-duration";
    const clipIds = [mark.sourceA.id, mark.sourceB.id];
    onSelectClips?.(clipIds);
    const originX = e.clientX;
    const originMs = kind === "video" ? mark.durationMs : mark.audioDurationMs;
    const targets = project.snap ? transitionDurationSnapTargets(project) : [];
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "transition-duration") return;
      const next = durationMsFromHandleDrag({
        originDurationMs: originMs,
        startMs: mark.startMs,
        deltaPx: ev.clientX - originX,
        zoomPxPerSec: project.zoomPxPerSec,
        snap: project.snap,
        snapTargets: targets,
      });
      if (kind === "video") onTransitionDurationLive?.(next, clipIds);
      else onTransitionAudioDurationLive?.(next, clipIds);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
      if (kind === "video") onTransitionDurationCommit?.();
      else onTransitionAudioDurationCommit?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const heights: LaneHeights = laneHeights ?? {
    vis: DEFAULT_LANE_HEIGHT_PX,
    video: DEFAULT_LANE_HEIGHT_PX,
    audio: DEFAULT_LANE_HEIGHT_PX,
  };

  const onLaneLabelSplitterDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    if (dragKindRef.current) return;
    dragKindRef.current = "lane-label";
    const originX = e.clientX;
    const origin = laneLabelPx;
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "lane-label") return;
      onLaneLabelPx?.(clampLaneLabelPx(origin + (ev.clientX - originX)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onLaneHeightPointerDown = (e: ReactPointerEvent, group: LaneHeightGroup) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    if (dragKindRef.current) return;
    dragKindRef.current = "lane-height";
    const originY = e.clientY;
    const origin = heights[group];
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "lane-height") return;
      onLaneHeight?.(group, clampLaneHeightPx(origin + (ev.clientY - originY)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const laneLabelSplitter = (
    <div
      className="lane-label-splitter"
      data-testid="lane-label-splitter"
      title="Resize headers"
      onPointerDown={onLaneLabelSplitterDown}
    />
  );

  const onLoopHandlePointerDown = (e: ReactPointerEvent, edge: "in" | "out") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    if (dragKindRef.current) return;
    const originX = e.clientX;
    const origin = edge === "in" ? project.inPointMs : project.outPointMs;
    if (origin == null) return;
    dragKindRef.current = edge === "in" ? "loop-in" : "loop-out";
    const kind = dragKindRef.current;
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== kind) return;
      const dx = ev.clientX - originX;
      const next = origin + (dx / project.zoomPxPerSec) * 1000;
      const snapped = snapIf(next, [edge]);
      if (edge === "in") onLoopInLive(snapped);
      else onLoopOutLive(snapped);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
      onLoopCommit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onLoopRangePointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setMenu(null);
    if (dragKindRef.current) return;
    if (project.inPointMs == null || project.outPointMs == null) return;
    dragKindRef.current = "loop-move";
    const originX = e.clientX;
    const originIn = project.inPointMs;
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "loop-move") return;
      const dx = ev.clientX - originX;
      let delta = (dx / project.zoomPxPerSec) * 1000;
      let nextIn = originIn + delta;
      if (project.snap) {
        nextIn = snapIf(nextIn, ["in", "out"]);
        delta = nextIn - originIn;
      }
      onLoopMoveLive(delta);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      dragKindRef.current = null;
      onLoopCommit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onClipContext = (e: ReactMouseEvent, clip: Clip) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(clip.id);
    setMarkerMenu(null);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      clipId: clip.id,
      timeMs: timeFromEvent(e.clientX, bodyRef.current),
    });
  };

  const range = project.inPointMs != null && project.outPointMs != null
    ? {
        left: msToX(project.inPointMs, project.zoomPxPerSec, project.scrollMs),
        width: msToWidth(project.outPointMs - project.inPointMs, project.zoomPxPerSec),
      }
    : null;

  const loopOverlay = (interactive: boolean) =>
    range ? (
      <>
        <div
          className={interactive ? "in-out interactive" : "in-out"}
          data-testid={interactive ? "loop-range" : undefined}
          style={{ left: range.left, width: range.width }}
          onPointerDown={interactive ? onLoopRangePointerDown : undefined}
        />
        {interactive ? (
          <>
            <div
              className="loop-handle in"
              data-testid="loop-handle-in"
              style={{ left: range.left }}
              onPointerDown={(e) => onLoopHandlePointerDown(e, "in")}
            />
            <div
              className="loop-handle out"
              data-testid="loop-handle-out"
              style={{ left: range.left + range.width }}
              onPointerDown={(e) => onLoopHandlePointerDown(e, "out")}
            />
          </>
        ) : null}
      </>
    ) : null;

  return (
    <section
      ref={timelineRef}
      className="timeline"
      data-testid="timeline"
      onDragOver={(e) => {
        if (!onPlaceAsset || !isAssetDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        if (!onPlaceAsset) return;
        const assetId = readAssetDrag(e.dataTransfer);
        if (!assetId) return;
        const asset = project.assets.find((a) => a.id === assetId);
        if (!asset) return;
        const over = trackIdFromPoint(e.clientX, e.clientY);
        const body = over
          ? (e.currentTarget.querySelector(`[data-testid="lane-${over}-body"]`) as HTMLElement | null)
          : null;
        const rect = body?.getBoundingClientRect();
        const x = rect ? e.clientX - rect.left : 0;
        const startMs = Math.max(0, xToMs(x, project.zoomPxPerSec, project.scrollMs));
        const placed = mediaDropPlace({
          assetId,
          assetKind: asset.kind,
          overTrackId: over,
          startMs,
        });
        if (!placed) return;
        e.preventDefault();
        onPlaceAsset(placed.assetId, placed.trackId, placed.startMs);
      }}
      style={
        {
          "--lane-label-px": `${laneLabelPx}px`,
          "--lane-height-vis": `${heights.vis}px`,
          "--lane-height-video": `${heights.video}px`,
          "--lane-height-audio": `${heights.audio}px`,
        } as CSSProperties
      }
    >
      <div className="timeline-tools">
        <button
          type="button"
          data-testid="timeline-zoom-out"
          onClick={() => onZoom(project.zoomPxPerSec / 1.2, measureWidth())}
        >
          −
        </button>
        <button
          type="button"
          data-testid="timeline-zoom-in"
          onClick={() => onZoom(project.zoomPxPerSec * 1.2, measureWidth())}
        >
          +
        </button>
        <button type="button" data-testid="timeline-fit" onClick={() => onFit(measureWidth())}>
          Fit
        </button>
        <span className="timeline-zoom">
          {project.zoomPxPerSec < 10
            ? project.zoomPxPerSec.toFixed(1)
            : Math.round(project.zoomPxPerSec)}{" "}
          px/s
        </span>
        <label>
          Pan
          <input
            type="range"
            min={0}
            max={Math.max(0, duration - 4000)}
            value={project.scrollMs}
            onChange={(e) => onScroll(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="ruler">
        <div className="ruler-gutter" aria-hidden="true">
          {laneLabelSplitter}
        </div>
        <div
          className="ruler-body"
          ref={bodyRef}
          onPointerDown={onRulerPointer}
          onContextMenu={onEmptyContext}
          data-testid="ruler"
        >
          {ticks.map((t) => (
            <div
              key={`${t.kind}-${t.timeMs}`}
              className={`ruler-tick ${t.kind}`}
              style={{ left: msToX(t.timeMs, project.zoomPxPerSec, project.scrollMs) }}
            >
              {t.label}
            </div>
          ))}
          {project.markers.map((m) => {
            const selected = selectedMarkerId === m.id;
            return (
              <div
                key={m.id}
                className={`marker${selected ? " selected" : ""}`}
                data-testid={`marker-${m.id}`}
                data-selected={selected ? "true" : "false"}
                title={m.label}
                style={{ left: msToX(m.timeMs, project.zoomPxPerSec, project.scrollMs) }}
                onPointerDown={(e) => onMarkerPointerDown(e, m.id, m.timeMs)}
                onContextMenu={(e) => onMarkerContext(e, m.id)}
              >
                <span className="marker-flag" aria-hidden="true" />
                <button
                  type="button"
                  className="marker-x"
                  data-testid={`marker-delete-${m.id}`}
                  aria-label={`Delete ${m.label}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteMarker?.(m.id);
                    setMarkerMenu(null);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
          {loopOverlay(true)}
          <div
            className="playhead"
            style={{ left: msToX(project.playheadMs, project.zoomPxPerSec, project.scrollMs) }}
          />
        </div>
      </div>
      <div
        className={`lane vis-lane${project.visualizer.muted || !project.visualizer.enabled ? " muted" : ""}`}
        data-testid="lane-VIS"
        style={{ height: heights.vis }}
      >
        <div className="lane-label">
          {laneLabelSplitter}
          <span>VIS</span>
          <div className="vis-lane-btns">
            <button
              type="button"
              className={project.visualizer.muted ? "active mute-btn" : "mute-btn"}
              title={project.visualizer.muted ? "Unmute VIS" : "Mute VIS"}
              data-testid="mute-VIS"
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisualizerMute();
              }}
            >
              M
            </button>
            <button
              type="button"
              className="scene-btn"
              title={
                (selectedVisEventId
                  ? visualizerEventsOf(project).find((e) => e.id === selectedVisEventId)?.sceneId
                  : undefined) ?? project.visualizer.sceneId
              }
              data-testid="visualizer-scene"
              onClick={(e) => {
                e.stopPropagation();
                onCycleVisualizerScene();
              }}
            >
              {sceneShortName(
                (selectedVisEventId
                  ? visualizerEventsOf(project).find((e) => e.id === selectedVisEventId)?.sceneId
                  : undefined) ?? project.visualizer.sceneId,
              )}
            </button>
          </div>
        </div>
        <div
          className="lane-body vis-body"
          data-testid="lane-VIS-body"
          data-marquee-lane="VIS"
          onPointerDown={(e) => onLaneBodyPointer(e, "VIS")}
          onContextMenu={onEmptyContext}
        >
          {loopOverlay(false)}
          <div className="vis-lane-fill" aria-hidden="true" />
          {(() => {
            const events = visualizerEventsOf(project);
            if (events.length > 0) {
              return events.map((event) => (
                <div
                  key={event.id}
                  role="button"
                  tabIndex={0}
                  className={`vis-span${
                    (selectedVisEventIds?.length
                      ? selectedVisEventIds.includes(event.id)
                      : selectedVisEventId === event.id)
                      ? " selected"
                      : ""
                  }`}
                  data-testid={`vis-event-${event.id}`}
                  data-vis-event={event.id}
                  data-scene={event.sceneId}
                  style={{
                    left: msToX(event.startMs, project.zoomPxPerSec, project.scrollMs),
                    width: Math.max(28, msToWidth(event.durationMs, project.zoomPxPerSec)),
                  }}
                  onPointerDown={(e) => onVisEventPointerDown(e, event)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectVisEvent?.(event.id);
                    setMenu(null);
                    setMarkerMenu(null);
                    setVisMenu({ x: e.clientX, y: e.clientY, eventId: event.id });
                  }}
                >
                  <span className="vis-span-label">{formatVisEventLabel(event)}</span>
                  <div
                    className="trim-handle in"
                    data-testid={`vis-event-in-${event.id}`}
                    onPointerDown={(e) => onVisEventTrimPointerDown(e, event, "in")}
                  />
                  <div
                    className="trim-handle out"
                    data-testid={`vis-event-out-${event.id}`}
                    onPointerDown={(e) => onVisEventTrimPointerDown(e, event, "out")}
                  />
                </div>
              ));
            }
            const start = Math.round(project.visualizer.startMs ?? 0);
            const rawDur = project.visualizer.durationMs ?? 0;
            const dur = rawDur > 0 ? Math.round(rawDur) : Math.max(10_000, projectDurationMs(project));
            return (
              <button
                type="button"
                className="vis-span"
                data-testid="vis-span"
                data-scene={project.visualizer.sceneId}
                style={{
                  left: msToX(start, project.zoomPxPerSec, project.scrollMs),
                  width: Math.max(28, msToWidth(dur, project.zoomPxPerSec)),
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (onInsertVisEvent) onInsertVisEvent();
                  else onSelectVis?.();
                }}
              >
                {sceneShortName(project.visualizer.sceneId)} {start}–{start + dur}ms
              </button>
            );
          })()}
          <div
            className="playhead"
            style={{ left: msToX(project.playheadMs, project.zoomPxPerSec, project.scrollMs) }}
          />
        </div>
        <div
          className="lane-height-handle"
          data-testid="lane-height-VIS"
          title="Resize VIS lane"
          onPointerDown={(e) => onLaneHeightPointerDown(e, "vis")}
        />
      </div>
      {(visibleTrackIds ?? TRACK_IDS).map((id) => {
        const track = project.tracks.find((t) => t.id === id);
        const muted = track?.muted === true;
        const soloed = track?.solo === true;
        const group = heightGroupOfLane(id);
        const kind = kindOfTrack(id);
        return (
          <div
            className={`lane ${kind}-lane${muted ? " muted" : ""}${soloed ? " soloed" : ""}`}
            key={id}
            data-testid={`lane-${id}`}
            style={{ height: heights[group] }}
          >
            <div className="lane-label">
              {laneLabelSplitter}
              {id === "V1" || id === "V2" ? (
                <button
                  type="button"
                  className={`track-front-btn${(project.frontVideoTrackId === "V1" ? "V1" : "V2") === id ? " on" : ""}`}
                  data-testid={`front-${id}`}
                  title={`Show ${id} on overlap`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetFrontVideoTrack?.(id);
                  }}
                >
                  {id}
                </button>
              ) : (
                <span>{id}</span>
              )}
              <div className="lane-ms">
              <button
                type="button"
                className={muted ? "active mute-btn" : "mute-btn"}
                title={muted ? `Unmute ${id}` : `Mute ${id}`}
                data-testid={`mute-${id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMute(id);
                }}
              >
                M
              </button>
              <button
                type="button"
                className={soloed ? "active solo-btn" : "solo-btn"}
                title={soloed ? `Unsolo ${id}` : `Solo ${id}`}
                data-testid={`solo-${id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSolo?.(id);
                }}
              >
                S
              </button>
              </div>
            </div>
            <div
              className="lane-body"
              data-testid={`lane-${id}-body`}
              data-marquee-lane={id}
              onPointerDown={(e) => onLaneBodyPointer(e, id)}
              onContextMenu={onEmptyContext}
            >
              {loopOverlay(false)}
              {project.clips
                .filter((c) => c.trackId === id)
                .map((clip) => {
                  const asset = project.assets.find((a) => a.id === clip.assetId);
                  const selected = selectedIds.includes(clip.id);
                  const primary = primaryId === clip.id;
                  const label = asset?.missing ? `missing:${asset.name}` : asset?.name ?? clip.id;
                  const clipW = Math.max(8, msToWidth(clip.durationMs, project.zoomPxPerSec));
                  const kind = kindOfTrack(clip.trackId);
                  return (
                    <div
                      key={clip.id}
                      className={`clip ${kind}${selected ? " selected" : ""}${asset?.missing ? " missing" : ""}${clip.enabled === false ? " disabled" : ""}`}
                      data-testid={`clip-${clip.id}`}
                      data-selected={selected ? "true" : "false"}
                      data-enabled={clip.enabled === false ? "false" : "true"}
                      style={{
                        left: msToX(clip.startMs, project.zoomPxPerSec, project.scrollMs),
                        width: clipW,
                      }}
                      title={label}
                      onPointerDown={(e) => onClipPointerDown(e, clip)}
                      onContextMenu={(e) => onClipContext(e, clip)}
                    >
                      {asset && kind === "audio" && !asset.missing ? (
                        <AudioClipWave clip={clip} asset={asset} clipWidthPx={clipW} />
                      ) : null}
                      {asset && kind === "video" && !asset.missing ? (
                        <VideoClipStrip clip={clip} asset={asset} clipWidthPx={clipW} />
                      ) : null}
                      {(() => {
                        const fades = normalizeClipFades(
                          clip.fadeInMs,
                          clip.fadeOutMs,
                          clip.durationMs,
                        );
                        const inPct =
                          clip.durationMs > 0 ? (fades.fadeInMs / clip.durationMs) * 100 : 0;
                        const outPct =
                          clip.durationMs > 0 ? (fades.fadeOutMs / clip.durationMs) * 100 : 0;
                        return (
                          <>
                            {inPct > 0 ? (
                              <span
                                className="clip-fade-in"
                                data-testid={`fade-in-${clip.id}`}
                                style={{ width: `${inPct}%` }}
                              />
                            ) : null}
                            {outPct > 0 ? (
                              <span
                                className="clip-fade-out"
                                data-testid={`fade-out-${clip.id}`}
                                style={{ width: `${outPct}%` }}
                              />
                            ) : null}
                          </>
                        );
                      })()}
                      <span className="clip-name">{label}</span>
                      {primary ? (
                        <>
                          {fadeHandlesVisible(clipW) ? (
                            <>
                              <div
                                className="fade-handle in"
                                data-testid={`fade-handle-in-${clip.id}`}
                                title="Fade in"
                                style={{ cursor: "w-resize" }}
                                onPointerDown={(e) => onFadePointerDown(e, clip, "in")}
                              />
                              <div
                                className="fade-handle out"
                                data-testid={`fade-handle-out-${clip.id}`}
                                title="Fade out"
                                style={{ cursor: "e-resize" }}
                                onPointerDown={(e) => onFadePointerDown(e, clip, "out")}
                              />
                            </>
                          ) : null}
                          <div
                            className={`trim-handle in${abuttingNeighbor(project, clip.id, "in") ? " roll" : ""}`}
                            data-testid={`trim-in-${clip.id}`}
                            title={
                              abuttingNeighbor(project, clip.id, "in")
                                ? "Roll edit (Shift+drag = ripple trim)"
                                : "Trim in (Shift+drag = ripple trim)"
                            }
                            onPointerDown={(e) => onTrimPointerDown(e, clip, "in")}
                          />
                          <div
                            className={`trim-handle out${abuttingNeighbor(project, clip.id, "out") ? " roll" : ""}`}
                            data-testid={`trim-out-${clip.id}`}
                            title={
                              abuttingNeighbor(project, clip.id, "out")
                                ? "Roll edit (Shift+drag = ripple trim)"
                                : "Trim out (Shift+drag = ripple trim)"
                            }
                            onPointerDown={(e) => onTrimPointerDown(e, clip, "out")}
                          />
                        </>
                      ) : null}
                    </div>
                  );
                })}
              {kindOfTrack(id) === "video"
                ? overlapMarks
                    .filter((m) => m.sourceA.trackId === id)
                    .map((m) => (
                      <div
                        key={`${m.sourceA.id}:${m.sourceB.id}`}
                        role="button"
                        tabIndex={0}
                        className="overlap-mark"
                        data-testid="overlap-mark"
                        data-type={m.type}
                        data-duration-ms={String(m.durationMs)}
                        data-a={m.sourceA.id}
                        data-b={m.sourceB.id}
                        style={{
                          left: msToX(m.overlapStartMs, project.zoomPxPerSec, project.scrollMs),
                          width: Math.max(28, msToWidth(m.durationMs, project.zoomPxPerSec)),
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onSelectClips?.([m.sourceA.id, m.sourceB.id]);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectClips?.([m.sourceA.id, m.sourceB.id]);
                        }}
                      >
                        {m.type} {m.durationMs}ms
                        <div
                          className="transition-duration-handle video"
                          data-testid="overlap-duration-handle-video"
                          title="Video duration"
                          onPointerDown={(e) => onTransitionDurationPointerDown(e, m, "video")}
                        />
                        {m.audio === "crossfade" || m.audioDurationMs > 0 ? (
                          <div
                            className="transition-duration-handle audio"
                            data-testid="overlap-duration-handle-audio"
                            title="Audio duration"
                            style={{
                              left: Math.max(0, msToWidth(m.audioDurationMs, project.zoomPxPerSec) - 3),
                              right: "auto",
                            }}
                            onPointerDown={(e) => onTransitionDurationPointerDown(e, m, "audio")}
                          />
                        ) : null}
                      </div>
                    ))
                : null}
              <div
                className="playhead"
                style={{ left: msToX(project.playheadMs, project.zoomPxPerSec, project.scrollMs) }}
              />
            </div>
            <div
              className="lane-height-handle"
              data-testid={`lane-height-${id}`}
              title={`Resize ${group} lanes`}
              onPointerDown={(e) => onLaneHeightPointerDown(e, group)}
            />
          </div>
        );
      })}
      {marquee ? (
        <div
          className="marquee-rect"
          data-testid="marquee-rect"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      ) : null}
      {menu ? (
        <div
          className="clip-menu"
          data-testid="clip-menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onSplitHere(menu.clipId, menu.timeMs);
              setMenu(null);
            }}
          >
            <span>Split here</span>
            <kbd>{CLIP_MENU_SHORTCUTS.split}</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              onCut();
              setMenu(null);
            }}
          >
            <span>Cut</span>
            <kbd>{CLIP_MENU_SHORTCUTS.cut}</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              onCopy();
              setMenu(null);
            }}
          >
            <span>Copy</span>
            <kbd>{CLIP_MENU_SHORTCUTS.copy}</kbd>
          </button>
          <button
            type="button"
            onClick={() => {
              onPaste();
              setMenu(null);
            }}
          >
            <span>Paste</span>
            <kbd>{CLIP_MENU_SHORTCUTS.paste}</kbd>
          </button>
          {onDuplicate ? (
            <button
              type="button"
              data-testid="clip-menu-duplicate"
              onClick={() => {
                onDuplicate();
                setMenu(null);
              }}
            >
              <span>Duplicate</span>
              <kbd>{CLIP_MENU_SHORTCUTS.duplicate}</kbd>
            </button>
          ) : null}
          {onSelectAll ? (
            <button
              type="button"
              data-testid="clip-menu-select-all"
              onClick={() => {
                onSelectAll();
                setMenu(null);
              }}
            >
              <span>Select All</span>
              <kbd>{CLIP_MENU_SHORTCUTS.selectAll}</kbd>
            </button>
          ) : null}
          {onSelectAllOnTrack ? (
            <button
              type="button"
              data-testid="clip-menu-select-all-on-track"
              onClick={() => {
                onSelectAllOnTrack();
                setMenu(null);
              }}
            >
              <span>Select All on Track</span>
              <kbd>{CLIP_MENU_SHORTCUTS.selectAllOnTrack}</kbd>
            </button>
          ) : null}
          {onSetClipsEnabled ? (
            <button
              type="button"
              data-testid="clip-menu-toggle-enabled"
              onClick={() => {
                const target = project.clips.find((c) => c.id === menu.clipId);
                onSetClipsEnabled(target?.enabled === false);
                setMenu(null);
              }}
            >
              <span>
                {project.clips.find((c) => c.id === menu.clipId)?.enabled === false
                  ? "Enable"
                  : "Disable"}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onDelete();
              setMenu(null);
            }}
          >
            <span>Delete</span>
            <kbd>{CLIP_MENU_SHORTCUTS.delete}</kbd>
          </button>
          <button
            type="button"
            data-testid="clip-menu-ripple-delete"
            onClick={() => {
              (onRippleDelete ?? onDelete)();
              setMenu(null);
            }}
          >
            <span>Ripple delete</span>
            <kbd>{CLIP_MENU_SHORTCUTS.rippleDelete}</kbd>
          </button>
          <button
            type="button"
            data-testid="clip-menu-lift-range"
            onClick={() => {
              onLiftRange?.();
              setMenu(null);
            }}
          >
            <span>Lift range</span>
            <kbd>{CLIP_MENU_SHORTCUTS.liftRange}</kbd>
          </button>
          <button
            type="button"
            data-testid="clip-menu-extract-range"
            onClick={() => {
              onExtractRange?.();
              setMenu(null);
            }}
          >
            <span>Extract range</span>
            <kbd>{CLIP_MENU_SHORTCUTS.extractRange}</kbd>
          </button>
          {onRelink ? (
            <button
              type="button"
              data-testid="clip-menu-relink"
              onClick={() => {
                onRelink();
                setMenu(null);
              }}
            >
              <span>Relink</span>
            </button>
          ) : null}
          {onCloseGap ? (
            <button
              type="button"
              data-testid="clip-menu-close-gap"
              onClick={() => {
                onCloseGap();
                setMenu(null);
              }}
            >
              <span>Close gap</span>
              <kbd>{CLIP_MENU_SHORTCUTS.closeGap}</kbd>
            </button>
          ) : null}
          {onRippleTrimToPlayhead ? (
            <>
              <button
                type="button"
                data-testid="clip-menu-ripple-trim-in"
                onClick={() => {
                  onRippleTrimToPlayhead("in");
                  setMenu(null);
                }}
              >
                <span>Ripple trim in to playhead</span>
                <kbd>{CLIP_MENU_SHORTCUTS.rippleTrimInToPlayhead}</kbd>
              </button>
              <button
                type="button"
                data-testid="clip-menu-ripple-trim-out"
                onClick={() => {
                  onRippleTrimToPlayhead("out");
                  setMenu(null);
                }}
              >
                <span>Ripple trim out to playhead</span>
                <kbd>{CLIP_MENU_SHORTCUTS.rippleTrimOutToPlayhead}</kbd>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {visMenu ? (
        <div
          className="clip-menu"
          data-testid="vis-event-menu"
          style={{ left: visMenu.x, top: visMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-testid="vis-event-menu-copy"
            onClick={() => {
              onCopy();
              setVisMenu(null);
            }}
          >
            <span>Copy</span>
            <kbd>{CLIP_MENU_SHORTCUTS.copy}</kbd>
          </button>
          <button
            type="button"
            data-testid="vis-event-menu-cut"
            onClick={() => {
              onCut();
              setVisMenu(null);
            }}
          >
            <span>Cut</span>
            <kbd>{CLIP_MENU_SHORTCUTS.cut}</kbd>
          </button>
          <button
            type="button"
            data-testid="vis-event-menu-paste"
            onClick={() => {
              onPaste();
              setVisMenu(null);
            }}
          >
            <span>Paste</span>
            <kbd>{CLIP_MENU_SHORTCUTS.paste}</kbd>
          </button>
          <button
            type="button"
            data-testid="vis-event-menu-delete"
            onClick={() => {
              onDelete();
              setVisMenu(null);
            }}
          >
            <span>Delete</span>
            <kbd>{CLIP_MENU_SHORTCUTS.delete}</kbd>
          </button>
        </div>
      ) : null}
      {markerMenu ? (
        <div
          className="clip-menu"
          data-testid="marker-menu"
          style={{ left: markerMenu.x, top: markerMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-testid="marker-menu-delete"
            onClick={() => {
              onDeleteMarker?.(markerMenu.markerId);
              setMarkerMenu(null);
            }}
          >
            <span>Delete marker</span>
            <kbd>{CLIP_MENU_SHORTCUTS.delete}</kbd>
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function clipUnderPlayhead(project: Project): Clip | undefined {
  return project.clips.find(
    (c) => project.playheadMs >= c.startMs && project.playheadMs < clipEndMs(c),
  );
}
