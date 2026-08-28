import type { Project, TrackId } from "../../core/models";
import { describeMissing } from "../../core/persistence";

interface Props {
  project: Project;
  targetTrackId: TrackId;
  selectedAssetId: string | null;
  onSelectAsset: (id: string | null) => void;
  onTargetTrack: (id: TrackId) => void;
  onImport: (files: FileList) => void;
  onPlace: (assetId: string) => void;
}

export function MediaBrowser({
  project,
  targetTrackId,
  selectedAssetId,
  onSelectAsset,
  onTargetTrack,
  onImport,
  onPlace,
}: Props) {
  return (
    <aside className="panel" data-testid="media-browser">
      <h2>Media</h2>
      <input
        type="file"
        accept="audio/*,video/*"
        multiple
        data-testid="import-input"
        onChange={(e) => {
          if (e.target.files) onImport(e.target.files);
          e.target.value = "";
        }}
      />
      <p style={{ fontSize: 12, color: "var(--muted)" }}>
        Audio + video only. Other types fail visibly.
      </p>
      <label style={{ fontSize: 12, color: "var(--muted)" }}>
        Target track{" "}
        <select
          value={targetTrackId}
          onChange={(e) => onTargetTrack(e.target.value as TrackId)}
        >
          <option value="V1">V1</option>
          <option value="V2">V2</option>
          <option value="A1">A1</option>
          <option value="A2">A2</option>
        </select>
      </label>
      <div style={{ marginTop: 10 }}>
        {project.assets.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No media imported.</p>
        ) : (
          project.assets.map((asset) => (
            <div
              key={asset.id}
              className={`media-item${selectedAssetId === asset.id ? " selected" : ""}${asset.missing ? " missing" : ""}`}
              onClick={() => onSelectAsset(asset.id)}
              onDoubleClick={() => onPlace(asset.id)}
            >
              <strong>{asset.missing ? describeMissing(asset) : asset.name}</strong>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {asset.kind} · {(asset.durationMs / 1000).toFixed(2)}s
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
