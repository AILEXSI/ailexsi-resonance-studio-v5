import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  TRACK_IDS,
  clipEndMs,
  kindOfTrack,
  projectDurationMs,
  type Clip,
  type Project,
  type TrackId,
} from "../../core/models";
import { collectSnapTargets, snapTime } from "../../core/timeline";
import { RULER_PAD_PX } from "../../core/zoom";
import { sceneShortName } from "../../core/visualizer";
import { CLIP_MENU_SHORTCUTS } from "../shortcuts/labels";
import { AudioClipWave, VideoClipStrip } from "./ClipPreview";
import { buildRulerTicks } from "../../core/ruler";

export { RULER_PAD_PX };

interface Props {
  project: Project;
  selectedClipId: string | null;
  selectedMarkerId?: string | null;
  onSelect: (clipId: string | null) => void;
  onSelectMarker?: (markerId: string | null) => void;
  onMarkerMoveLive?: (markerId: string, timeMs: number) => void;
  onMarkerMoveCommit?: () => void;
  onDeleteMarker?: (markerId: string) => void;
  onPlayhead: (ms: number) => void;
  onMoveLive: (clipId: string, startMs: number, trackId?: TrackId) => void;
  onMoveCommit: () => void;
  onTrimLive: (clipId: string, edge: "in" | "out", nextEdgeMs: number) => void;
  onTrimCommit: () => void;
  onToggleMute: (trackId: TrackId) => void;
  onToggleVisualizerMute: () => void;
  onCycleVisualizerScene: () => void;
  onSplitHere: (clipId: string, timeMs: number) => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onRippleDelete?: () => void;
  onZoom: (zoom: number, timelineWidthPx: number) => void;
  onFit: (timelineWidthPx: number) => void;
  onScroll: (ms: number) => void;
  onLoopClick: (ms: number) => void;
  onLoopInLive: (ms: number) => void;
  onLoopOutLive: (ms: number) => void;
  onLoopMoveLive: (deltaMs: number) => void;
  onLoopCommit: () => void;
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

export function Timeline({
  project,
  selectedClipId,
  selectedMarkerId = null,
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
  onToggleMute,
  onToggleVisualizerMute,
  onCycleVisualizerScene,
  onSplitHere,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onRippleDelete,
  onZoom,
  onFit,
  onScroll,
  onLoopClick,
  onLoopInLive,
  onLoopOutLive,
  onLoopMoveLive,
  onLoopCommit,
}: Props) {
  const timelineRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragKindRef = useRef<"move" | "trim" | "loop-in" | "loop-out" | "loop-move" | "marker" | null>(null);
  const [menu, setMenu] = useState<ClipMenu | null>(null);
  const [markerMenu, setMarkerMenu] = useState<MarkerMenu | null>(null);
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
    onPlayhead(timeFromEvent(e.clientX, e.currentTarget));
  };

  const onEmptyContext = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setMenu(null);
    setMarkerMenu(null);
    onLoopClick(snapIf(timeFromEvent(e.clientX, e.currentTarget)));
  };

  const onLaneBodyPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setMenu(null);
    setMarkerMenu(null);
    onSelect(null);
    onPlayhead(timeFromEvent(e.clientX, e.currentTarget));
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

  const onClipPointerDown = (e: ReactPointerEvent, clip: Clip) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    setMarkerMenu(null);
    if (dragKindRef.current) return;
    dragKindRef.current = "move";
    onSelect(clip.id);
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
      if (Math.abs(dy) > 24) {
        const idx = TRACK_IDS.indexOf(originTrack);
        const next = TRACK_IDS[idx + (dy > 0 ? 1 : -1)];
        if (next && kindOfTrack(next) === kindOfTrack(originTrack)) trackId = next;
      }
      onMoveLive(clip.id, nextStart, trackId);
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
    const move = (ev: PointerEvent) => {
      if (dragKindRef.current !== "trim") return;
      const dx = ev.clientX - originX;
      const nextEdge = originEdge + (dx / project.zoomPxPerSec) * 1000;
      onTrimLive(clip.id, edge, nextEdge);
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
    <section ref={timelineRef} className="timeline" data-testid="timeline">
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
        <div className="ruler-gutter" aria-hidden="true" />
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
      >
        <div className="lane-label">
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
              title={project.visualizer.sceneId}
              data-testid="visualizer-scene"
              onClick={(e) => {
                e.stopPropagation();
                onCycleVisualizerScene();
              }}
            >
              {sceneShortName(project.visualizer.sceneId)}
            </button>
          </div>
        </div>
        <div
          className="lane-body vis-body"
          data-testid="lane-VIS-body"
          onPointerDown={onLaneBodyPointer}
          onContextMenu={onEmptyContext}
        >
          {loopOverlay(false)}
          <div className="vis-lane-fill" aria-hidden="true" />
          <div
            className="playhead"
            style={{ left: msToX(project.playheadMs, project.zoomPxPerSec, project.scrollMs) }}
          />
        </div>
      </div>
      {TRACK_IDS.map((id) => {
        const track = project.tracks.find((t) => t.id === id);
        const muted = track?.muted === true;
        return (
          <div className={`lane${muted ? " muted" : ""}`} key={id}>
            <div className="lane-label">
              <span>{id}</span>
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
            </div>
            <div
              className="lane-body"
              onPointerDown={onLaneBodyPointer}
              onContextMenu={onEmptyContext}
            >
              {loopOverlay(false)}
              {project.clips
                .filter((c) => c.trackId === id)
                .map((clip) => {
                  const asset = project.assets.find((a) => a.id === clip.assetId);
                  const selected = selectedClipId === clip.id;
                  const label = asset?.missing ? `missing:${asset.name}` : asset?.name ?? clip.id;
                  const clipW = Math.max(8, msToWidth(clip.durationMs, project.zoomPxPerSec));
                  const kind = kindOfTrack(clip.trackId);
                  return (
                    <div
                      key={clip.id}
                      className={`clip ${kind}${selected ? " selected" : ""}${asset?.missing ? " missing" : ""}`}
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
                      <span className="clip-name">{label}</span>
                      {selected ? (
                        <>
                          <div
                            className="trim-handle in"
                            data-testid={`trim-in-${clip.id}`}
                            onPointerDown={(e) => onTrimPointerDown(e, clip, "in")}
                          />
                          <div
                            className="trim-handle out"
                            data-testid={`trim-out-${clip.id}`}
                            onPointerDown={(e) => onTrimPointerDown(e, clip, "out")}
                          />
                        </>
                      ) : null}
                    </div>
                  );
                })}
              <div
                className="playhead"
                style={{ left: msToX(project.playheadMs, project.zoomPxPerSec, project.scrollMs) }}
              />
            </div>
          </div>
        );
      })}
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
