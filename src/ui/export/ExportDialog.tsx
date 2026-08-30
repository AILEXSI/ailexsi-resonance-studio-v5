import type { ExportDialogState } from "../../core/exporter/dialog";

interface Props {
  state: ExportDialogState;
  onCancel: () => void;
  onClose: () => void;
}

export function ExportDialog({ state, onCancel, onClose }: Props) {
  if (!state.open) return null;
  const running = state.phase === "running";
  const dismiss = running ? onCancel : onClose;
  return (
    <div className="export-dialog-layer" data-testid="export-dialog">
      <div
        className="export-dialog"
        role="dialog"
        aria-modal="false"
        aria-label="Export"
      >
        <header className="export-dialog-head">
          <h2>Export</h2>
          <button
            type="button"
            className="export-dialog-x"
            data-testid="export-dialog-x"
            aria-label={running ? "Abbrechen" : "Schließen"}
            onClick={dismiss}
          >
            ×
          </button>
        </header>
        <p className="export-dialog-file" data-testid="export-dialog-file">
          {state.fileName || "export.mp4"}
        </p>
        <p className="export-dialog-meta" data-testid="export-dialog-meta">
          {state.width}×{state.height} · {state.fps} fps
        </p>
        <div className="export-dialog-bar" aria-hidden="true">
          <div
            className="export-dialog-bar-fill"
            data-testid="export-dialog-bar"
            style={{ width: `${Math.max(0, Math.min(100, state.percent))}%` }}
          />
        </div>
        <p className="export-dialog-status" data-testid="export-dialog-status">
          {state.phase === "done"
            ? `Fertig — ${state.fileName}`
            : state.phase === "aborted"
              ? "Abgebrochen"
              : state.phase === "failed"
                ? (state.error ?? "Export failed")
                : `${state.percent}% · ${state.stage}`}
        </p>
        <footer className="export-dialog-actions">
          {running ? (
            <button type="button" data-testid="export-cancel" onClick={onCancel}>
              Abbrechen
            </button>
          ) : (
            <button type="button" className="primary" data-testid="export-close" onClick={onClose}>
              Schließen
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
