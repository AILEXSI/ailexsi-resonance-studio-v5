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
import { canShowRelink } from "../../core/relink";
import {
  TRANSITION_TYPES,
  editPairAt,
  findTransitionForPair,
  resolveEditPair,
  transitionAt,
  transitionAudioDurationMs,
  transitionAudioOf,
  transitionSourceOf,
  type TransitionType,
} from "../../core/transition";
import { AudioButtons } from "../cutter/AudioButtons";
import { SourceButtons } from "../cutter/SourceButtons";

interface Props {
  project: Project;
  selectedClipId: string | null;
  selectedClipIds?: string[];
  selectedVis?: boolean;
  selectedVisEventId?: string | null;
  onChange: (clipId: string, patch: Partial<Pick<Clip, "startMs" | "durationMs" | "sourceInMs" | "sourceOutMs" | "gain" | "trackId" | "enabled">>) => void;
  onSetEnabled?: (enabled: boolean) => void;
  onFades?: (clipId: string, fadeInMs: number, fadeOutMs: number) => void;
  onRate?: (clipId: string, rate: number) => void;
  onUnlink?: (clipId: string) => void;
  onRelink?: () => void;
  onTransition?: (
    cmd: Extract<
      EditorCommand,
      { type: "setTransition" } | { type: "setTransitionSource" } | { type: "setTransitionAudio" } | { type: "setTransitionAudioDuration" }
    >,
  ) => void;
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
  selectedVisEventId,
  onChange,
  onSetEnabled,
  onFades,
  onRate,
  onUnlink,
  onRelink,
  onTransition,
  onVisualizer,
}: Props) {
  const ids = selectedClipIds?.length ? selectedClipIds : selectedClipId ? [selectedClipId] : [];
  const clip = ids.length === 1 ? clipById(project, ids[0]!) : undefined;
  const asset = clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;
  const unlinkId = firstClipIdWithLivingMate(project, ids);
  const showRelink = !selectedVis && canShowRelink(project, ids);
  const pair = resolveEditPair(project, ids) ?? editPairAt(project, project.playheadMs);
  const stored = pair
    ? findTransitionForPair(project.transitions ?? [], pair.sourceA.id, pair.sourceB.id)
    : transitionAt(project.transitions ?? [], project.playheadMs);
  const source = transitionSourceOf(stored);
  const audio = transitionAudioOf(stored);
  const audioDurationMs = transitionAudioDurationMs(stored);
  const vis = project.visualizer;
  const visEvent = selectedVisEventId
    ? (vis.events ?? []).find((e) => e.id === selectedVisEventId)
    : undefined;
  const visScene = visEvent?.sceneId ?? vis.sceneId;
  const visStart = visEvent?.startMs ?? vis.startMs ?? 0;
  const visDuration = visEvent?.durationMs ?? vis.durationMs ?? 0;

  return (
    <aside className="panel inspector" data-testid="inspector">
      <h2>Inspector</h2>
      <SourceButtons
        value={source}
        testIdPrefix="inspector"
        onPick={(next) => onTransition?.({ type: "setTransitionSource", source: next })}
      />
      <AudioButtons
        value={audio}
        durationMs={audioDurationMs}
        testIdPrefix="inspector"
        onPick={(next) => onTransition?.({ type: "setTransitionAudio", audio: next })}
        onDuration={(ms) => onTransition?.({ type: "setTransitionAudioDuration", audioDurationMs: ms })}
      />
      {selectedVis ? (
        <dl data-testid="inspector-vis">
          <Field label="VIS scene">
            <select
              data-testid="inspector-vis-scene"
              value={visScene}
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
            value={visStart}
            onChange={(v) => onVisualizer?.({ startMs: Math.round(v) })}
          />
          <MsField
            label="VIS to span (ms)"
            testId="inspector-vis-duration"
            value={visDuration}
            onChange={(v) => onVisualizer?.({ durationMs: Math.round(v) })}
          />
        </dl>
      ) : ids.length >= 2 ? (
        <>
          <p data-testid="inspector-selection-count" style={{ color: "var(--muted)" }}>
            {ids.length} clips
          </p>
          {onSetEnabled ? (
            <div className="inspector-clip-actions">
              <button
                type="button"
                data-testid="inspector-enable-clips"
                onClick={() => onSetEnabled(true)}
              >
                Enable
              </button>
              <button
                type="button"
                data-testid="inspector-disable-clips"
                onClick={() => onSetEnabled(false)}
              >
                Disable
              </button>
            </div>
          ) : null}
        </>
      ) : !clip ? (
        <p style={{ color: "var(--muted)" }}>No clip selected.</p>
      ) : (
        <dl>
          <Field label="Track">
            <select
              data-testid="inspector-track"
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
          <Field label="Enabled">
            <input
              type="checkbox"
              aria-label="clip-enabled"
              data-testid="inspector-clip-enabled"
              checked={clip.enabled !== false}
              onChange={(e) => {
                const next = e.target.checked;
                if (onSetEnabled) onSetEnabled(next);
                else onChange(clip.id, { enabled: next });
              }}
            />
          </Field>
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
        </dl>
      ) : null}
      {showRelink || unlinkId ? (
        <div className="inspector-clip-actions">
          {showRelink ? (
            <button type="button" data-testid="inspector-relink" onClick={() => onRelink?.()}>
              Relink
            </button>
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
        </div>
      ) : null}
    </aside>
  );
}
