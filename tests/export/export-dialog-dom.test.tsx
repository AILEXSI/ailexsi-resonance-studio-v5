import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { applyExportProgress, openExportDialog, succeedExportDialog } from "../../src/core/exporter/dialog";
import { ExportDialog } from "../../src/ui/export/ExportDialog";
import { Toolbar } from "../../src/ui/toolbar/Toolbar";
import "../../src/styles.css";

describe("export dialog DOM", () => {
  let host: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    host = undefined;
    root = undefined;
  });

  it("shows name, size, progress and Abbrechen; cancel does not look like success", () => {
    const cancelled: string[] = [];
    let state = openExportDialog({ fileName: "cut.mp4", width: 1280, height: 720, fps: 30 });
    state = applyExportProgress(state, { percent: 40, stage: "Encoding H.264" });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <ExportDialog state={state} onCancel={() => cancelled.push("cancel")} onClose={() => cancelled.push("close")} />,
      );
    });
    expect(host.querySelector('[data-testid="export-dialog"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="export-dialog-file"]')?.textContent).toContain("cut.mp4");
    expect(host.querySelector('[data-testid="export-dialog-meta"]')?.textContent).toMatch(/1280×720/);
    expect(host.querySelector('[data-testid="export-dialog-status"]')?.textContent).toMatch(/40%/);
    expect(host.querySelector('[data-testid="export-cancel"]')?.textContent).toBe("Abbrechen");
    act(() => {
      (host!.querySelector('[data-testid="export-cancel"]') as HTMLButtonElement).click();
    });
    expect(cancelled).toEqual(["cancel"]);
    act(() => {
      (host!.querySelector('[data-testid="export-dialog-x"]') as HTMLButtonElement).click();
    });
    expect(cancelled).toEqual(["cancel", "cancel"]);
  });

  it("done state shows the output name and Schließen, not Abbrechen", () => {
    const closed: string[] = [];
    const state = succeedExportDialog(
      openExportDialog({ fileName: "cut.mp4", width: 1280, height: 720, fps: 30 }),
      "cut.mp4",
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(<ExportDialog state={state} onCancel={() => closed.push("cancel")} onClose={() => closed.push("close")} />);
    });
    expect(host.querySelector('[data-testid="export-dialog-status"]')?.textContent).toMatch(/Fertig/);
    expect(host.querySelector('[data-testid="export-cancel"]')).toBeNull();
    act(() => {
      (host!.querySelector('[data-testid="export-close"]') as HTMLButtonElement).click();
    });
    expect(closed).toEqual(["close"]);
  });

  it("toolbar Export stays labeled Export (progress lives in the dialog)", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const noop = () => {};
    act(() => {
      root!.render(
        <Toolbar
          snap
          exporting
          onNew={noop}
          onSave={noop}
          onOpen={noop}
          onOpenFile={noop}
          onImport={noop}
          onExport={noop}
          onUndo={noop}
          onRedo={noop}
          onSplit={noop}
          onToggleSnap={noop}
        />,
      );
    });
    const btn = host.querySelector('[data-testid="export-btn"]') as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe("Export");
    expect(btn.disabled).toBe(true);
  });
});
