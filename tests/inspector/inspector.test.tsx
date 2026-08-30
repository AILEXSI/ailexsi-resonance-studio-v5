import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Inspector } from "../../src/ui/inspector/Inspector";
import { asset, clip, projectWith } from "../helpers";

describe("inspector selection", () => {
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

  function mount(selectedClipId: string | null, selectedClipIds: string[]) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const project = projectWith(
      [
        clip({ id: "c1", assetId: "a", trackId: "A1", startMs: 0, durationMs: 1000 }),
        clip({ id: "c2", assetId: "a", trackId: "A1", startMs: 1000, durationMs: 500 }),
        clip({ id: "c3", assetId: "a", trackId: "A2", startMs: 0, durationMs: 400 }),
      ],
      [asset({ id: "a", kind: "audio", durationMs: 2000 })],
    );
    act(() => {
      root!.render(
        <Inspector
          project={project}
          selectedClipId={selectedClipId}
          selectedClipIds={selectedClipIds}
          onChange={() => {}}
        />,
      );
    });
  }

  it("shows the clip fields for one selected clip", () => {
    mount("c1", ["c1"]);
    const text = host!.textContent ?? "";
    expect(text).toContain("Start (ms)");
    expect(text).toContain("Fade in (ms)");
    expect(text).toContain("Fade out (ms)");
    expect(text).toContain("Rate");
    expect(host!.querySelector('[data-testid="inspector-rate"]')).toBeTruthy();
    expect(text).not.toContain("3 clips");
    expect(host!.querySelector('[data-testid="inspector-selection-count"]')).toBeNull();
    expect(host!.querySelector('[data-testid="inspector-fade-in"]')).toBeTruthy();
    expect(host!.querySelector('[data-testid="inspector-fade-out"]')).toBeTruthy();
  });

  it("shows only a count when two or more clips are selected", () => {
    mount("c1", ["c1", "c2", "c3"]);
    const count = host!.querySelector('[data-testid="inspector-selection-count"]');
    expect(count?.textContent).toBe("3 clips");
    expect(host!.textContent ?? "").not.toContain("Start (ms)");
    expect(host!.textContent ?? "").not.toContain("Gain");
    expect(host!.textContent ?? "").not.toContain("Fade in (ms)");
    expect(host!.querySelector('[data-testid="inspector-rate"]')).toBeNull();
    expect(host!.querySelector('[data-testid="inspector-fade-in"]')).toBeNull();
  });

  it("shows the empty copy when nothing is selected", () => {
    mount(null, []);
    expect(host!.textContent ?? "").toContain("No clip selected.");
  });
});
