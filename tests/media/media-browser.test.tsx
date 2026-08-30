import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MediaBrowser } from "../../src/ui/media-browser/MediaBrowser";
import { createEmptyProject } from "../../src/core/project";
import { asset } from "../helpers";

describe("MediaBrowser stills + drag", () => {
  let host: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
  });

  it("accepts image/* and marks items draggable", () => {
    const project = {
      ...createEmptyProject(),
      assets: [asset({ id: "still", kind: "image", name: "still.png", durationMs: 5000 })],
    };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <MediaBrowser
          project={project}
          targetTrackId="V1"
          selectedAssetId={null}
          onSelectAsset={() => undefined}
          onTargetTrack={() => undefined}
          onImport={() => undefined}
          onPlace={() => undefined}
        />,
      );
    });
    const input = host.querySelector('[data-testid="import-input-panel"]') as HTMLInputElement;
    expect(input.accept).toMatch(/image\/*/);
    expect(input.accept).toMatch(/audio\/*/);
    expect(input.accept).toMatch(/video\/*/);
    const item = host.querySelector('[data-testid="media-item-still"]') as HTMLElement;
    expect(item.draggable).toBe(true);
    expect(item.getAttribute("data-asset-kind")).toBe("image");
    expect(host.querySelector('[data-testid="media-search"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="media-kind-filter"]')).toBeTruthy();
  });

  it("kind filter hides non-matching items", () => {
    const project = {
      ...createEmptyProject(),
      assets: [
        asset({ id: "still", kind: "image", name: "still.png", durationMs: 5000 }),
        asset({ id: "bed", kind: "audio", name: "bed.wav" }),
      ],
    };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <MediaBrowser
          project={project}
          targetTrackId="V1"
          selectedAssetId={null}
          onSelectAsset={() => undefined}
          onTargetTrack={() => undefined}
          onImport={() => undefined}
          onPlace={() => undefined}
        />,
      );
    });
    expect(host.querySelector('[data-testid="media-item-still"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="media-item-bed"]')).toBeTruthy();
    act(() => {
      (host!.querySelector('[data-testid="media-kind-audio"]') as HTMLButtonElement).click();
    });
    expect(host.querySelector('[data-testid="media-item-still"]')).toBeNull();
    expect(host.querySelector('[data-testid="media-item-bed"]')).toBeTruthy();
  });
});
