import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { Toolbar } from "../../src/ui/toolbar/Toolbar";
import "../../src/styles.css";

describe("toolbar File button", () => {
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

  it("File is one button; New/Open/Save are not in the file group", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const noop = () => {};
    act(() => {
      root!.render(
        <Toolbar
          snap
          exporting={false}
          onToggleFile={noop}
          onImport={noop}
          onExport={noop}
          onExportWav={noop}
          onUndo={noop}
          onRedo={noop}
          onSplit={noop}
          onToggleSnap={noop}
        />,
      );
    });
    const group = host.querySelector("[data-group=file]");
    expect(group).toBeTruthy();
    expect(group?.querySelector('[data-testid="toolbar-file"]')?.textContent?.trim()).toBe("File");
    const labels = [...(group?.querySelectorAll("button") ?? [])].map((b) => b.textContent?.replace(/\s+/g, " ").trim());
    expect(labels).toContain("File");
    expect(labels).toContain("Import");
    expect(labels).not.toContain("Media");
    expect(labels).toContain("Export");
    expect(labels).toContain("Export WAV");
    expect(labels).not.toContain("New");
    expect(labels).not.toContain("Open");
    expect(labels).not.toContain("Save");
    expect(labels).not.toContain("Speichern");
    expect(labels).not.toContain("Öffnen");
    expect(labels).not.toContain("Zuletzt");
    expect(labels).not.toContain("Revert");
    expect(group?.querySelector('[data-testid="open-fsa"]')).toBeNull();
    expect(group?.querySelector('[data-testid="save-project"]')).toBeNull();
    expect(group?.querySelector('[data-testid="open-input"]')).toBeNull();
    expect(group?.querySelector('[data-testid="revert-project"]')).toBeNull();
    expect(group?.querySelector('[data-testid="open-media"]')).toBeNull();
    expect(host.querySelector(".version")?.textContent).toBe("5.0.0");
  });

  it("File toggles the project panel; Import stays in the toolbar", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<App />);
    });
    const group = host.querySelector("[data-group=file]");
    expect(group?.querySelector('[data-testid="toolbar-file"]')).toBeTruthy();
    const groupText = group?.textContent ?? "";
    expect(groupText).toMatch(/Import/);
    expect(groupText).not.toMatch(/\bNew\b/);
    expect(groupText).not.toMatch(/\bOpen\b/);
    expect(groupText).not.toMatch(/\bSave\b/);

    await act(async () => {
      (host!.querySelector('[data-testid="toolbar-file"]') as HTMLButtonElement).click();
    });
    const panel = host.querySelector('[data-testid="project-file-panel"]');
    expect(panel).toBeTruthy();
    expect(panel?.querySelector('[data-testid="project-new"]')?.textContent?.trim()).toBe("New");
    expect(panel?.querySelector('[data-testid="save-project"]')).toBeTruthy();
    expect(panel?.querySelector('[data-testid="open-fsa"]')).toBeTruthy();
    expect(panel?.querySelector('[data-testid="open-input"]')).toBeTruthy();
    expect(group?.contains(panel)).toBe(false);
  });
});
