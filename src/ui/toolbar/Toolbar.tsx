import type { ProductionScreen } from "../../app/screens";
import { ScreenNav } from "../screens/ScreenNav";
import { CLIP_MENU_SHORTCUTS } from "../shortcuts/labels";

interface Props {
  snap: boolean;
  exporting: boolean;
  screen?: ProductionScreen;
  onSelectScreen?: (screen: ProductionScreen) => void;
  onToggleFile?: () => void;
  filePanelOpen?: boolean;
  onImport: () => void;
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
  onToggleFile,
  filePanelOpen = false,
  onImport,
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
        <button
          type="button"
          data-testid="toolbar-file"
          aria-pressed={filePanelOpen}
          aria-expanded={filePanelOpen}
          onClick={() => onToggleFile?.()}
        >
          File
        </button>
        <div className="toolbar-file-row">
        <button type="button" onClick={onImport}>
          Import
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
