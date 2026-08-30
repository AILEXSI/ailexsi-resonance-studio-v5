import { useMemo, useState } from "react";
import type { Project, TrackId } from "../../core/models";
import { displayMediaName, filterMediaAssets, type MediaKindFilter } from "../../core/media-display";
import { MEDIA_FILE_ACCEPT, writeAssetDrag } from "../../core/media";
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
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MediaKindFilter>("all");
  const visible = useMemo(
    () => filterMediaAssets(project.assets, { query, kind }),
    [project.assets, query, kind],
  );
  return (
    <aside className="panel" data-testid="media-browser">
      <h2>Media</h2>
      <input
        type="file"
        accept={MEDIA_FILE_ACCEPT}
        multiple
        data-testid="import-input-panel"
        onChange={(e) => {
          if (e.target.files) onImport(e.target.files);
          e.target.value = "";
        }}
      />
      <p style={{ fontSize: 12, color: "var(--muted)" }}>
        Audio, video, and images (jpeg/png/webp/gif). Other types fail visibly.
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
      <input
        type="search"
        value={query}
        placeholder="Search name…"
        data-testid="media-search"
        aria-label="Search media"
        style={{ display: "block", width: "100%", marginTop: 8, boxSizing: "border-box" }}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="media-kind-filter" data-testid="media-kind-filter" style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {(["all", "video", "audio", "image"] as const).map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`media-kind-${id}`}
            className={kind === id ? "active" : undefined}
            aria-pressed={kind === id}
            onClick={() => setKind(id)}
          >
            {id === "all" ? "All" : id}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        {project.assets.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No media imported.</p>
        ) : visible.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }} data-testid="media-empty-filter">
            No matching media.
          </p>
        ) : (
          visible.map((asset) => (
            <div
              key={asset.id}
              className={`media-item${selectedAssetId === asset.id ? " selected" : ""}${asset.missing ? " missing" : ""}`}
              title={asset.name}
              draggable
              data-testid={`media-item-${asset.id}`}
              data-asset-id={asset.id}
              data-asset-kind={asset.kind}
              onClick={() => onSelectAsset(asset.id)}
              onDoubleClick={() => onPlace(asset.id)}
              onDragStart={(e) => {
                writeAssetDrag(e.dataTransfer, asset.id);
                document.body.classList.add("media-asset-dragging");
              }}
              onDragEnd={() => {
                document.body.classList.remove("media-asset-dragging");
              }}
            >
              <strong title={asset.name}>
                {asset.missing ? describeMissing(asset) : displayMediaName(asset.name)}
              </strong>
              <div className="media-meta">
                {asset.kind} · {(asset.durationMs / 1000).toFixed(2)}s
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
