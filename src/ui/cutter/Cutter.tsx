import type { EditorCommand } from "../../app/commands";
import type { TransitionAudioMode, TransitionType } from "../../core/transition";
import {
  TRANSITION_AUDIO_MODES,
  TRANSITION_TYPES,
  findTransitionForPair,
  resolveEditPair,
} from "../../core/transition";
import type { Project } from "../../core/models";

function assetLabel(project: Project, assetId: string): string {
  return project.assets.find((a) => a.id === assetId)?.name ?? assetId;
}

export function Cutter({
  project,
  selectedClipId,
  selectedClipIds,
  apply,
}: {
  project: Project;
  selectedClipId: string | null;
  selectedClipIds: string[];
  apply: (cmd: EditorCommand) => void;
}) {
  const pair = resolveEditPair(project, selectedClipIds.length ? selectedClipIds : selectedClipId ? [selectedClipId] : []);
  const stored = pair
    ? findTransitionForPair(project.transitions ?? [], pair.sourceA.id, pair.sourceB.id)
    : undefined;
  const type: TransitionType = stored?.type ?? "cut";
  const durationMs = stored?.durationMs ?? (pair ? Math.max(1, pair.overlapDurationMs) : 0);
  const audioMode: TransitionAudioMode = stored?.audioMode ?? "cut";
  const audioDurationMs = stored?.audioDurationMs ?? durationMs;

  return (
    <div className="cutter cutter-strip" data-testid="cutter">
      <div className="cutter-title">Cutter</div>
      {!pair ? (
        <div className="cutter-empty" data-testid="cutter-empty">
          No edit. Select a clip that overlaps another video track.
        </div>
      ) : (
        <div className="cutter-edit" data-testid="cutter-edit">
          <div className="cutter-pair" data-testid="cutter-source-a">
            Source A {assetLabel(project, pair.sourceA.assetId)} {pair.sourceA.trackId}
          </div>
          <div className="cutter-pair" data-testid="cutter-source-b">
            Source B {assetLabel(project, pair.sourceB.assetId)} {pair.sourceB.trackId}
          </div>
          <label className="cutter-field">
            Type
            <select
              data-testid="cutter-type"
              value={type}
              onChange={(e) => apply({ type: "setTransition", transitionType: e.target.value as TransitionType })}
            >
              {TRANSITION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="cutter-field">
            Duration ms
            <input
              data-testid="cutter-duration"
              type="number"
              min={1}
              value={durationMs}
              onChange={(e) => apply({ type: "setTransition", durationMs: Number(e.target.value) })}
            />
          </label>
          <label className="cutter-field">
            Audio
            <select
              data-testid="cutter-audio-mode"
              value={audioMode}
              onChange={(e) => apply({ type: "setTransition", audioMode: e.target.value as TransitionAudioMode })}
            >
              {TRANSITION_AUDIO_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="cutter-field">
            Audio duration ms
            <input
              data-testid="cutter-audio-duration"
              type="number"
              min={0}
              value={audioDurationMs}
              onChange={(e) => apply({ type: "setTransition", audioDurationMs: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
