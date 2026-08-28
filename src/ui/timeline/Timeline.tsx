import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  TRACK_IDS,
  clipEndMs,
  kindOfTrack,
  projectDurationMs,
  type Clip,
  type Project,
  type TrackId,
} from "../../core/models";

interface Props {
  project: Project;
  selectedClipId: string | null;
  onSelect: (clipId: string | null) => void;
  onPlayhead: (ms: number) => void;
  onMoveLive: (clipId: string, startMs: number, trackId?: TrackId) => void;
  onMoveCommit: () => void;
  onTrimLive: (clipId: string, edge: "in" | "out", nextEdgeMs: number) => void;
  onTrimCommit: () => void;
  onToggleMute: (trackId: TrackId) => void;
  onSplitHere: (clipId: string, timeMs: number) => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onZoom: (zoom: number) => void;
  onScroll: (ms: number) => void;
}

function msToX(ms: number, zoom: number, scrollMs: number): number {
  return ((ms - scrollMs) / 1000) * zoom;
}

function xToMs(x: number, zoom: number, scrollMs: number): number {
  return scrollMs + (x / zoom) * 1000;
}

interface ClipMenu {
  x: number;
  y: number;
  clipId: string;
  timeMs: number;
}

export function Timeline({
  project,
  selectedClipId,
  onSelect,
  onPlayhead,
  onMoveLive,
  onMoveCommit,
  onTrimLive,
  onTrimCommit,
  onToggleMute,
  onSplitHere,
  onCopy,
  onPaste,
  onDelete,
  onZoom,
  onScroll,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragKindRef = useRef<"move" | "trim" | null>(null);
  const [menu, setMenu] = useState<ClipMenu | null>(null);
  const duration = Math.max(10_000, projectDurationMs(project) + 2000);

  const ticks = useMemo(() => {
    const step = project.zoomPxPerSec >= 120 ? 500 : project.zoomPxPerSec >= 40 ? 1000 : 2000;
    const out: number[] = [];
    for (let t = 0; t <= duration; t += step) out.push(t);
    return out;
  }, [duration, project.zoomPxPerSec]);

  const timeFromEvent = (clientX: number): number => {
    const el = bodyRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, xToMs(clientX - rect.left, project.zoomPxPerSec, project.scrollMs));
  };

  const onRulerPointer = (e: ReactPointerEvent) => {
    setMenu(null);
    onPlayhead(timeFromEvent(e.clientX));
  };

  const onClipPointerDown = (e: ReactPointerEvent, clip: Clip) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
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

  const onClipContext = (e: ReactMouseEvent, clip: Clip) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(clip.id);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      clipId: clip.id,
      timeMs: timeFromEvent(e.clientX),
    });
  };

  const range = project.inPointMs != null && project.outPointMs != null
    ? {
        left: msToX(project.inPointMs, project.zoomPxPerSec, project.scrollMs),
        width: msToX(project.outPointMs - project.inPointMs, project.zoomPxPerSec, 0),
      }
    : null;

  return (
    <section className="timeline" data-testid="timeline">
      <div className="timeline-tools">
        <button type="button" onClick={() => onZoom(project.zoomPxPerSec / 1.2)}>
          −
        </button>
        <button type="button" onClick={() => onZoom(project.zoomPxPerSec * 1.2)}>
          +
        </button>
        <span className="timeline-zoom">{Math.round(project.zoomPxPerSec)} px/s</span>
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
      <div
        className="ruler"
        ref={bodyRef}
        onPointerDown={onRulerPointer}
        data-testid="ruler"
      >
        {ticks.map((t) => (
          <div
            key={t}
            className="ruler-tick"
            style={{ left: msToX(t, project.zoomPxPerSec, project.scrollMs) }}
          >
            {(t / 1000).toFixed(t % 1000 === 0 ? 0 : 1)}s
          </div>
        ))}
        {project.markers.map((m) => (
          <div
            key={m.id}
            className="marker-flag"
            title={m.label}
            style={{ left: msToX(m.timeMs, project.zoomPxPerSec, project.scrollMs) }}
          />
        ))}
        {range ? <div className="in-out" style={{ left: range.left, width: range.width }} /> : null}
        <div
          className="playhead"
          style={{ left: msToX(project.playheadMs, project.zoomPxPerSec, project.scrollMs) }}
        />
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
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                setMenu(null);
                onSelect(null);
                onPlayhead(timeFromEvent(e.clientX));
              }}
            >
              {range ? <div className="in-out" style={{ left: range.left, width: range.width }} /> : null}
              {project.clips
                .filter((c) => c.trackId === id)
                .map((clip) => {
                  const asset = project.assets.find((a) => a.id === clip.assetId);
                  const selected = selectedClipId === clip.id;
                  const label = asset?.missing ? `missing:${asset.name}` : asset?.name ?? clip.id;
                  return (
                    <div
                      key={clip.id}
                      className={`clip ${kindOfTrack(clip.trackId)}${selected ? " selected" : ""}${asset?.missing ? " missing" : ""}`}
                      style={{
                        left: msToX(clip.startMs, project.zoomPxPerSec, project.scrollMs),
                        width: Math.max(8, msToX(clip.durationMs, project.zoomPxPerSec, 0)),
                      }}
                      title={label}
                      onPointerDown={(e) => onClipPointerDown(e, clip)}
                      onContextMenu={(e) => onClipContext(e, clip)}
                    >
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
            Split here
          </button>
          <button
            type="button"
            onClick={() => {
              onCopy();
              setMenu(null);
            }}
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => {
              onPaste();
              setMenu(null);
            }}
          >
            Paste
          </button>
          <button
            type="button"
            onClick={() => {
              onDelete();
              setMenu(null);
            }}
          >
            Delete
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
