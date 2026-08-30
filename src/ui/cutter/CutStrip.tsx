import { collectEditPoints, nearestEditPointMs } from "../../core/timeline";
import { LANE_LABEL_PX, RULER_PAD_PX } from "../../core/zoom";
import type { Project } from "../../core/models";
import { transitionAt } from "../../core/transition";

function msToX(ms: number, zoom: number, scrollMs: number): number {
  return LANE_LABEL_PX + RULER_PAD_PX + ((ms - scrollMs) / 1000) * zoom;
}

/** Gold tick: transition under playhead if that start is a collected point, else nearest point. */
export function currentCutTickMs(project: Project): number | undefined {
  const points = collectEditPoints(project);
  if (!points.length) return undefined;
  const stored = transitionAt(project.transitions ?? [], project.playheadMs);
  if (stored && points.includes(stored.startMs)) return stored.startMs;
  return nearestEditPointMs(project, stored?.startMs ?? project.playheadMs);
}

export function CutStrip({
  project,
  onPlayhead,
}: {
  project: Project;
  onPlayhead: (ms: number) => void;
}) {
  const points = collectEditPoints(project);
  const zoom = project.zoomPxPerSec > 0 ? project.zoomPxPerSec : 80;
  const current = currentCutTickMs(project);
  const last = points[points.length - 1] ?? 0;
  const width = Math.max(28, msToX(last, zoom, project.scrollMs) + 8);

  return (
    <div className="cut-strip" data-testid="cut-strip">
      <div className="cut-strip-track" data-testid="cut-strip-track" style={{ width }}>
        {points.map((ms) => (
          <button
            key={ms}
            type="button"
            className={`cut-strip-tick${ms === current ? " current" : ""}`}
            data-testid="cut-strip-tick"
            data-ms={String(ms)}
            aria-current={ms === current}
            title={`${Math.round(ms)}ms`}
            style={{ left: msToX(ms, zoom, project.scrollMs) }}
            onClick={() => onPlayhead(ms)}
          />
        ))}
      </div>
    </div>
  );
}
