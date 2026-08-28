import { FRAME_MS, type Project } from "../../core/models";

interface Props {
  project: Project;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onStep: (deltaMs: number) => void;
  onToggleLoop: () => void;
  onIn: () => void;
  onOut: () => void;
  onMarker: () => void;
  onSplit: () => void;
}

function fmt(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${String(m).padStart(2, "0")}:${rem.toFixed(2).padStart(5, "0")}`;
}

export function Transport(props: Props) {
  return (
    <div className="transport" data-testid="transport">
      <button type="button" onClick={props.onPlay} disabled={props.playing}>
        Play
      </button>
      <button type="button" onClick={props.onPause} disabled={!props.playing}>
        Pause
      </button>
      <button type="button" onClick={props.onStop}>
        Stop
      </button>
      <button type="button" onClick={() => props.onStep(-FRAME_MS)}>
        −1f
      </button>
      <button type="button" onClick={() => props.onStep(FRAME_MS)}>
        +1f
      </button>
      <button type="button" className={props.project.loop ? "active" : ""} onClick={props.onToggleLoop}>
        Loop
      </button>
      <button type="button" onClick={props.onIn}>
        IN
      </button>
      <button type="button" onClick={props.onOut}>
        OUT
      </button>
      <button type="button" onClick={props.onMarker}>
        Marker
      </button>
      <button type="button" onClick={props.onSplit}>
        Split
      </button>
      <span data-testid="timecode">{fmt(props.project.playheadMs)}</span>
      <span style={{ color: "var(--muted)", fontSize: 12 }}>
        IN {props.project.inPointMs == null ? "—" : fmt(props.project.inPointMs)} · OUT{" "}
        {props.project.outPointMs == null ? "—" : fmt(props.project.outPointMs)}
      </span>
    </div>
  );
}
