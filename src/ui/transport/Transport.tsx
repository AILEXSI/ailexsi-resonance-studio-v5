import { FRAME_MS, formatTimecode, type Project } from "../../core/models";
import { CLIP_MENU_SHORTCUTS } from "../shortcuts/labels";
import { TimecodeField } from "./TimecodeField";

interface Props {
  project: Project;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onStep: (deltaMs: number) => void;
  onToggleLoop: () => void;
  followPlayhead?: boolean;
  onToggleFollow?: () => void;
  onIn: () => void;
  onOut: () => void;
  onClear: () => void;
  onMarker: () => void;
  onSplit: () => void;
  onSeek?: (ms: number) => void;
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
      {props.onToggleFollow ? (
        <button
          type="button"
          className={props.followPlayhead !== false ? "active" : ""}
          data-testid="follow-playhead"
          title="Keep playhead in view"
          onClick={props.onToggleFollow}
        >
          Follow
        </button>
      ) : null}
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
      <button type="button" title={`Split (${CLIP_MENU_SHORTCUTS.split})`} onClick={props.onSplit}>
        Split
        <kbd className="btn-kbd">{CLIP_MENU_SHORTCUTS.split}</kbd>
      </button>
      <TimecodeField playheadMs={props.project.playheadMs} onSeek={props.onSeek} />
      <span style={{ color: "var(--muted)", fontSize: 12 }}>
        IN {props.project.inPointMs == null ? "—" : formatTimecode(props.project.inPointMs)} · OUT{" "}
        {props.project.outPointMs == null ? "—" : formatTimecode(props.project.outPointMs)}
      </span>
    </div>
  );
}
