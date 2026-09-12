import { useEffect, useRef, useState } from "react";
import type { ProductionScreen } from "../../app/screens";
import { ScreenNav } from "../screens/ScreenNav";

interface Props {
  exporting: boolean;
  screen?: ProductionScreen;
  onSelectScreen?: (screen: ProductionScreen) => void;
  onToggleFile?: () => void;
  filePanelOpen?: boolean;
  onImport: () => void;
  onExport: () => void;
  onExportWav?: () => void;
  projectName?: string;
  onRenameProject?: (name: string) => void;
  projectDirty?: boolean;
  onToggleShortcuts?: () => void;
}

function ExportMenu({
  open,
  disabled,
  onToggle,
  onExport,
  onExportWav,
}: {
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onExport: () => void;
  onExportWav?: () => void;
}) {
  return (
    <div className="menu-root" data-menu="export">
      <button
        type="button"
        className={open ? "menu-word active" : "menu-word"}
        data-testid="export-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={onToggle}
      >
        Export
      </button>
      {open ? (
        <div className="menu-panel" role="menu" data-testid="export-btn-menu">
          <button
            type="button"
            role="menuitem"
            data-testid="export-mp4-item"
            disabled={disabled}
            onClick={onExport}
          >
            Video (MP4)…
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="export-wav-btn"
            disabled={disabled}
            onClick={onExportWav}
          >
            Audio (WAV)…
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Toolbar({
  exporting,
  screen = "arrange",
  onSelectScreen,
  onToggleFile,
  filePanelOpen = false,
  onImport,
  onExport,
  onExportWav,
  projectName = "Untitled Resonance",
  onRenameProject,
  projectDirty = false,
  onToggleShortcuts,
}: Props) {
  const [exportOpen, setExportOpen] = useState(false);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const onDoc = (e: PointerEvent) => {
      if (barRef.current?.contains(e.target as Node)) return;
      setExportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExportOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [exportOpen]);

  const runExport = (fn?: () => void) => {
    fn?.();
    setExportOpen(false);
  };

  return (
    <header className="toolbar" data-testid="toolbar" ref={barRef}>
      <nav className="menubar" data-testid="menubar" aria-label="Menü">
        <button
          type="button"
          className={filePanelOpen ? "menu-word active" : "menu-word"}
          data-testid="toolbar-file"
          aria-pressed={filePanelOpen}
          aria-expanded={filePanelOpen}
          onClick={() => onToggleFile?.()}
        >
          Datei
        </button>
        <span className="menu-sep" aria-hidden="true">
          |
        </span>
        <button type="button" className="menu-word" data-testid="toolbar-import" onClick={onImport}>
          Einfügen
        </button>
        <span className="menu-sep" aria-hidden="true">
          |
        </span>
        <ExportMenu
          open={exportOpen}
          disabled={exporting}
          onToggle={() => setExportOpen((open) => !open)}
          onExport={() => runExport(onExport)}
          onExportWav={() => runExport(onExportWav)}
        />
        <span className="menu-sep" aria-hidden="true">
          |
        </span>
        <button
          type="button"
          className="menu-word"
          data-testid="shortcuts-help"
          title="Shortcuts (?)"
          onClick={() => onToggleShortcuts?.()}
        >
          Help
        </button>
      </nav>
      <ScreenNav screen={screen} onSelect={onSelectScreen ?? (() => {})} />
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
