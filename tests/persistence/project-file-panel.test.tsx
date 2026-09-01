import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { statusHasFakePath, type ProjectFileMemory } from "../../src/core/project-file";
import { ProjectFilePanel } from "../../src/ui/project-file/ProjectFilePanel";

describe("project file panel", () => {
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

  it("renders last file name and remembered folder without a fake path", () => {
    const memory: ProjectFileMemory = {
      fileHandle: { name: "Beginagain.resonance.json", kind: "file" },
      directoryHandle: { kind: "directory", name: "Projects" },
      lastFileName: "Beginagain.resonance.json",
      recents: [
        {
          fileHandle: { name: "Beginagain.resonance.json", kind: "file" },
          directoryHandle: { kind: "directory", name: "Projects" },
          lastFileName: "Beginagain.resonance.json",
        },
        {
          fileHandle: { name: "Older.resonance.json", kind: "file" },
          directoryHandle: { kind: "directory", name: "Archive" },
          lastFileName: "Older.resonance.json",
        },
      ],
    };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const opened: string[] = [];
    act(() => {
      root!.render(
        <ProjectFilePanel
          memory={memory}
          fileSystemAccess
          onSave={() => {}}
          onSaveAs={() => {}}
          onOpen={() => {}}
          onChooseFolder={() => {}}
          onOpenRecent={(recent) => {
            opened.push(recent.lastFileName);
          }}
        />,
      );
    });
    const panel = host.querySelector('[data-testid="project-file-panel"]');
    expect(panel).toBeTruthy();
    expect(host.querySelector('[data-testid="project-file-name"]')?.textContent).toBe(
      "Beginagain.resonance.json",
    );
    expect(host.querySelector('[data-testid="project-file-folder"]')?.textContent).toBe("Projects");
    expect(host.querySelector('[data-testid="project-folder-remembered"]')?.textContent).toMatch(
      /gemerkt/,
    );
    const text = panel!.textContent ?? "";
    expect(text).toContain("Projekt");
    expect(text).toContain("Speichern");
    expect(text).toContain("Öffnen");
    expect(statusHasFakePath(text)).toBe(false);
    expect(text).not.toMatch(/C:\\Users/);
    expect(text).not.toMatch(/\/Users\//);

    const recent = host.querySelector('[data-testid="project-recent-Older.resonance.json"]');
    expect(recent).toBeTruthy();
    act(() => {
      (recent as HTMLButtonElement).click();
    });
    expect(opened).toEqual(["Older.resonance.json"]);
  });
});
