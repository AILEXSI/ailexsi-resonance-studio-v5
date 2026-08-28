import type { ReactNode } from "react";
import { clipById, kindOfTrack, type Clip, type Project, type TrackId } from "../../core/models";

interface Props {
  project: Project;
  selectedClipId: string | null;
  onChange: (clipId: string, patch: Partial<Pick<Clip, "startMs" | "durationMs" | "sourceInMs" | "sourceOutMs" | "gain" | "trackId">>) => void;
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

export function Inspector({ project, selectedClipId, onChange }: Props) {
  const clip = selectedClipId ? clipById(project, selectedClipId) : undefined;
  const asset = clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;

  return (
    <aside className="panel inspector" data-testid="inspector">
      <h2>Inspector</h2>
      {!clip ? (
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
          <Field label="Start (ms)">
            <input
              type="number"
              value={Math.round(clip.startMs)}
              onChange={(e) => onChange(clip.id, { startMs: Number(e.target.value) })}
            />
          </Field>
          <Field label="Duration (ms)">
            <input
              type="number"
              value={Math.round(clip.durationMs)}
              onChange={(e) => onChange(clip.id, { durationMs: Number(e.target.value) })}
            />
          </Field>
          <Field label="Source In">
            <input
              type="number"
              value={Math.round(clip.sourceInMs)}
              onChange={(e) => onChange(clip.id, { sourceInMs: Number(e.target.value) })}
            />
          </Field>
          <Field label="Source Out">
            <input
              type="number"
              value={Math.round(clip.sourceOutMs)}
              onChange={(e) => onChange(clip.id, { sourceOutMs: Number(e.target.value) })}
            />
          </Field>
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
          <Field label="Asset">{asset?.name ?? "—"}</Field>
          <Field label="Blend">
            <span className="ni">not-implemented</span>
          </Field>
          <Field label="Speed">
            <span className="ni">not-implemented</span>
          </Field>
        </dl>
      )}
    </aside>
  );
}
