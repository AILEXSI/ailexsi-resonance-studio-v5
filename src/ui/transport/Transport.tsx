import { FRAME_MS, formatTimecode, type Project } from "../../core/models";

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
  onClear: () => void;
  onMarker: () => void;
  onSplit: () => void;
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
      <button type="button" onClick={props.onClear}>
        Clear
      </button>
      <button type="button" onClick={props.onMarker}>
        Marker
      </button>
      <button type="button" onClick={props.onSplit}>
        Split
      </button>
      <span data-testid="timecode">{formatTimecode(props.project.playheadMs)}</span>
      <span style={{ color: "var(--muted)", fontSize: 12 }}>
        IN {props.project.inPointMs == null ? "—" : formatTimecode(props.project.inPointMs)} · OUT{" "}
        {props.project.outPointMs == null ? "—" : formatTimecode(props.project.outPointMs)}
      </span>
    </div>
  );
}
