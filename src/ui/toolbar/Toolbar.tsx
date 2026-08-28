interface Props {
  snap: boolean;
  exporting: boolean;
  onNew: () => void;
  onSave: () => void;
  onOpenFile: (file: File) => void;
  onImport: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onToggleSnap: () => void;
}

export function Toolbar({
  snap,
  exporting,
  onNew,
  onSave,
  onOpenFile,
  onImport,
  onExport,
  onUndo,
  onRedo,
  onSplit,
  onToggleSnap,
}: Props) {
  return (
    <header className="toolbar" data-testid="toolbar">
      <div className="toolbar-group" data-group="file">
        <span className="toolbar-label">File</span>
        <button type="button" onClick={onNew}>
          New
        </button>
        <label className="file-btn">
          Open
          <input
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="open-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onOpenFile(file);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" onClick={onSave}>
          Save
        </button>
        <button type="button" onClick={onImport}>
          Import
        </button>
        <button type="button" className="primary" onClick={onExport} disabled={exporting}>
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>
      <div className="toolbar-group" data-group="edit">
        <span className="toolbar-label">Edit</span>
        <button type="button" onClick={onUndo}>
          Undo
        </button>
        <button type="button" onClick={onRedo}>
          Redo
        </button>
        <button type="button" onClick={onSplit}>
          Split
        </button>
        <button type="button" className={snap ? "active" : ""} onClick={onToggleSnap}>
          Snap
        </button>
      </div>
      <div className="toolbar-brand">
        <strong>AILEXSI Resonance Studio</strong>
        <span className="version">5.0.0</span>
      </div>
    </header>
  );
}
