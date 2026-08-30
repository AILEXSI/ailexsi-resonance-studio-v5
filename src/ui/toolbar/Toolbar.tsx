import type { ProductionScreen } from "../../app/screens";
import { ScreenNav } from "../screens/ScreenNav";
import { CLIP_MENU_SHORTCUTS } from "../shortcuts/labels";

interface Props {
  snap: boolean;
  exporting: boolean;
  screen?: ProductionScreen;
  onSelectScreen?: (screen: ProductionScreen) => void;
  onNew: () => void;
  onSave: () => void;
  onOpen: () => void;
  onOpenFile: (file: File) => void;
  onOpenLast?: () => void;
  lastFileName?: string | null;
  fileSystemAccess?: boolean;
  onImport: () => void;
  onMedia?: () => void;
  onExport: () => void;
  onExportWav?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onToggleSnap: () => void;
  projectName?: string;
  onRenameProject?: (name: string) => void;
  projectDirty?: boolean;
  onToggleShortcuts?: () => void;
}

export function Toolbar({
  snap,
  exporting,
  screen = "arrange",
  onSelectScreen,
  onNew,
  onSave,
  onOpen,
  onOpenFile,
  onOpenLast,
  lastFileName,
  fileSystemAccess,
  onImport,
  onMedia,
  onExport,
  onExportWav,
  onUndo,
  onRedo,
  onSplit,
  onToggleSnap,
  projectName = "Untitled Resonance",
  onRenameProject,
  projectDirty = false,
  onToggleShortcuts,
}: Props) {
  return (
    <header className="toolbar" data-testid="toolbar">
      <div className="toolbar-group" data-group="file">
        <span className="toolbar-label">File</span>
        <div className="toolbar-file-row">
        <button type="button" onClick={onNew}>
          New
        </button>
        {fileSystemAccess ? (
          <>
            <button type="button" data-testid="open-fsa" data-open-project onClick={onOpen}>
              Open
            </button>
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
          </>
        ) : (
          <label className="file-btn" data-testid="open-fallback" data-open-project onClick={onOpen}>
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
        )}
        {lastFileName ? (
          <button
            type="button"
            data-testid="open-last"
            title={lastFileName}
            onClick={onOpenLast ?? onOpen}
          >
            Zuletzt geladen
          </button>
        ) : null}
        <button type="button" data-testid="save-project" onClick={onSave}>
          Save
        </button>
        <button type="button" onClick={onImport}>
          Import
        </button>
        <button type="button" data-testid="open-media" onClick={onMedia ?? onSave}>
          Media
        </button>
        <button
          type="button"
          className="primary"
          data-testid="export-btn"
          onClick={onExport}
          disabled={exporting}
        >
          Export
        </button>
        <button
          type="button"
          data-testid="export-wav-btn"
          onClick={onExportWav}
          disabled={exporting}
        >
          Export WAV
        </button>
        <ScreenNav screen={screen} onSelect={onSelectScreen ?? (() => {})} />
        </div>
      </div>
      <div className="toolbar-group" data-group="edit">
        <span className="toolbar-label">Edit</span>
        <button type="button" onClick={onUndo}>
          Undo
        </button>
        <button type="button" onClick={onRedo}>
          Redo
        </button>
        <button type="button" title={`Split (${CLIP_MENU_SHORTCUTS.split})`} onClick={onSplit}>
          Split
          <kbd className="btn-kbd">{CLIP_MENU_SHORTCUTS.split}</kbd>
        </button>
        <button type="button" className={snap ? "active" : ""} onClick={onToggleSnap}>
          Snap
        </button>
        <button
          type="button"
          data-testid="shortcuts-help"
          title="Shortcuts (?)"
          onClick={() => onToggleShortcuts?.()}
        >
          Help
          <kbd className="btn-kbd">?</kbd>
        </button>
      </div>
      <div className="toolbar-brand">
        <input
          className="project-name"
          data-testid="project-name"
          aria-label="Project name"
          key={projectName}
          defaultValue={projectName}
          onBlur={(e) => onRenameProject?.(e.target.value)}
        />
        {projectDirty ? (
          <span
            className="project-dirty"
            data-testid="project-dirty"
            aria-label="Unsaved changes"
            title="Unsaved changes"
          >
            *
          </span>
        ) : null}
        <span className="version">5.0.0</span>
      </div>
    </header>
  );
}
