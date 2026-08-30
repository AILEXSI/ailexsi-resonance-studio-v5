import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { peaksFromChannel } from "../../src/core/clip-preview";
import { AudioClipWave, VideoClipStrip } from "../../src/ui/timeline/ClipPreview";
import { asset, clip } from "../helpers";

describe("clip preview DOM", () => {
  let host: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
  });

  it("draws a waveform path from fixture samples", () => {
    const samples = new Float32Array(256);
    for (let i = 0; i < samples.length; i += 1) samples[i] = i % 16 === 0 ? 1 : 0.1;
    const peaks = peaksFromChannel(samples, 32);
    const c = clip({ id: "a1", assetId: "wav", trackId: "A1", startMs: 0, durationMs: 1000 });
    const a = asset({ id: "wav", kind: "audio", durationMs: 1000 });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(<AudioClipWave clip={c} asset={a} peaks={peaks} />);
    });
    const path = host.querySelector('[data-testid="clip-wave-a1"] path');
    expect(path).toBeTruthy();
    expect(path!.getAttribute("d") ?? "").toMatch(/^M /);
  });

  it("paints stubbed filmstrip thumbs along the clip", async () => {
    const c = clip({
      id: "v1",
      assetId: "vid",
      trackId: "V1",
      startMs: 0,
      durationMs: 4000,
      sourceInMs: 0,
      sourceOutMs: 4000,
    });
    const a = asset({ id: "vid", kind: "video", durationMs: 4000 });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <VideoClipStrip
          clip={c}
          asset={a}
          clipWidthPx={192}
          fetchFrame={async (timeMs) => `data:image/gif;base64,R0lGODlhAQABAAAAACw=${timeMs}`}
        />,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const strip = host.querySelector('[data-testid="clip-filmstrip-v1"]');
    expect(strip).toBeTruthy();
    expect(strip!.querySelectorAll("img").length).toBe(4);
  });
});
