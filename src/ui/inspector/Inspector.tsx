import type { ReactNode } from "react";
import { clipById, formatTimecode, kindOfTrack, type Clip, type Project, type TrackId } from "../../core/models";

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

function MsField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="tc">{formatTimecode(value)}</span>
    </Field>
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
          <Field label="Asset">{asset?.missing ? <span className="err">{asset.name}</span> : (asset?.name ?? "—")}</Field>
        </dl>
      )}
    </aside>
  );
}
