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

  it("is closed by default; Save/Open open it; Esc and outside click close it", async () => {
    await mount();
    expect(host!.querySelector('[data-testid="project-overlay"]')).toBeNull();
    expect(host!.querySelector('[data-testid="project-file-panel"]')).toBeNull();
    expect(host!.querySelector('[data-testid="workspace-preview"]')).toBeTruthy();
    expect(host!.querySelector(".workspace-left")).toBeNull();

    await act(async () => {
      (host!.querySelector("[data-open-project]") as HTMLElement).click();
    });
    expect(host!.querySelector('[data-testid="project-overlay"]')).toBeTruthy();
    expect(host!.querySelector('[data-testid="project-file-panel"]')).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(host!.querySelector('[data-testid="project-overlay"]')).toBeNull();

    await act(async () => {
      (host!.querySelector('[data-testid="save-project"]') as HTMLButtonElement).click();
    });
    expect(host!.querySelector('[data-testid="project-overlay"]')).toBeTruthy();

    await act(async () => {
      (host!.querySelector('[data-testid="project-overlay-backdrop"]') as HTMLElement).click();
    });
    expect(host!.querySelector('[data-testid="project-overlay"]')).toBeNull();
  });
});
