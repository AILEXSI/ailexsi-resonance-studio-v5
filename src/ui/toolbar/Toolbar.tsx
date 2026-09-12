import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ProductionScreen } from "../../app/screens";
import { ScreenNav } from "../screens/ScreenNav";

type OpenMenu = "datei" | "export" | null;

interface Props {
  exporting: boolean;
  screen?: ProductionScreen;
  onSelectScreen?: (screen: ProductionScreen) => void;
  onNew?: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onQuit?: () => void;
  onImport: () => void;
  onExport: () => void;
  onExportWav?: () => void;
  projectName?: string;
  onRenameProject?: (name: string) => void;
  projectDirty?: boolean;
  onToggleShortcuts?: () => void;
}

function Menu({
  menuId,
  label,
  testId,
  open,
  disabled,
  onToggle,
  children,
}: {
  menuId: Exclude<OpenMenu, null>;
  label: string;
  testId: string;
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="menu-root" data-menu={menuId}>
      <button
        type="button"
        className="menu-word"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={onToggle}
      >
        {label}
      </button>
      {open ? (
        <div className="menu-panel" role="menu" data-testid={`${testId}-menu`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function Toolbar({
  exporting,
  screen = "arrange",
  onSelectScreen,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onQuit,
  onImport,
  onExport,
  onExportWav,
  projectName = "Untitled Resonance",
  onRenameProject,
  projectDirty = false,
  onToggleShortcuts,
}: Props) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDoc = (e: PointerEvent) => {
      if (barRef.current?.contains(e.target as Node)) return;
      setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const close = () => setOpenMenu(null);
  const toggle = (id: Exclude<OpenMenu, null>) => setOpenMenu((cur) => (cur === id ? null : id));
  const run = (fn?: () => void) => {
    close();
    fn?.();
  };

  return (
    <header className="toolbar" data-testid="toolbar" ref={barRef}>
      <nav className="menubar" data-testid="menubar" aria-label="Menü">
        <Menu
          menuId="datei"
          label="Datei"
          testId="toolbar-file"
          open={openMenu === "datei"}
          onToggle={() => toggle("datei")}
        >
          <button type="button" role="menuitem" data-testid="menu-new" onClick={() => run(onNew)}>
            Neu
          </button>
          <button type="button" role="menuitem" data-testid="menu-open" onClick={() => run(onOpen)}>
            Öffnen
          </button>
          <button type="button" role="menuitem" data-testid="menu-save" onClick={() => run(onSave)}>
            Speichern
          </button>
          <button type="button" role="menuitem" data-testid="menu-save-as" onClick={() => run(onSaveAs)}>
            Speichern unter
          </button>
          <button type="button" role="menuitem" data-testid="menu-quit" onClick={() => run(onQuit)}>
            Beenden
          </button>
        </Menu>
        <span className="menu-sep" aria-hidden="true">
          |
        </span>
        <button type="button" className="menu-word" data-testid="toolbar-import" onClick={onImport}>
          Einfügen
        </button>
        <span className="menu-sep" aria-hidden="true">
          |
        </span>
        <Menu
          menuId="export"
          label="Export"
          testId="export-btn"
          open={openMenu === "export"}
          disabled={exporting}
          onToggle={() => toggle("export")}
        >
          <button
            type="button"
            role="menuitem"
            data-testid="export-mp4-item"
            disabled={exporting}
            onClick={() => run(onExport)}
          >
            Video (MP4)…
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="export-wav-btn"
            disabled={exporting}
            onClick={() => run(onExportWav)}
          >
            Audio (WAV)…
          </button>
        </Menu>
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
