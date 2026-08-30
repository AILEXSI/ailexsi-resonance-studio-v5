import { TRACK_IDS, type Project, type TrackId } from "../../core/models";
import {
  dbToFader,
  dbToLinear,
  faderToDb,
  formatDb,
  linearToDb,
  meterHeightPct,
  peakToDb,
} from "../../core/volume";

export type MixPeaks = {
  V1: number;
  V2: number;
  A1: number;
  A2: number;
  master: number;
};

interface Props {
  project: Project;
  selectedTrackId: TrackId;
  peaks: MixPeaks;
  onSelectTrack: (id: TrackId) => void;
  onVolume: (id: TrackId, linear: number) => void;
  onMasterVolume: (linear: number) => void;
  onToggleMute: (id: TrackId) => void;
}

function Strip(props: {
  id: string;
  label: string;
  volume: number;
  muted?: boolean;
  selected?: boolean;
  peak: number;
  kind: "video" | "audio" | "master";
  onSelect?: () => void;
  onVolume: (linear: number) => void;
  onMute?: () => void;
}) {
  const pos = dbToFader(linearToDb(props.volume));
  const dbLabel = formatDb(linearToDb(props.volume));
  const meterDb = formatDb(peakToDb(props.peak));
  return (
    <div
      className={`mix-strip ${props.kind}${props.selected ? " selected" : ""}${props.muted ? " muted" : ""}`}
      data-testid={`mix-${props.id}`}
      onClick={props.onSelect}
    >
      <div className="mix-name">{props.label}</div>
      <div className="mix-meter" aria-hidden="true">
        <div className="mix-meter-fill" style={{ height: `${meterHeightPct(props.peak)}%` }} />
      </div>
      <input
        type="range"
        className="mix-fader"
        min={0}
        max={1}
        step={0.005}
        value={pos}
        aria-label={`${props.label} volume`}
        title={dbLabel}
        data-testid={`mix-fader-${props.id}`}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => props.onVolume(dbToLinear(faderToDb(Number(e.target.value))))}
      />
      <div className="mix-db" data-testid={`mix-db-${props.id}`}>
        {dbLabel}
      </div>
      <div className="mix-peak">{meterDb}</div>
      {props.onMute ? (
        <button
          type="button"
          className={props.muted ? "active mute-btn" : "mute-btn"}
          title={props.muted ? `Unmute ${props.label}` : `Mute ${props.label}`}
          onClick={(e) => {
            e.stopPropagation();
            props.onMute?.();
          }}
        >
          M
        </button>
      ) : (
        <span className="mix-master-tag">MST</span>
      )}
    </div>
  );
}

export function Mixer({
  project,
  selectedTrackId,
  peaks,
  onSelectTrack,
  onVolume,
  onMasterVolume,
  onToggleMute,
}: Props) {
  return (
    <aside className="mixer" data-testid="mixer">
      {TRACK_IDS.map((id) => {
        const track = project.tracks.find((t) => t.id === id);
        return (
          <Strip
            key={id}
            id={id}
            label={id}
            kind={id === "A1" || id === "A2" ? "audio" : "video"}
            volume={track?.volume ?? 1}
            muted={track?.muted === true}
            selected={selectedTrackId === id}
            peak={peaks[id]}
            onSelect={() => onSelectTrack(id)}
            onVolume={(v) => onVolume(id, v)}
            onMute={() => onToggleMute(id)}
          />
        );
      })}
      <Strip
        id="master"
        label="MST"
        kind="master"
        volume={project.masterVolume ?? 1}
        peak={peaks.master}
        onVolume={onMasterVolume}
      />
    </aside>
  );
}
