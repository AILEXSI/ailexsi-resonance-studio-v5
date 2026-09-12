import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import "../../src/styles.css";

describe("Projekt overlay", () => {
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

  async function mount() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<App />);
    });
  }

  it("stays closed; Datei opens the file menu, not the overlay; Arrange stays reachable", async () => {
    await mount();
    expect(host!.querySelector('[data-testid="project-overlay"]')).toBeNull();
    expect(host!.querySelector('[data-testid="project-file-panel"]')).toBeNull();
    expect(host!.querySelector('[data-testid="workspace-preview"]')).toBeTruthy();
    expect(host!.querySelector(".workspace-left")).toBeNull();
    expect(host!.querySelector('[data-testid="timeline"]')).toBeTruthy();

    await act(async () => {
      (host!.querySelector('[data-testid="toolbar-file"]') as HTMLButtonElement).click();
    });
    expect(host!.querySelector('[data-testid="toolbar-file-menu"]')).toBeTruthy();
    expect(host!.querySelector('[data-testid="project-overlay"]')).toBeNull();
    expect(host!.querySelector('[data-testid="project-file-panel"]')).toBeNull();
    expect(host!.querySelector('[data-testid="menu-new"]')?.textContent?.trim()).toBe("Neu");
    expect(host!.querySelector('[data-testid="timeline"]')).toBeTruthy();
  });
});
