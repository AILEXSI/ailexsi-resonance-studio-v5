import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
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
  onZoom: (zoom: number) => void;
  onScroll: (ms: number) => void;
}

function msToX(ms: number, zoom: number, scrollMs: number): number {
  return ((ms - scrollMs) / 1000) * zoom;
}

function xToMs(x: number, zoom: number, scrollMs: number): number {
  return scrollMs + (x / zoom) * 1000;
}

export function Timeline({
  project,
  selectedClipId,
  onSelect,
  onPlayhead,
  onMoveLive,
  onMoveCommit,
  onZoom,
  onScroll,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
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
    onPlayhead(timeFromEvent(e.clientX));
  };

  const onClipPointerDown = (e: ReactPointerEvent, clip: Clip) => {
    e.stopPropagation();
    onSelect(clip.id);
    const originX = e.clientX;
    const originStart = clip.startMs;
    const originY = e.clientY;
    const originTrack = clip.trackId;
    const move = (ev: PointerEvent) => {
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
      onMoveCommit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const range = project.inPointMs != null && project.outPointMs != null
    ? {
        left: msToX(project.inPointMs, project.zoomPxPerSec, project.scrollMs),
        width: msToX(project.outPointMs - project.inPointMs, project.zoomPxPerSec, 0),
      }
    : null;

  return (
    <section className="timeline" data-testid="timeline">
      <div style={{ display: "flex", gap: 8, padding: "6px 10px", fontSize: 12 }}>
        <button type="button" onClick={() => onZoom(project.zoomPxPerSec / 1.2)}>
          −
        </button>
        <button type="button" onClick={() => onZoom(project.zoomPxPerSec * 1.2)}>
          +
        </button>
        <span style={{ color: "var(--muted)" }}>{Math.round(project.zoomPxPerSec)} px/s</span>
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
      {TRACK_IDS.map((id) => (
        <div className="lane" key={id}>
          <div className="lane-label">{id}</div>
          <div
            className="lane-body"
            onPointerDown={(e) => {
              onSelect(null);
              onPlayhead(timeFromEvent(e.clientX));
            }}
          >
            {range ? <div className="in-out" style={{ left: range.left, width: range.width }} /> : null}
            {project.clips
              .filter((c) => c.trackId === id)
              .map((clip) => {
                const asset = project.assets.find((a) => a.id === clip.assetId);
                return (
                  <div
                    key={clip.id}
                    className={`clip ${kindOfTrack(clip.trackId)}${selectedClipId === clip.id ? " selected" : ""}${asset?.missing ? " missing" : ""}`}
                    style={{
                      left: msToX(clip.startMs, project.zoomPxPerSec, project.scrollMs),
                      width: Math.max(8, msToX(clip.durationMs, project.zoomPxPerSec, 0)),
                    }}
                    onPointerDown={(e) => onClipPointerDown(e, clip)}
                  >
                    {asset?.missing ? `missing:${asset.name}` : asset?.name ?? clip.id}
                  </div>
                );
              })}
            <div
              className="playhead"
              style={{ left: msToX(project.playheadMs, project.zoomPxPerSec, project.scrollMs) }}
            />
          </div>
        </div>
      ))}
    </section>
  );
}

export function clipUnderPlayhead(project: Project): Clip | undefined {
  return project.clips.find(
    (c) => project.playheadMs >= c.startMs && project.playheadMs < clipEndMs(c),
  );
}
