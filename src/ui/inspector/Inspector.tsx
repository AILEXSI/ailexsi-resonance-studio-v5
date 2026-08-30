import type { ReactNode } from "react";
import type { EditorCommand } from "../../app/commands";
import { firstClipIdWithLivingMate } from "../../core/link";
import {
  VISUALIZER_SCENE_IDS,
  clipById,
  formatTimecode,
  kindOfTrack,
  type Clip,
  type Project,
  type TrackId,
  type VisualizerSceneId,
} from "../../core/models";
import {
  TRANSITION_AUDIO_MODES,
  TRANSITION_TYPES,
  findTransitionForPair,
  resolveEditPair,
  type TransitionAudioMode,
  type TransitionType,
} from "../../core/transition";

interface Props {
  project: Project;
  selectedClipId: string | null;
  selectedClipIds?: string[];
  selectedVis?: boolean;
  onChange: (clipId: string, patch: Partial<Pick<Clip, "startMs" | "durationMs" | "sourceInMs" | "sourceOutMs" | "gain" | "trackId">>) => void;
  onFades?: (clipId: string, fadeInMs: number, fadeOutMs: number) => void;
  onRate?: (clipId: string, rate: number) => void;
  onUnlink?: (clipId: string) => void;
  onTransition?: (cmd: Extract<EditorCommand, { type: "setTransition" }>) => void;
  onVisualizer?: (
    patch: Partial<{ sceneId: VisualizerSceneId; startMs: number; durationMs: number }>,
  ) => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function MsField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  testId?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        data-testid={testId}
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="tc">{formatTimecode(value)}</span>
    </Field>
  );
}

export function Inspector({
  project,
  selectedClipId,
  selectedClipIds,
  selectedVis,
  onChange,
  onFades,
  onRate,
  onUnlink,
  onTransition,
  onVisualizer,
}: Props) {
  const ids = selectedClipIds?.length ? selectedClipIds : selectedClipId ? [selectedClipId] : [];
  const clip = ids.length === 1 ? clipById(project, ids[0]!) : undefined;
  const asset = clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;
  const unlinkId = firstClipIdWithLivingMate(project, ids);
  const pair = resolveEditPair(project, ids);
  const stored = pair
    ? findTransitionForPair(project.transitions ?? [], pair.sourceA.id, pair.sourceB.id)
    : undefined;
  const vis = project.visualizer;

  return (
    <aside className="panel inspector" data-testid="inspector">
      <h2>Inspector</h2>
      {selectedVis ? (
        <dl data-testid="inspector-vis">
          <Field label="VIS scene">
            <select
              data-testid="inspector-vis-scene"
              value={vis.sceneId}
              onChange={(e) => onVisualizer?.({ sceneId: e.target.value as VisualizerSceneId })}
            >
              {VISUALIZER_SCENE_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </Field>
          <MsField
            label="VIS from (ms)"
            testId="inspector-vis-start"
            value={vis.startMs ?? 0}
            onChange={(v) => onVisualizer?.({ startMs: v })}
          />
          <MsField
            label="VIS to span (ms)"
            testId="inspector-vis-duration"
            value={vis.durationMs ?? 0}
            onChange={(v) => onVisualizer?.({ durationMs: v })}
          />
        </dl>
      ) : ids.length >= 2 ? (
        <p data-testid="inspector-selection-count" style={{ color: "var(--muted)" }}>
          {ids.length} clips
        </p>
      ) : !clip ? (
        <p style={{ color: "var(--muted)" }}>No clip selected.</p>
      ) : (
        <dl>
          <Field label="Track">
            <select
              value={clip.trackId}
              onChange={(e) => onChange(clip.id, { trackId: e.target.value as TrackId })}
            >
              {(kindOfTrack(clip.trackId) === "video" ? ["V1", "V2"] : ["A1", "A2"]).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </Field>
          <MsField label="Start (ms)" value={clip.startMs} onChange={(v) => onChange(clip.id, { startMs: v })} />
          <MsField label="Duration (ms)" value={clip.durationMs} onChange={(v) => onChange(clip.id, { durationMs: v })} />
          <MsField label="Source In" value={clip.sourceInMs} onChange={(v) => onChange(clip.id, { sourceInMs: v })} />
          <MsField label="Source Out" value={clip.sourceOutMs} onChange={(v) => onChange(clip.id, { sourceOutMs: v })} />
          <Field label="Gain">
            <input
              type="number"
              step="0.05"
              min={0}
              max={4}
              value={clip.gain}
              onChange={(e) => onChange(clip.id, { gain: Number(e.target.value) })}
            />
          </Field>
          <Field label="Rate">
            <input
              type="number"
              step="0.05"
              min={0.25}
              max={4}
              data-testid="inspector-rate"
              value={clip.rate}
              onChange={(e) => onRate?.(clip.id, Number(e.target.value))}
            />
          </Field>
          <MsField
            label="Fade in (ms)"
            testId="inspector-fade-in"
            value={clip.fadeInMs}
            onChange={(v) => onFades?.(clip.id, v, clip.fadeOutMs)}
          />
          <MsField
            label="Fade out (ms)"
            testId="inspector-fade-out"
            value={clip.fadeOutMs}
            onChange={(v) => onFades?.(clip.id, clip.fadeInMs, v)}
          />
          <Field label="Asset">{asset?.missing ? <span className="err">{asset.name}</span> : (asset?.name ?? "—")}</Field>
        </dl>
      )}
      {pair && !selectedVis ? (
        <dl data-testid="inspector-transition">
          <Field label="Type">
            <select
              data-testid="inspector-transition-type"
              value={stored?.type ?? "cut"}
              onChange={(e) =>
                onTransition?.({ type: "setTransition", transitionType: e.target.value as TransitionType })
              }
            >
              {TRANSITION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <MsField
            label="Duration (ms)"
            testId="inspector-transition-duration"
            value={stored?.durationMs ?? pair.overlapDurationMs}
            onChange={(v) => onTransition?.({ type: "setTransition", durationMs: v })}
          />
          <Field label="Audio">
            <select
              data-testid="inspector-transition-audio"
              value={stored?.audioMode ?? "cut"}
              onChange={(e) =>
                onTransition?.({ type: "setTransition", audioMode: e.target.value as TransitionAudioMode })
              }
            >
              {TRANSITION_AUDIO_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <MsField
            label="Audio duration (ms)"
            testId="inspector-transition-audio-duration"
            value={stored?.audioDurationMs ?? stored?.durationMs ?? pair.overlapDurationMs}
            onChange={(v) => onTransition?.({ type: "setTransition", audioDurationMs: v })}
          />
        </dl>
      ) : null}
      {unlinkId ? (
        <button
          type="button"
          className="inspector-unlink"
          data-testid="inspector-unlink"
          onClick={() => onUnlink?.(unlinkId)}
        >
          Unlink
        </button>
      ) : null}
    </aside>
  );
}
