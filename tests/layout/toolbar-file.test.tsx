import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import { Toolbar } from "../../src/ui/toolbar/Toolbar";
import "../../src/styles.css";

function topLevelMenuWords(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLButtonElement>(".menubar > .menu-word, .menubar .menu-root > .menu-word")].map(
    (b) => b.textContent?.replace(/\s+/g, " ").trim() ?? "",
  );
}

describe("toolbar menu (four words)", () => {
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

  it("top bar is Datei | Einfügen | Export | Help — no Export WAV / Undo / Redo / Split / Snap", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const noop = () => {};
    act(() => {
      root!.render(
        <Toolbar
          exporting={false}
          onImport={noop}
          onExport={noop}
          onExportWav={noop}
        />,
      );
    });
    expect(topLevelMenuWords(host)).toEqual(["Datei", "Einfügen", "Export", "Help"]);
    const barText = host.querySelector("[data-testid=menubar]")?.textContent ?? "";
    expect(barText).toMatch(/Datei\s*\|\s*Einfügen\s*\|\s*Export\s*\|\s*Help/);
    const top = [...host.querySelectorAll<HTMLButtonElement>(".menubar button")].filter(
      (b) => !b.closest(".menu-panel"),
    );
    const topLabels = top.map((b) => b.textContent?.replace(/\s+/g, " ").trim());
    expect(topLabels).not.toContain("File");
    expect(topLabels).not.toContain("Import");
    expect(topLabels).not.toContain("Export WAV");
    expect(topLabels).not.toContain("Undo");
    expect(topLabels).not.toContain("Redo");
    expect(topLabels).not.toContain("Split");
    expect(topLabels).not.toContain("Snap");
    expect(host.querySelector('[data-testid="export-wav-btn"]')).toBeNull();
    expect(host.querySelector(".version")?.textContent).toBe("5.0.0");
    const datei = host.querySelector('[data-testid="toolbar-file"]') as HTMLButtonElement;
    const chip = getComputedStyle(datei);
    expect(chip.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(chip.borderStyle).not.toBe("none");
    expect(datei.classList.contains("menu-word")).toBe(true);
  });

  it("Datei dropdown has Neu, Öffnen, Speichern, Speichern unter, Beenden", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const seen: string[] = [];
    act(() => {
      root!.render(
        <Toolbar
          exporting={false}
          onNew={() => seen.push("new")}
          onOpen={() => seen.push("open")}
          onSave={() => seen.push("save")}
          onSaveAs={() => seen.push("saveAs")}
          onQuit={() => seen.push("quit")}
          onImport={() => seen.push("import")}
          onExport={() => seen.push("export")}
        />,
      );
    });
    act(() => {
      (host!.querySelector('[data-testid="toolbar-file"]') as HTMLButtonElement).click();
    });
    const menu = host.querySelector('[data-testid="toolbar-file-menu"]');
    expect(menu).toBeTruthy();
    const items = [...(menu?.querySelectorAll("button") ?? [])].map((b) => b.textContent?.trim());
    expect(items).toEqual(["Neu", "Öffnen", "Speichern", "Speichern unter", "Beenden"]);
    act(() => {
      (host!.querySelector('[data-testid="menu-save"]') as HTMLButtonElement).click();
    });
    expect(seen).toEqual(["save"]);
    expect(host.querySelector('[data-testid="toolbar-file-menu"]')).toBeNull();
  });

  it("Einfügen is Import; Export dropdown opens existing MP4 / WAV actions", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const seen: string[] = [];
    act(() => {
      root!.render(
        <Toolbar
          exporting={false}
          onImport={() => seen.push("import")}
          onExport={() => seen.push("mp4")}
          onExportWav={() => seen.push("wav")}
        />,
      );
    });
    act(() => {
      (host!.querySelector('[data-testid="toolbar-import"]') as HTMLButtonElement).click();
    });
    expect(seen).toEqual(["import"]);

    act(() => {
      (host!.querySelector('[data-testid="export-btn"]') as HTMLButtonElement).click();
    });
    const exportMenu = host.querySelector('[data-testid="export-btn-menu"]');
    expect(exportMenu?.querySelector('[data-testid="export-mp4-item"]')?.textContent?.trim()).toBe(
      "Video (MP4)…",
    );
    expect(exportMenu?.querySelector('[data-testid="export-wav-btn"]')?.textContent?.trim()).toBe(
      "Audio (WAV)…",
    );
    act(() => {
      (host!.querySelector('[data-testid="export-mp4-item"]') as HTMLButtonElement).click();
    });
    expect(seen).toEqual(["import", "mp4"]);

    act(() => {
      (host!.querySelector('[data-testid="export-btn"]') as HTMLButtonElement).click();
    });
    act(() => {
      (host!.querySelector('[data-testid="export-wav-btn"]') as HTMLButtonElement).click();
    });
    expect(seen).toEqual(["import", "mp4", "wav"]);
  });

  it("App wires Datei actions; Datei does not open the project overlay", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<App />);
    });
    expect(topLevelMenuWords(host)).toEqual(["Datei", "Einfügen", "Export", "Help"]);
    expect(host.querySelector('[data-testid="project-overlay"]')).toBeNull();

    await act(async () => {
      (host!.querySelector('[data-testid="toolbar-file"]') as HTMLButtonElement).click();
    });
    expect(host.querySelector('[data-testid="toolbar-file-menu"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="project-overlay"]')).toBeNull();
    expect(host.querySelector('[data-testid="menu-new"]')?.textContent?.trim()).toBe("Neu");
    expect(host.querySelector('[data-testid="menu-open"]')?.textContent?.trim()).toBe("Öffnen");
    expect(host.querySelector('[data-testid="menu-save"]')?.textContent?.trim()).toBe("Speichern");
    expect(host.querySelector('[data-testid="menu-save-as"]')?.textContent?.trim()).toBe("Speichern unter");
    expect(host.querySelector('[data-testid="menu-quit"]')?.textContent?.trim()).toBe("Beenden");

    await act(async () => {
      (host!.querySelector('[data-testid="menu-quit"]') as HTMLButtonElement).click();
    });
    expect(host.querySelector('[data-testid="status"]')?.textContent).toMatch(/Beenden/);

    const transport = host.querySelector("[data-testid=transport]");
    expect(transport?.querySelector('[data-testid="transport-snap"]')?.textContent?.trim()).toBe("Snap");
    expect(transport?.querySelector('[data-testid="transport-undo"]')).toBeTruthy();
    expect(transport?.querySelector('[data-testid="transport-redo"]')).toBeTruthy();
    const transportTextButtons = [...(transport?.querySelectorAll("button") ?? [])].map((b) =>
      b.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(transportTextButtons).not.toContain("Undo");
    expect(transportTextButtons).not.toContain("Redo");
  });

  it("Datei Speichern / Öffnen call the existing FSA pickers", async () => {
    const saved: string[] = [];
    const opened: string[] = [];
    const w = window as unknown as {
      showSaveFilePicker?: (opts: { suggestedName?: string }) => Promise<{
        name: string;
        createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
      }>;
      showOpenFilePicker?: () => Promise<
        Array<{ name: string; getFile: () => Promise<File> }>
      >;
    };
    w.showSaveFilePicker = async (opts) => {
      saved.push(opts.suggestedName ?? "save");
      return {
        name: "cut.resonance.json",
        createWritable: async () => ({
          write: async () => {},
          close: async () => {},
        }),
      };
    };
    w.showOpenFilePicker = async () => {
      opened.push("open");
      return [
        {
          name: "cut.resonance.json",
          getFile: async () => new File([`{"name":"cut"}`], "cut.resonance.json", { type: "application/json" }),
        },
      ];
    };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<App />);
    });
    await act(async () => {
      (host!.querySelector('[data-testid="toolbar-file"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (host!.querySelector('[data-testid="menu-save"]') as HTMLButtonElement).click();
    });
    expect(saved.length).toBe(1);

    await act(async () => {
      (host!.querySelector('[data-testid="toolbar-file"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (host!.querySelector('[data-testid="menu-open"]') as HTMLButtonElement).click();
    });
    expect(opened).toEqual(["open"]);
    delete w.showSaveFilePicker;
    delete w.showOpenFilePicker;
  });
});
